# MallBay 五个架构深化候选任务拆分

来源：`docs/features/architecture-deepening-candidates-prd.md` V1.2、评审报告 V1.2、ADR-0005 至 ADR-0012。

## 阶段门

每阶段完成以下任务后才能进入下一阶段：

- public interface contract tests 通过。
- 至少两个真实调用者迁移。
- 旧事实写入路径不可达或已删除。
- API/Web 类型检查、相关测试和代表页面验收通过。
- 无新增 S0/S1。

## 阶段一：Inventory/Procurement

| ID | 任务 | 主要文件 | 状态 |
|---|---|---|---|
| INV-001 | 固化 `InventoryLedger` 输入、输出、错误和幂等契约 | `inventory/domain/inventory-ledger.ts`、contract tests | 已完成接口与命令边界测试；错误/幂等语义继续复用既有实现 |
| INV-002 | 将采购需求、采购单、部分收货和超收拒绝编排收拢到 `ProcurementFlow` | `inventory/procurement-flow.ts`、`purchases.controller.ts` | 已完成入口迁移；内部事实实现沿用 `InventoryService` |
| INV-003 | 统一采购收货入口，禁止 purchases controller 直接调用 `InventoryService.receive*` | purchases module/controller | 已完成采购工作流入口迁移；供应商/仓库主数据已收口到 `InventoryCatalog` |
| INV-004 | 确保采购状态和库存收货事实同事务提交 | inventory implementation、schema | 已验证兼容实现；单次收货在同一 Prisma transaction 内提交，批量收货保持既有逐批结果语义 |
| INV-005 | 补齐库存预留、释放、出库、调整、追溯 contract tests | inventory/domain tests | 已完成 Ledger 专属命令/查询路由测试；真实 PostgreSQL 并发阶段门已通过 |
| INV-006 | 迁移采购页面和订单库存匹配调用者 | Web/API consumers | 已完成；Web 采购/库存匹配调用均经采购/库存路由，API 控制器不再直接依赖 `InventoryService` |
| INV-007 | 阶段门：类型、测试、构建、页面验收和旧路径扫描 | CI/browser | 进行中；migration、数据库预检、并发回归和代表页面已通过，三档视口与旧路径删除测试待完成 |

## 阶段二：Construction Fulfillment

| ID | 任务 | 主要文件 | 状态 |
|---|---|---|---|
| CON-001 | 定义履约视图、能力和受限 command contract | `construction/construction-fulfillment.ts`、construction tests | 已完成核心履约与跨店验收公开边界 |
| CON-002 | 新增追加式质检历史记录，保留 legacy current snapshot | Prisma schema、construction service | 已完成 schema、migration、同事务追加、读取入口和单测；真实数据库 migration 已应用 |
| CON-003 | 将施工详情、订单详情、工作台状态统一到履约视图 | API/Web consumers | 进行中；新增订单级和列表级履约视图，现场施工任务详情、施工订单详情、现场任务列表已迁移；工作台当前仅读取待派工订单数量，不拼装施工阶段，后续仅在增加订单级履约面板时接入 |
| CON-004 | 迁移照片、材料、离线同步幂等规则 | construction implementation/tests | 进行中；照片、材料、离线入口已迁移，核心授权已接入 `AccessContext`，事实逻辑仍在兼容实现 |
| CON-005 | 独立落地跨店施工子 PRD | `construction-cross-store-fulfillment-prd.md` | 已完成设计；实现入口已纳入 `ConstructionFulfillment`，状态持久化待完成 |
| CON-006 | 阶段门验证 | CI/browser | 进行中；新增履约视图契约测试，schema/migration、质量历史单测、并发容量回归和代表页面已通过，三档视口与旧路径删除测试待完成 |

## 阶段三：Customer/Settlement

