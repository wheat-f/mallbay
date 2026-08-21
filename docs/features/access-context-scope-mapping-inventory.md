# AccessContext Scope Mapping 与 Endpoint 响应契约清单

## 1. 清单目的与基线

本清单关闭 AccessContext 深化 PRD 的两个 S0：

1. 为受保护资源声明门店、owner、来源门店和执行门店的规范解析方式。
2. 为无门店查询、详情/写入范围解析失败和跨门店校验声明稳定响应契约。

清单基线来源为 `apps/api/src/**/**.controller.ts` 的 controller route annotations，基线日期为 2026-08-22。除 `PUBLIC`、`SYSTEM` 明确标记的 route 外，所有 route 都必须有一个 scope contract；route 只有在资源字段、授权检查和失败响应完全相同的前提下才允许合并。

## 2. 稳定响应契约

### 2.1 Contract IDs

| Contract ID | 适用场景 | 无门店范围 | 范围解析失败 | 显式目标越权 |
|---|---|---|---|---|
| `LIST-SCOPE-01` | 列表、搜索、候选、预览、汇总 | `200`，保持原 envelope；集合为空、分页 total 为 0 | `403 SCOPE_UNRESOLVED` | `403 STORE_OUT_OF_SCOPE` |
| `EXPORT-SCOPE-01` | 导出 | `200` 空文件，保留格式、表头和响应头 | `403 SCOPE_UNRESOLVED` | `403 STORE_OUT_OF_SCOPE` |
| `DETAIL-SCOPE-01` | 详情、子资源详情、lookup | 不适用 | `403 SCOPE_UNRESOLVED` | `403 STORE_OUT_OF_SCOPE` 或 `403 OWNER_OUT_OF_SCOPE` |
| `WRITE-SCOPE-01` | 创建、更新、删除、状态动作 | 不适用；缺少必要门店也视为解析失败 | `403 SCOPE_UNRESOLVED`，且无副作用 | `403 STORE_OUT_OF_SCOPE` 或 `403 OWNER_OUT_OF_SCOPE` |
| `CROSS-STORE-01` | 来源门店/执行门店同时出现 | 无可见范围时按 `LIST-SCOPE-01` | 任一门店无法解析时 `403 SCOPE_UNRESOLVED` | 任一门店越权时 `403 STORE_OUT_OF_SCOPE`，整请求失败 |
| `SELF-SCOPE-01` | 个人资料、会话、本人通知 | 只返回当前主体数据；不接受任意 owner | 无法解析当前主体时 `403 SCOPE_UNRESOLVED` | 非本人目标 `403 OWNER_OUT_OF_SCOPE` |
| `GLOBAL-SCOPE-01` | 权限策略、总部目录、系统能力 | 不适用；没有总部能力直接 `403 ACCESS_DENIED` | `403 SCOPE_UNRESOLVED` | `403 ACCESS_DENIED` |
| `PUBLIC-00` | 登录、公开密钥、健康检查 | 不经过 AccessContext | 不适用 | 不适用 |
| `SYSTEM-00` | 内部指标、后台任务 | 由 system principal 或内部网络策略保护 | `403 SCOPE_UNRESOLVED` | `403 ACCESS_DENIED` |

### 2.2 错误 envelope

所有受保护 endpoint 的拒绝响应使用统一结构；业务 message 可以本地化，但 `code` 必须稳定：

```json
{
  "code": "STORE_OUT_OF_SCOPE",
  "message": "无权限访问该资源",
  "requestId": "request-id"
}
```

允许的 code：`ACCESS_DENIED`、`STORE_OUT_OF_SCOPE`、`OWNER_OUT_OF_SCOPE`、`SCOPE_UNRESOLVED`、`RESOURCE_NOT_FOUND`。批量 endpoint 在任一项失败时整批失败且不产生部分副作用。

### 2.3 范围解析顺序