| ID | 任务 | 主要文件 | 状态 |
|---|---|---|---|
| CST-001 | 固化 `CustomerAccount` 消费概览和客户关系 contract | customers domain/tests | 进行中；消费概览明确纳入在途订单、排除取消订单，详情/标签入口已接入 |
| CST-002 | 固化 `SettlementView` 结算投影和口径元数据 | settlement domain/tests | 已完成三类只读投影；候选订单、对账单、收款/红冲分别返回日期口径、订单范围、金额分类、分摊类型和 generatedAt |
| CST-003 | 新增结算 workflow 收款编排入口 | `customer-settlements/domain/settlement-workflow.ts` | 已完成入口；结算单和收款动作经 workflow 编排 |
| CST-004 | 将 `PaymentRecord` 唯一写入迁移到 Finance | finance/payment implementation | 进行中；客户收款/红冲已委托 Finance，其他 Finance workflow 仍需统一幂等审计 |
| CST-005 | 迁移客户详情、客户列表、结算和报表调用者 | Web/API consumers | 进行中；客户详情/车辆/标签及结算读写控制器已迁移，结算服务已接入 `AccessContext` |
| CST-006 | 阶段门验证 | CI/browser | 进行中；收款幂等、消费口径和代表页面已回归，三档视口与旧路径删除测试待完成 |

## 阶段四：FinancialDocumentQuery

| ID | 任务 | 主要文件 | 状态 |
|---|---|---|---|
| FIN-001 | 定义六类财务单据强类型只读结果 | `finance/domain/financial-document-query.ts` | 已完成六类只读入口：费用、报销、发票、返利、提成和现金事实 |
| FIN-002 | 统一现金事实、来源追溯、时间线和 generatedAt | finance query implementation | 已完成基础协议；新增 document/timeline/cash/search 入口和 `generatedAt`，仍需补齐各单据类型的完整场景矩阵 |
| FIN-003 | 保留各财务 workflow 写入责任并接入查询 seam | finance/invoices/rebates/commissions | 进行中；返利和报销发放已在事务内委托 Finance 写入现金事实并使用稳定幂等键，FinanceService/附件权限 fallback 已删除，发票/提成 workflow 与细粒度报销权限矩阵仍需继续收口 |
| FIN-004 | 迁移财务首页、单据详情、导出和报表 | Web/API consumers | 进行中；财务、发票、返利、提成列表已接入 FinancialDocumentQuery，报表聚合仍保留 ReportsService；Finance/Reports 核心查询授权已接入 `AccessContext` |
| FIN-005 | 阶段门验证 | CI/browser | 进行中；查询入口、报表六类移动卡片 fallback、API/Web 构建和财务代表页面已回归，三档视口与旧路径删除测试待完成 |

## 阶段五：AccessContext

| ID | 任务 | 主要文件 | 状态 |
|---|---|---|---|
| ACC-001 | 将 `AccessContext` 从薄包装深化为 actor/capability/scope interface | permissions/domain/tests | 已完成接口深化；使用显式 actor/input/result 类型，不依赖 HTTP 或 Prisma 类型 |
| ACC-002 | 固化权限发布、回滚和缓存失效语义 | permissions/settings | 已完成；绑定变更、角色停用、策略发布和回滚均清理权限结果缓存及兼容运行时快照，已补齐用户级、全局、发布、回滚回归 |
| ACC-003 | 迁移 Inventory/Procurement、Construction、Customer/Settlement、Finance、Reports 核心调用者 | 业务 modules | 进行中；`FinancialDocumentQuery`、`FinanceQueryService`、`FinanceService`、`FinanceAttachmentService`、`ConstructionFulfillment`、`CommissionsService` 和 Reports public authorization 已移除自身 legacy 权限 fallback，其他核心 implementation 的派生范围和兼容回退仍需收口 |
| ACC-004 | 统一业务错误码到 legacy HTTP adapter | controllers/adapters | 已完成 filter 适配与业务错误码保留测试 |
| ACC-005 | 删除新增 legacy 权限解析路径并通过删除测试 | 全部核心 callers | 进行中；`FinancialDocumentQuery`、`FinanceQueryService`、`FinanceService`、`FinanceAttachmentService`、`ConstructionFulfillment`、`CommissionsService` 不再引用 `PermissionPolicy`，Reports public seam 也不再回退；其他候选 module 仍保留迁移期兼容实现，删除后全量回归待完成 |
| ACC-006 | 全量复审和阶段门验证 | CI/browser | 进行中；权限矩阵、API/Web 构建和五个代表页面已回归，三档视口与旧路径删除测试待完成 |

## 全量完成条件

- 五阶段任务状态全部完成。
- PRD V1.2、五份子 PRD、ADR 和 `CONTEXT.md` 与实现一致。
- 五个 module 的 contract tests 和代表页面验收通过。
- 无新旧事实双写。
- 现有 API、权限、状态、金额和历史数据含义不变。
- Web/API 类型检查、测试和构建通过。

## 当前验证记录（2026-08-09）

- API 全量测试：422 通过、0 失败。
- 本轮 API 全量测试：423 通过、0 失败、2 个 opt-in 真实数据库测试跳过；包含履约视图契约测试。
- API 全量测试默认模式：422 通过、0 失败、2 个 opt-in 真实数据库测试跳过；阶段门模式下真实数据库并发测试 2/2 通过。
- API Nest build：通过。
- Web TypeScript check：通过。
- Web production build：通过，75 个 App Router 页面生成成功。
- Web feature tests：610 通过、0 失败；报表六类分析视图均有移动卡片 fallback contract test。
- 真实数据库 migration status：通过；61 个 migration 已全部应用，数据库 schema up to date。
- 真实数据库不变量预检：通过。
- 真实数据库并发阶段门：通过 2 项回归检查，覆盖库存流水幂等唯一约束和施工容量条件更新，测试数据在清理后无残留。
- 浏览器代表页面验收：已登录检查 `/inventory`、`/construction/tasks`、`/customers`、`/finance`、`/reports`；五页均无应用错误和横向溢出，报表页显示真实“暂无数据”空态。当前视口为 1707×1067，1440/1024/390 三档仍需具备视口控制能力后补验。
- 客户消费事实口径回归：详情聚合与列表摘要均保留在途订单、排除取消订单；客户服务定向测试 17/17 通过。
- public interface 类型边界回归：`InventoryLedger`、`CustomerAccount`、`SettlementView`、`ConstructionFulfillment`、`FinancialDocumentQuery` 和 `AccessContext` 已移除对旧 service `Parameters<>` 的公共参数推导；目标模块定向类型检查通过。
- 施工履约调用者迁移：`apps/web/app/construction/tasks/[id]/page.tsx`、`apps/web/app/construction/orders/[id]/page.tsx` 使用订单级履约视图，`apps/web/app/construction/tasks/page.tsx` 使用稳定履约列表视图，不再由页面承担 assignment 过滤或订单关联拼装；Web feature tests 613/613 通过。
- 旧服务生产引用扫描：旧实现仅保留在对应 module 内部适配层或施工管理端点；未发现新的跨模块调用者，兼容实现删除阶段门仍待最终删除后回归。

### 最新施工履约收口记录（2026-08-10）

- `ConstructionFulfillment` 新增稳定的 `listFulfillments`、`recordEvidence` 和 `syncOffline` 公开入口；控制器保持原有 HTTP 路径和返回行为。
- `GET /construction/fulfillments` 返回统一的履约列表摘要，包含订单上下文、执行门店、施工状态、照片数量、人员和派生工作流。
- 施工任务详情、施工订单详情和现场任务列表均已迁移到履约视图；工作台当前仍只读取待派工订单数量，不承担施工阶段拼装。
- API 全量测试 424/424 通过、0 失败、2 个 opt-in 真实数据库测试跳过；API 履约契约测试 10/10 通过，Web feature tests 613/613 通过；Web 类型检查和生产构建均通过。
- 三档浏览器验收仍未完成：当前 Chrome 控制连接不可用，重试后未能取得可控页面；已有 1707×1067 登录态检查保留，不替代 1440/1024/390 证据。

因此，数据库/API/当前视口自动化质量门已通过，但五阶段阶段门仍保持未完成，直到旧兼容路径删除测试和 1440/1024/390 浏览器验收证据补齐。

### 最新权限与结算语义收口记录（2026-08-10）

- `PermissionsService.invalidateUserCache` 现在同时清理指定用户的 `PermissionPolicy` 兼容运行时快照；全量失效路径同时清理全部快照，避免权限绑定、角色停用、策略发布或回滚后继续使用旧授权结果。
- 新增权限缓存一致性回归：用户级绑定停用后，运行时快照被移除，legacy policy 回退行为仍保持不变；API 全量测试 425/425 通过、0 失败、2 个 opt-in 真实数据库测试跳过。
- `SettlementView.getSettlementView` 现在返回显式投影：`items`、`semantics`、`generatedAt`；每个对账单附带 `settlementPeriod`、`includedOrderIds`、`receivableCents`、`collectedCents`、`outstandingCents` 和 `allocationIds`。
- Web 企业结算页面已消费投影的 `items`，并展示服务端返回的结算口径提示；API 深模块契约 10/10、Web feature tests 614/614、API/Web 类型检查通过。
- 本轮未改变旧结算写入路径、收款幂等语义、订单状态或金额事实；旧实现删除和三档浏览器验收仍未完成。