1. 从请求 DTO、query 或 route 参数读取显式门店；显式值不在访问范围时直接返回 `STORE_OUT_OF_SCOPE`。
2. 没有显式门店时，从父资源或目标资源读取最小路由字段：`id`、规范门店字段、owner 字段。
3. 资源不存在返回 `404 RESOURCE_NOT_FOUND`。
4. 资源存在但规范字段缺失或来源/执行门店无法确定，返回 `403 SCOPE_UNRESOLVED`。
5. 通过 AccessContext 取得 facts 后，业务 module 执行自己的查询、状态和事务逻辑；AccessContext 不生成 Prisma `where`。

## 3. 资源 Scope Mapping

| 资源域 | capability | 规范门店来源 | owner 来源 | 列表过滤 | 详情校验 | 写入校验 | 跨门店/特殊规则 |
|---|---|---|---|---|---|---|---|
| stores | `stores` | 目标 store `id`；总部目录无门店 | 无；本人资料走 `SELF_SCOPE-01` | `global` 或 `storeIds` | 先取 store `id` 和状态 | 目标 store `id` | `admin/*` 使用 `GLOBAL-SCOPE-01` |
| users | `users` | 用户的 store membership 关系 | 当前 `userId` | 管理查询按 membership；个人接口只取当前 user | 目标 user membership/身份 | 个人写入走 self；管理写入走组织能力 | 不从 `isAuditor` 推断总部 |
| members | `members` | route `storeId` 或 member `storeId` | member `userId` 仅作对象身份 | `storeIds` 过滤 | 校验 store 与 member 一致 | invite/remove/role change 先校验 store | invitation 接受/拒绝走 `SELF_SCOPE-01` |
| customers | `customers` | customer `storeId` | customer `ownerUserId` | `storeIds`；OWN 时叠加 `ownerUserId=当前主体` | 先取 `storeId, ownerUserId` | DTO store 与 customer/父资源一致 | vehicle/note/tag 继承 customer 范围 |
| orders | `orders` | order `storeId` | `salesPersonId` 仅在销售 OWN 能力下使用 | `storeIds`；销售 OWN 叠加销售人 | 先取 order `storeId,salesPersonId` | 创建取 DTO store；子动作继承 order | payment-account 独立按其 `storeId` |
| sales-quotes | `sales-quotes` | quote `storeId` | quote 销售负责人字段，如无则不启用 OWN | `storeIds` | 先取 quote 门店 | 创建必须显式 store 或从客户/父资源解析 | 转订单必须同时校验 quote 与目标订单门店 |
| after-sales | `after-sales` | after-sale `storeId`（通常继承 order） | assignment worker 不是默认 owner | `storeIds` | 先取 after-sale `storeId` | 所有 assign/evidence/cost/close 继承父资源 | worker 能力另做 action 判断 |
| returns | `returns` | sales/purchase return `storeId` | 无默认 owner | `storeIds` | 先取 return 门店 | 所有状态动作继承 return 门店 | purchase return 关联采购单也需校验关联资源 |
| warranties | `warranties` | warranty `storeId` 或关联 order 门店 | 无默认 owner | `storeIds` | 先取 warranty/order 门店 | 创建/状态操作继承门店 | lookup 仍按可见门店过滤 |
| products | `products` | product 归属/发布 `storeId`；总部模板显式 global | 无 | `storeIds` 或 global | 先取 product scope | 创建/更新目标 scope 明确；建议价使用 `suggested-price-write` 独立 action | 采购可维护产品主数据但不能写建议价；不以供应商或创建人充当门店 |
| pricing | `pricing` | template/rule-set/service item 自身 `storeId` | 无 | `storeIds`；HQ 模板走 global | 先取配置 scope | rollout/copy-to-store 同时校验源与目标 | source/target 使用 `CROSS-STORE-01` |
| rebates | `rebates` | rebate `storeId` | 只有业务明确的受益人字段才启用 OWN | `storeIds` | 先取 rebate 门店 | apply/review/pay 继承 rebate 门店 | 客服本店 apply；销售 apply 叠加 owner；不用 createdBy 代替 owner |
| commissions | `commissions` | commission rule/record `storeId` | record worker/sales 只在对应能力下使用 | `storeIds` | 先取记录门店 | sales/worker 写入继承订单或 record 门店 | 订单门店与记录门店必须一致 |
| purchases | `purchases` | purchase requirement/order/receipt `storeId` | 无默认 owner | `storeIds` | 先取采购资源门店 | approve/cancel/receive 继承父订单 | supplier 是关联对象，不是 scope |
| inventory | `inventory` | warehouse/batch/movement/purchase order `storeId` | 无默认 owner | `storeIds` | 先取库存路由字段 | allocation/outbound/release 继承订单/库存门店 | 关联采购单、订单分别校验 |
| construction | `construction` | 普通资源 `storeId`；跨店任务分别为 `sourceStoreId`、`executionStoreId` | `assignedWorkerId` 只表示执行人关系 | `storeIds` | 先取所有所需门店 | 跨店动作先双校验，再事务执行 | 任一来源/执行门店失败整请求失败 |
| finance | `finance` | expense/reimbursement/payment `storeId` | 申请人不是默认 owner | `storeIds` | 先取财务资源门店 | review/withdraw/pay 继承父资源 | attachment 继承 application 门店 |
| invoices | `finance` | invoice `storeId`，订单开票要求订单门店一致 | `salesPersonId` 仅销售读取场景 | `storeIds` | 先取 invoice 门店 | issue/void/reissue/send 继承发票门店 | 多订单开票先校验同店 |
| customer-settlements（customer statements/receipts） | `finance` | statement/receipt `storeId` | customer `ownerUserId` 仅用于客户读取 | `storeIds` | 先取账单/收款门店 | confirm/void/reverse 继承父资源 | customer 与账单门店必须一致 |
| reports | `reports` | query 解析为 `storeIds`；总部汇总显式 global | 无 | 无 `storeId` 时按 facts 过滤聚合 | 不暴露不可见门店维度 | export 与 summary 分别使用 export/list contract | 无可见门店返回 0/空集合 |
| settings | `settings` | dictionary/config/OSS 等 `storeId`；HQ template 无门店 | 无 | `storeIds` 或 global | 先取配置 scope | 写入必须显式目标 scope | `GLOBAL-SCOPE-01` 与 `STORE_LIST` 分开 |
| notifications | `notifications` | 通知 recipient/target store（如有） | recipient `userId` | 只取当前主体可见通知 | 先取通知 recipient | read/read-all 仅当前主体 | 不接受任意 userId |
| permissions/auth | `permissions` | policy/role/binding 属于权限控制平面 | `userId` | global 管理范围 | 先取目标 binding/policy | 管理 mutation 使用 `GLOBAL-SCOPE-01` | `/auth/me/*` 使用 `SELF-SCOPE-01` |