### 最新权限生命周期收口记录（2026-08-10）

- 权限缓存失效回归已覆盖用户级绑定停用、全局角色停用、已校验策略发布和策略回滚；每个场景都验证兼容 `PermissionPolicy` 运行时快照被清理。
- 权限服务定向测试 8/8 通过；发布/回滚仍使用既有事务、审计和版本校验逻辑，没有新增权限含义。

### 最新 Finance 写入边界收口记录（2026-08-10）

- 返利实际支付路径在已有事务内调用 `FinanceService.recordRebatePayout`，由 Finance 创建 `PaymentRecord` 并写入稳定幂等键 `rebate:{rebateId}:paid`。
- 返利服务已删除无 Finance 注入时的直接写表 fallback；支付未配置 Finance writer 时显式失败，实际支付必须经过 Finance writer。
- `FinancialDocumentQuery` 与内部 `FinanceQueryService` 均已移除 `PermissionPolicy` fallback，public seam 和查询 implementation 统一通过 `AccessContext` 做权限判断。
- 返利服务回归 10/10 通过，API 类型检查和深模块契约继续通过。

### 当前全量验证记录（2026-08-10）

- API 全量测试：429 通过、0 失败、2 个 opt-in 真实数据库测试跳过。
- API 类型检查：通过；API Nest build：通过。
- API 深模块契约：10/10 通过；权限生命周期定向测试：8/8 通过；返利服务测试：10/10 通过。
- Web feature tests：616 通过、0 失败。
- Web 类型检查：通过；Web production build：通过，75 个 App Router 页面生成成功。
- 本轮未取得新的 1440/1024/390 浏览器控制证据；旧实现删除后的全量回归也未完成，因此五阶段总体仍未完成。

### 最新履约访问边界收口记录（2026-08-10）

- `ConstructionFulfillment` public seam 已移除 `PermissionPolicy` 回退；履约读取必须注入并使用 `AccessContext`，缺失访问实现时显式失败。
- 施工管理旧 service 的兼容授权逻辑仍限制在内部管理端点，不作为履约模块的公开依赖。
- API 深模块契约测试 10/10 通过，`git diff --check` 通过。
- API 全量测试 429/429 通过，2 个 opt-in 真实数据库测试按默认配置跳过；Web feature tests 616/616 通过，Web 类型检查通过。
- ACC-003/ACC-005 仍需继续处理其他核心调用者和旧实现删除后的全量回归；FIN-003 的报销、发票、提成现金事实 workflow 也仍未完成。

### 最新 Finance/AccessContext 任务收口记录（2026-08-10）

- `ReimbursementWorkflowService.pay` 不再直接创建 `PaymentRecord`，由 `FinanceService.recordReimbursementPayout` 在同一事务内写入，幂等键为 `reimbursement:{id}:paid`。
- `FinanceService.approveReimbursement` 旧入口不再绕过 workflow 写现金事实；审批委托给 `ReimbursementWorkflowService`，直接传入 `PAID` 会明确要求使用支付 workflow。
- `RebatesService.pay` 删除无 Finance 注入时的直接写表 fallback；实际支付必须通过 `FinanceService.recordRebatePayout`。
- `CommissionsService` 改为强制注入 `AccessContext`，移除 `PermissionPolicy` fallback；提成业务数据写入和返回语义保持不变。
- 定向验证：Finance/Reimbursement/Rebate 17/17 通过；Commissions 2/2 通过；API 类型检查通过。

### 最新 Reports/AccessContext 任务收口记录（2026-08-10）

- `ReportsService` public authorization 改为强制使用 `AccessContext`，删除缺少上下文时的 `PermissionPolicy` fallback。
- ReportsService 内部销售人员范围派生仍保留为隐藏 implementation，待 capability/scope 矩阵确认后迁移；不得新增跨模块调用者依赖该实现。
- ReportsService 定向测试 9/9 通过；API 全量测试 429 通过、0 失败、2 个 opt-in 真实数据库测试跳过；API 类型检查和 Nest build 通过。
- ACC-003/ACC-005 仍需迁移其余核心调用者、删除旧实现并执行删除后全量回归；FIN-003 仍需完成发票/提成现金事实场景矩阵。

### 最新 FinanceQueryService 任务收口记录（2026-08-10）

- `FinanceQueryService` 强制注入 `AccessContext`，删除无上下文时的 `PermissionPolicy` 授权回退。
- 原有本人范围、全量范围、当前门店和跨门店拒绝语义由 8/8 定向测试覆盖；财务 workflow 回归同步通过。
- `FinancialDocumentQuery` 仍是 public read seam，FinanceQueryService 保持为隐藏查询 implementation，不新增跨模块直接依赖。

### 最新全量回归与浏览器阶段门记录（2026-08-10）

- API 全量测试 431 个：429 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API 类型检查和 Nest build 通过。
- Web 全量测试 616/616 通过；Web 类型检查和 production build 通过，75 个 App Router 页面生成成功。
- 受控页面重定向到 `/auth`，Chrome 已登录会话连接不可用；1440/1024/390 浏览器证据暂缺。
- 旧实现删除后的全量回归暂未执行；FIN-005、ACC-003、ACC-005 继续保持进行中。

### 最新 Finance 授权任务收口记录（2026-08-10）

- `FinanceService` legacy 方法删除 `PermissionPolicy` fallback；无 `AccessContext` 的授权调用显式失败，现金事实 writer 不受影响。
- `FinanceAttachmentService` 改用 `AccessContext` 的 owner/store 双路径授权；新增申请人、财务人员、无关人员回归测试。
- 财务附件、查询、FinanceService 和 workflow 定向测试 14/14 通过；API 全量测试 434 个中 432 通过、0 失败、2 个真实数据库并发测试跳过。
- 报销审批/付款的细粒度角色差异尚未迁移，需先完成 capability matrix；FIN-003、ACC-003、ACC-005 和删除后回归继续进行中。

### 最新财务 capability matrix 任务记录（2026-08-10）

- 已在 PRD 固化 `finance.application/submit/OWN`、`finance.document/read`、`finance.expense/review`、`finance.reimbursement/review`、`finance.reimbursement/pay` 和 `finance.document/attach` 的能力、动作、范围及角色边界。
- 明确店长可审批费用但不可审批/支付报销；财务可审批/支付报销；销售、采购、施工、客服仅按本人范围发起和查看；总部审核员使用 GLOBAL。
- 新 capability 未进入权限目录和角色配置前，迁移代码按默认拒绝，不通过旧 `finance/write` 静默放宽。
- 下一步实施权限目录/legacy role 映射、workflow 调用迁移和七类角色矩阵回归。

### 最新财务 capability matrix 实施结果（2026-08-10）

- 已完成 `finance.application`、`finance.document`、`finance.expense`、`finance.reimbursement` 的权限定义、角色 grant、legacy map 和 migration。
- 已完成 Expense/Reimbursement workflow、FinanceQuery、FinanceAttachment、FinanceService 的 `AccessContext` 调用迁移；`apps/api/src/finance` 不再引用 `PermissionPolicy`。
- 已补充店长、财务、销售的细粒度正反向矩阵测试，并通过全量 API 回归；店长审批费用但不能审批/支付报销，财务可审批/支付报销，销售不能查看全店财务。
- 本地 migration `20260810120000_finance_capability_matrix` 已成功部署。
- 验证结果：财务相关定向测试 31/31；API 全量 435 个中 433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API typecheck、Nest build、`git diff --check` 通过。
- FIN-003 财务现金事实与权限子任务完成；ACC-003/ACC-005 仍需继续处理其他核心 callers、删除 legacy implementation 后回归和浏览器三档验收。

### 最新 ReportsService 访问范围实施结果（2026-08-10）

- 已将 ReportsService 的销售角色/门店范围派生迁移到 `AccessContext.resolve()`，删除 ReportsService 对 `PermissionPolicy` 的隐藏依赖。
- 已补充销售 `reports/read/STORE` 入口 grant，并通过 `20260810130000_sales_report_access` migration 部署；销售查询仍由 `salesPersonId` 强制限制为本人。
- ReportsService 与权限矩阵定向测试 18/18 通过；API 全量 435 个中 433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API typecheck、Nest build 和 legacy 扫描通过。
- ACC-003 的 Reports 子任务完成；ACC-003/ACC-005 剩余其他核心 callers、删除 legacy implementation 后回归和浏览器三档验收。

### 最新 Customer/Settlement 权限收口结果（2026-08-10）