## 4. Endpoint Inventory

说明：以下 route group 只在同一资源字段、同一 scope class、同一 no-store 和 unresolved contract 下合并。`DONE` 表示该 route group 已完成 AccessContext 迁移并有对应回归证据。

| Controller / route group | capability/action | scope class | 规范范围来源 | contract | 状态 |
|---|---|---|---|---|---|
| `GET /health`、`GET /auth/public-key`、`POST /auth/register`、`POST /auth/login`、`POST /auth/wechat-login`、`POST /auth/refresh` | public | `PUBLIC` | 无 | `PUBLIC-00` | `PUBLIC` |
| `GET /auth/me`、`POST /auth/logout`、`GET /auth/sessions`、`DELETE /auth/sessions/:id` | auth/read、auth/revoke | `SELF_ONLY` | 当前 user/session | `SELF-SCOPE-01` | `MIGRATION_PENDING` |
| `GET /auth/me/permissions` | permissions/read | `SELF_ONLY` | 当前 user | `SELF-SCOPE-01` | `MIGRATION_PENDING` |
| `GET /permissions/catalog`、`GET /permissions/definitions`、`GET /permissions/roles`、`GET /roles`、`GET /permissions/policy`、`GET /permission-policy-versions/current` | permissions/read | `GLOBAL_ONLY` | 权限控制平面 | `GLOBAL-SCOPE-01` | `MIGRATION_PENDING` |
| `POST /permissions/roles`、`POST /roles`、`POST /permissions/roles/:id/disable`、`POST /roles/:id/disable` | permissions/create/update | `GLOBAL_ONLY` | 权限控制平面 | `WRITE-SCOPE-01` + `GLOBAL-SCOPE-01` | `MIGRATION_PENDING` |
| `GET/POST /permissions/role-bindings`、`GET/POST /users/:userId/role-bindings`、`PATCH /users/:userId/role-bindings/:bindingId`、`POST /permissions/role-bindings/:id/disable` | permissions/read/create/update/disable | `GLOBAL_ONLY` | target user binding | `WRITE-SCOPE-01` + `GLOBAL-SCOPE-01` | `MIGRATION_PENDING` |
| `POST /permissions/policy/drafts`、`POST /permission-policy-versions`、`POST /permissions/policy/:id/{validate,publish,rollback}`、对应 alias route | permissions/create/validate/publish/rollback | `GLOBAL_ONLY` | policy version | `WRITE-SCOPE-01` + `GLOBAL-SCOPE-01` | `MIGRATION_PENDING` |
| `GET/POST /stores`、`GET /stores/:id`、`GET /stores/workbench/:id`、`GET /stores/:id/eligible-execution-stores` | stores/read/create | `STORE_LIST` / `CROSS_STORE` | store id；eligible execution stores 为 source/target | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`CROSS-STORE-01` | `MIGRATION_PENDING` |
| `/stores/admin/*`、`POST /stores/:id/{submit}`、`POST /stores/submissions/:submissionId/review`、`PATCH /stores/:id/{freeze,unfreeze,manager}`、`POST /stores/:id/photos/upload` | stores/admin/update/review | `GLOBAL_ONLY` 或目标 store | route/target store | `WRITE-SCOPE-01`、`GLOBAL-SCOPE-01` | `MIGRATION_PENDING` |
| `PATCH /users/profile`、`POST /users/avatar`、`PATCH /users/password`、`POST /users/bind/{email,phone,wechat,alipay}` | users/self/update | `SELF_ONLY` | 当前 user | `SELF-SCOPE-01` | `MIGRATION_PENDING` |
| `GET /users/search`、`POST /users/reset-password` | users/read/update | `STORE_LIST` 或组织管理 | user membership | `LIST-SCOPE-01` / `WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/stores/:storeId/members/*`、`GET /members/invitations`、`POST /members/invitations/:id/{accept,reject}` | members/read/invite/remove/accept | `STORE_LIST` / `SELF_ONLY` | route storeId/member storeId | `LIST-SCOPE-01`、`WRITE-SCOPE-01`、`SELF-SCOPE-01` | `MIGRATION_PENDING` |
| `/settings/*`（capabilities、summary、audit、config-versions、dictionaries、dictionary-governance、dictionary-templates、OSS、migration-reviews） | settings/read/create/update/validate/publish/export | `GLOBAL_ONLY` 或 `STORE_LIST` | config/dictionary `storeId`；HQ template global | `LIST-SCOPE-01`、`EXPORT-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/customers`、`/customers/search`、`/customers/:id`、`/customers/:id/order-context` | customers/read/create | `STORE_LIST` + optional `OWNER_RESOURCE` | customer `storeId,ownerUserId` | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/customers/:id` patch、`/customers/vehicles*`、`/customers/notes`、`/customers/tags*` | customers/update/create/delete | inherited customer scope | parent customer or vehicle relation | `DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/orders`、`GET /orders/export-details`、`GET /orders/lifecycle/batch`、`GET /orders/historical-verification`、`POST /orders/lifecycle/client-events` | orders/read/create/export/client-event | `STORE_LIST` | order `storeId`；sales OWN 可叠加 salesperson | `LIST-SCOPE-01`、`EXPORT-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/orders/:id`、`/orders/:id/{audit-events,lifecycle}`、`/orders/:id/*` actions、`/payment-accounts/*` | orders/payment-account/read/write | `RESOURCE_DETAIL` / `STORE_LIST` | order/payment account `storeId` | `DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/sales-quotes`、`/sales-quotes/export-details`、`/sales-quotes/:id/*` | sales-quotes/read/create/submit/approve/reject/convert | `STORE_LIST` / `RESOURCE_DETAIL` | quote `storeId` | `LIST-SCOPE-01`、`EXPORT-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/after-sales`、`/after-sales/:id`、`/after-sales/:id/{assign,responsibility,evidence,photos,close,costs}`、`/after-sales/:id/costs/:costId/reverse` | after-sales/read/create/update/assign/reverse | `STORE_LIST` / inherited detail | after-sale `storeId` | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/returns/{sales-returns,purchase-returns}` 及其 `:id/*` | returns/read/create/submit/approve/receive/settle/refund/cancel | `STORE_LIST` / inherited detail | return `storeId` | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/warranties`、`/warranties/lookup`、`/warranties/:id` | warranties/read/lookup | `STORE_LIST` / `RESOURCE_DETAIL` | warranty/order `storeId` | `LIST-SCOPE-01`、`DETAIL-SCOPE-01` | `MIGRATION_PENDING` |
| `/products`、`/products/:id`、`/products/:id/*` | products/read/create/update/delete | `STORE_LIST` / `RESOURCE_DETAIL` | product scope | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/pricing/*` | pricing/read/create/update/publish/rollout/simulate/export | `STORE_LIST` / `GLOBAL_ONLY` / `CROSS_STORE` | rule/template source/target store | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01`、`CROSS-STORE-01` | `MIGRATION_PENDING` |
| `/rebates`、`/rebates/:id/{review,pay}`、`/commissions/*` | rebates/commissions/read/create/review/pay/write | `STORE_LIST` / inherited detail | resource `storeId` | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/purchases/*` | purchases/read/create/update/approve/cancel/receive/export | `STORE_LIST` / inherited detail | purchase resource `storeId` | `LIST-SCOPE-01`、`EXPORT-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/inventory/*` | inventory/read/create/update/allocate/outbound/release | `STORE_LIST` / inherited detail | warehouse/batch/movement/order `storeId` | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/construction/cross-store/*` | construction/read/accept/reject/cancel/submit/execute | `CROSS_STORE` | `sourceStoreId` + `executionStoreId` | `CROSS-STORE-01` | `MIGRATION_PENDING` |
| `/construction/cost-settlements*`、`/construction/cost-adjustments*`、`/construction/orders/:orderId/cost-comparison` | construction-cost/read/export/declaration/confirm/approve/settle | `STORE_LIST` / detail | settlement/order `storeId` | `LIST-SCOPE-01`、`EXPORT-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/construction/capacities*`、`/construction/assignments`、`/construction/fulfillments`、`/construction/orders/:orderId/*`、`/construction/records/:recordId/*` | construction/read/create/update/assign/execute | `STORE_LIST` / inherited detail | order/record/worker `storeId` | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/construction/workers*`、`/construction/leaves*`、`/construction/schedules*`、`/construction/offline-sync` | construction-worker/read/write/sync | `STORE_LIST` / `SELF_ONLY` for worker self | worker/leave/schedule `storeId` | `LIST-SCOPE-01`、`WRITE-SCOPE-01`、`SELF-SCOPE-01` | `MIGRATION_PENDING` |
| `/finance/expenses*`、`/finance/reimbursements*`、`/finance/:applicationType/:id/attachments`、`/finance/payment-records` | finance/read/create/review/withdraw/resubmit/pay | `STORE_LIST` / inherited detail | application/payment `storeId` | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/finance/overview`、`/invoices`、`/invoices/:id/*` | finance/invoice/read/create/issue/void/reissue/send | `STORE_LIST` / detail | financial record `storeId` | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/customer-statements/*`、`/customer-receipts/*` | finance/read/create/confirm/void/reverse | `STORE_LIST` / inherited detail | statement/receipt `storeId` + customer relation | `LIST-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01` | `MIGRATION_PENDING` |
| `/reports/summary`、`/reports/operational`、`/reports/filter-options` | reports/read | `STORE_LIST` / `GLOBAL_ONLY` | query `storeId` → facts store set | `LIST-SCOPE-01` | `MIGRATION_PENDING` |
| `/notifications`、`/notifications/todos`、`/notifications/unread-count`、`PATCH /notifications/read*` | notifications/read/update | `SELF_ONLY` | recipient user + optional target store | `SELF-SCOPE-01` | `MIGRATION_PENDING` |
| `GET /internal/metrics` | observability/read | `SYSTEM` | internal principal/network | `SYSTEM-00` | `SYSTEM` |

### 4.1 当前实施状态（2026-08-22）

| 阶段 | 状态 | 已落地范围 | 剩余门槛 |
|---|---|---|---|
| Contract | `DONE` | `AccessSubject`、`AccessScopeFacts`、稳定 reason code、`require` 错误结构及 contract tests；343 个 API TypeScript 文件语法检查通过 | 完整 `tsc` 仍受当前 workspace pnpm 依赖链接不完整影响 |
| Governance | `DONE` | stores、users、members、settings、auth/permissions interceptor；HQ/global 与 store scope 回归通过 | 无 |
| Business callers | `DONE` | customers、products、warranties、invoices、rebates、commissions、customer-settlements、finance、reports、returns、orders、construction、inventory、pricing、sales-quotes 全部切换为 `{ userId }` subject | 无 |
| Deletion ready | `DONE` | 生产扫描无 `accessContext.can/scope/require(actor.id|user.id)` 直传；无业务 caller 以 `isAuditor` 或 `resolve().roles` 放行；兼容字段仅保留在 auth DTO/边界适配层 | 后续可按独立迁移窗口删除兼容字段，不阻塞本次 PRD |
| Gate | `PASS_WITH_ENV_NOTE` | 全量 API test runner exit 0；Auth HTTP 2/2 通过；核心权限/范围/错误/报告/售后契约测试通过；343 个 API TypeScript 文件语法检查通过；`git diff --check` 无 whitespace error | `tsc --noEmit` 需先修复 workspace 的 pnpm 类型依赖链接；不影响本次运行时与测试验收 |

## 5. 研发任务与证据

每个 endpoint inventory 行必须转成研发任务或明确标记为 `PUBLIC`/`SYSTEM`。任务完成时提供：

- capability/action 登记位置。
- 规范门店字段和 owner 字段的代码位置。
- 列表过滤、详情 precheck、写入 precheck 的测试。
- no-store、unresolved、显式越权和资源不存在的 Given/When/Then 证据。
- 跨门店 route 的 source/execution 双校验证据。
- 删除旧 actor、`isAuditor`、`storeMember`、role code 放行路径的扫描结果。

任何 route 没有这些证据，不能进入 `Deletion ready`。

## 6. 变更记录

| 版本 | 日期 | 变更内容 |
|---|---|---|
| v1.0 | 2026-08-21 | 建立资源 scope mapping、endpoint inventory 和稳定响应契约 |
| v1.1 | 2026-08-22 | 完成 AccessSubject 迁移、资源调用方收口、建议价/返利 action 细化及全量回归验收 |