- `CustomerSettlementsService` 已删除 `PermissionPolicy` fallback，强制使用 `AccessContext`；客户读取和财务结算能力语义保持不变。
- CustomerSettlementsModule 已显式依赖 PermissionsModule，生产依赖图与 public settlement seam 一致。
- API 全量 435 个中 433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；typecheck、Nest build、diff check 通过。
- CST-004 权限 fallback 子项完成；ACC-003/ACC-005 仍需迁移发票、订单、库存、施工等调用者并完成删除后回归和浏览器三档验收。

### 最新发票/返利/产品权限迁移结果（2026-08-10）

- `InvoicesService`、`FinancialDocumentQuery` 已使用 `AccessContext` 处理发票管理和销售本人 scope。
- `RebatesService` 已使用 `AccessContext` 处理返利申请、双阶段审批、支付和销售列表 scope；Finance writer 现金事实行为保持。
- `ProductsService` 已使用 `AccessContext` 处理产品读取、产品管理、建议价和标准成本权限；新增产品权限 migration 已部署。
- 定向验证：发票/财务查询 19/19、返利 10/10、产品 5/5；API 全量 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过。
- ACC-003/ACC-005 下一批继续迁移订单、库存、施工、售后、定价，并执行删除后回归与浏览器三档验收。

### 最新库存权限迁移结果（2026-08-10）

- `InventoryService` 已强制注入 `AccessContext`；库存、采购需求、采购单、供应商、入库、出库和仓库维护不再依赖缺失上下文时的 legacy fallback。
- 已保留店长/采购写入、客服采购只读、销售采购拒绝、财务读取和当前门店 scope；库存事实和采购事实的 public API、状态与幂等语义不变。
- InventoryService 定向测试 42/42 通过；API 全量 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过；API typecheck 通过。
- 库存迁移子任务完成；下一批进入订单履约、施工、售后、定价 caller，并在所有核心 caller 完成后删除 legacy implementation、执行删除后全量回归和浏览器三档验收。

### 最新质保权限迁移结果（2026-08-10）

- `WarrantiesService` 已强制注入 `AccessContext`，质保读写和销售本人 scope 不再依赖 `PermissionPolicy`。
- 已新增并部署 `20260810150000_warranties_access` migration，同步更新权限目录、角色 grant 和权限初始化脚本。
- WarrantiesService 定向测试 7/7 通过；API typecheck、Nest build 通过。
- 质保迁移子任务完成；下一批继续处理售后、订单生命周期、施工、定价，并在核心 callers 完成后执行 legacy 删除和最终回归。

### 最新售后权限迁移结果（2026-08-10）

- `AfterSalesService` 已删除 `PermissionPolicy` 依赖，统一使用 `AccessContext` 和售后实体关系执行访问与 scope 判断。
- 已新增并部署 `20260810160000_after_sales_access` migration；补齐管理角色门店写入、施工员/学徒本人证据写入和各角色售后读取权限。
- AfterSalesService 定向测试 10/10；API 全量 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过；API typecheck 通过。
- 售后迁移子任务完成；下一批继续订单生命周期、施工和定价 caller，最后执行 legacy 删除、删除后全量回归与浏览器验收。

### 最新订单创建权限迁移结果（2026-08-10）

- `CreateOrderUseCase` 已使用 `AccessContext` 处理订单创建、指定销售和客户读取；销售本人客户 scope 与店长指定销售边界保留。
- 已新增并部署 `20260810170000_orders_access` migration；同步更新订单角色 grants 和 `OrdersModule` 的 PermissionsModule 依赖。
- 订单创建及车辆联系人专项测试 16/16 通过；API 全量 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过；API typecheck 通过。
- 订单创建迁移完成；订单列表/支付/改单/生命周期及施工、定价仍属于后续任务。

### 最新订单履约 caller 迁移结果（2026-08-10）

- `OrdersService` 已将订单列表、导出、详情、复制草稿、支付、收款账户、改单审核和历史核验迁移到 `AccessContext`；销售本人 owner scope、财务支付边界和店长/财务改单审核边界保持不变。
- `OrderLifecycle` 已将完工、取消和退回草稿状态转换迁移到 `AccessContext`；纯状态推导保留无授权依赖的测试 seam，真实写入缺少上下文时明确失败。
- `OrdersService` 定向测试 23/23、`OrderLifecycle` 定向测试 9/9 通过；API 全量 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过；API typecheck、Nest build 通过。
- `OrderPolicy` 已无生产 caller，暂不删除，待施工、客户、定价等核心 caller 迁移完成后统一清理并执行删除后回归。

### 最新施工履约 caller 迁移结果（2026-08-10）

- `ConstructionService` 已迁移容量、派工、施工记录、物料、照片、质检、请假、排班和离线同步授权；owner/store scope 与原有角色边界保持。
- `CrossStoreConstructionService` 已删除 runtime snapshot 和 store-member 授权 fallback，跨店读取、执行、来源和映射操作统一通过 `AccessContext`。
- `ConstructionCostSettlementService` 已迁移成本查看、店长确认、财务审批/结算和成本明细脱敏；店长不能代替财务审批/结算。
- 容量对账 controller 已使用 `store/write` capability；施工模块已有 `PermissionsModule` 依赖，施工目录不再引用 `PermissionPolicy`。
- 施工域专项测试 33/33 通过；API 全量 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过；API typecheck 通过。
- 施工迁移子任务完成；下一步处理客户与定价 caller，之后删除无 caller 的 legacy policy 实现并执行删除后全量回归。

### 最新客户、定价与报价 caller 迁移结果（2026-08-10）

- `CustomersService` 已迁移客户创建、列表、搜索、详情、编辑、人工标签、企业用户和车辆生命周期授权；`CustomerPolicy` 已删除，消费概览和在途订单口径测试保持通过。
- 定价核心 caller 已迁移到 `AccessContext`，包括成本估算、核心试算、规则集、车型价格、施工成本配置、模板和 rollout；成本估算内部调用改为沿用真实 actor。
- `SalesQuotesService` 已迁移报价创建、读取、导出、提交、审批、撤回、重算和转单授权；销售本人范围、店长审批和财务成本脱敏保持。
- 报价模块已显式依赖 `PermissionsModule`；客户、定价、报价专项测试分别为 17/17、20/20、7/7；API 全量测试 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过；typecheck 通过。
- `OrderPolicy` 已删除；下一步清理权限服务对 `PermissionPolicy` 运行时桥的依赖，执行删除后全量回归，再进行 Web 三档浏览器验收。

### 最新权限缓存拆分与 legacy 删除门记录（2026-08-10）

- 已新增 `RuntimeAccessSnapshotStore`，并将其加入 `PermissionsModule`；`PermissionsService` 继续负责缓存填充和失效，业务模块不访问该缓存。
- 客户、定价、报价、施工、订单、库存、质保、售后、财务、报表等生产 caller 均无 `PermissionPolicy` 直接授权调用。
- 为保持现有兼容测试，本轮暂保留 `PermissionsService` 到 `PermissionPolicy` 的运行时快照桥；因此 legacy 删除任务仍进行中。
- API 全量测试 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过；API typecheck、Nest build 通过。
- 下一步：迁移旧桥测试到 `AccessContext/PermissionsService`，删除旧策略行为和无用测试，执行删除后回归；随后补 Web 1440/1024/390 浏览器验收。

### 兼容桥删除门安全复核（2026-08-10）

- 旧桥一次性删除会跨越权限基础设施、类型契约和历史兼容测试，安全门拒绝该高风险全局补丁；本轮保留桥并明确标记为 P1 未完成。
- 新增 `RuntimeAccessSnapshotStore` 生命周期测试，确保新内部缓存的 set/has/clear/clearAll 行为有独立回归。
- 业务 caller 迁移阶段保持完成；删除阶段必须拆分为：兼容测试迁移 → 旧桥删除 → 删除后权限专项/API 全量回归 → Web 三档浏览器验收。

### 浏览器验收环境复核（2026-08-10）

- Chrome 控制连接已恢复，Web 3000 可启动；API 已完成 Nest 路由注册，但 PostgreSQL 连接被拒绝，报价过期后台任务导致 API 退出。
- 未在未确认情况下启动 compose 的持久化数据库卷；浏览器业务页面验收继续等待数据库/API 环境恢复。

### 旧权限实现删除与最终验收（2026-08-10）

- 已将全部业务类型引用迁移到 `permissions/domain/access-types.ts`，删除 `PermissionPolicy` 实现及旧测试，`PermissionsService` 仅保留新内部缓存 seam。
- API 全量 423/423，真实 PostgreSQL 并发测试 2/2；Web 全量 616/616；API/Web typecheck 与 build 通过。
- `dianzhang` 登录成功，代表页面在 1440、1024、390 三档均无横向溢出；最终验收完成，五候选任务全部关闭。
