# V1.7 本地验收审计

- 文档类型：验收审计
- 文档状态：初版
- 适用范围：MallBay Web 管理端、API、Prisma、mini 本地可验证功能
- 来源依据：[V1.7 全功能需求差距与验收计划](./v1-7-requirements-gap-plan.md)、[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)、[订单创建需求对齐实施计划](./order-requirements-alignment-plan.md)

## 结论

截至本审计，本地可自动化验证的 V1.7 主链路已经具备初版闭环：客户、产品、订单、施工、库存采购、质保、售后、提成、财务、发票、返利、报表和小程序离线同步均有代码、测试或文档证据。

MUST NOT：

- 不把“本地初版闭环”描述为“生产发布完成”。
- 不把微信真机、微信公众平台域名、税控级发票、复杂审批和 BI 大屏视为本地已验收。
- 不用前端入口可见性替代 API 权限测试。

## 本地验收矩阵

| 模块 | 本地验收状态 | 主要代码证据 | 自动化证据 | 剩余边界 |
| --- | --- | --- | --- | --- |
| 账号、组织、权限 | 初版通过 | `apps/api/src/auth/`、`apps/api/src/common/policies/permission.policy.ts`、`apps/web/app/workbench/[storeId]/page.tsx` | API auth、permission、store/workbench tests | 更细 RBAC、生产组织治理后续演进 |
| 客户档案 | 初版通过 | `apps/api/src/customers/`、`apps/web/app/customers/`、`apps/web/src/features/customers/` | customer service、customer form/display tests | 客户价值预测、多维筛选后续增强 |
| 产品管理 | 初版通过 | `apps/api/src/products/`、`apps/web/app/products/page.tsx`、`apps/web/src/features/products/` | product service、product display/form tests | 品牌/型号字典化后续增强 |
| 订单创建 | 初版通过 | `apps/api/src/orders/use-cases/create-order.use-case.ts`、`apps/web/app/orders/create/page.tsx`、`apps/web/src/features/orders/create-order-form.ts` | create order use-case、create-order-form tests | 更复杂报价规则后续增强 |
| 订单管理与审计 | 初版通过 | `apps/api/src/orders/orders.service.ts`、`apps/web/app/orders/[id]/page.tsx`、`AuditEvent` migration | orders service、audit event、orders page tests | 独立审计后台后续增强 |
| 施工容量与派单 | 初版通过 | `apps/api/src/construction/`、`apps/web/app/construction/` | construction service、capacity form、assignments/tasks tests | 智能派工推荐后续增强 |
| 库存采购 | 初版通过 | `apps/api/src/inventory/`、`apps/web/app/inventory/page.tsx`、`apps/web/src/features/inventory/` | inventory service、inventory API/display/matching tests | 多级采购审批、到货通知后续增强 |
| 质保 | 初版通过 | `apps/api/src/warranties/`、`apps/web/app/warranties/page.tsx` | warranties service、warranties page/display tests | 更复杂电子质保卡样式后续增强 |
| 售后 | 初版通过 | `apps/api/src/after-sales/`、`apps/web/app/after-sales/page.tsx` | after-sales service/page/display tests | 更复杂售后 SLA 后续增强 |
| 提成 | 初版通过 | `apps/api/src/commissions/`、`apps/web/app/commissions/page.tsx` | commissions service/page/display tests | 复杂提成规则后续增强 |
| 财务 | 初版通过 | `apps/api/src/finance/`、`apps/web/app/finance/page.tsx` | finance service/page/display tests | 复杂审批流后续增强 |
| 发票 | 初版通过 | `apps/api/src/invoices/`、`apps/web/app/invoices/page.tsx` | invoices service/PDF/page/display tests | 税控/版式级电子发票后续增强 |
| 返利 | 初版通过 | `apps/api/src/rebates/`、`apps/web/app/rebates/page.tsx` | rebates service/page/display tests | 更复杂返利规则后续增强 |
| 报表 | 初版通过 | `apps/api/src/reports/`、`apps/web/app/reports/page.tsx` | reports service/page/display tests | BI 大屏和多维钻取后续增强 |
| 小程序离线 | 本地初版通过 | `apps/mini/`、`apps/api/src/construction/offline-sync.test.ts`、`apps/api/src/auth/wechat-mini-program.service.ts` | mini tests、offline sync tests、auth service tests | 微信真机、合法域名、发布验收待外部执行 |

## 创建订单专项审计

本轮重点校验创建订单与需求文档的一致性：

- 金额以元录入，提交 API 前转整数分。
- 产品明细下拉展示品牌、名称、型号业务属性。
- 预约日期 DatePicker 值提交前格式化为 `YYYY-MM-DD`。
- 预约时段、外出地址、备注提交前 trim，空白备注不进入 API payload。
- 预约日期与预约时段必须成对出现，服务端兜底校验。
- 外出施工必须填写外出地址，服务端兜底校验。
- 创建订单受施工容量约束，前端提示缺失/满额，后端事务内兜底。
- 销售只能使用自己权限范围内客户创建订单。
- 定金收款账户必须属于订单门店且启用。
- 人工费建议价、最终价和调整原因保存为订单金额快照。

证据：

- `apps/web/src/features/orders/create-order-form.test.ts`
- `apps/api/src/orders/use-cases/create-order.use-case.test.ts`
- `docs/features/order-requirements-alignment-plan.md`

## 本轮新增审计证据

- `apps/web/src/features/orders/create-order-form.ts`：提交前规范化预约日期、预约时段、外出地址和备注。
- `apps/api/src/auth/wechat-mini-program.service.ts`：微信登录配置缺失返回业务错误。
- `apps/mini/README.local.md`：本地和真机联调配置不入库说明。
- `docs/features/phase-6-mini-program-integration-plan.md`：小程序联调与发布实施计划。
- `docs/features/phase-6-mini-program-acceptance.md`：开发者工具和真机验收脚本。
- `docs/features/phase-6-mini-program-release-checklist.md`：发布前检查清单。
- `apps/api/project.json`、`apps/web/project.json`、`apps/mini/project.json`、`packages/shared/project.json`：Nx typecheck 目标统一使用 `corepack pnpm`，保证根 `corepack pnpm typecheck` 可在本地工作区稳定执行。

## 已执行验证命令

本轮已执行：

```bash
corepack pnpm --filter @mallbay/api test
corepack pnpm --filter @mallbay/web test
corepack pnpm --filter @mallbay/mini test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm exec eslint apps/api/src/auth/auth.service.test.ts apps/api/src/auth/wechat-mini-program.service.ts apps/web/src/features/orders/create-order-form.ts apps/web/src/features/orders/create-order-form.test.ts --quiet
git diff --check
```

验证结果：

- API 测试：180 项通过。
- Web 测试：205 项通过。
- Mini 测试：28 项通过。
- 根 `corepack pnpm typecheck`：4 个项目通过。
- 根 `corepack pnpm lint`：退出码 0，存在既有 warning，未出现 lint error。

## 外部验收清单

以下事项不是本地代码可单独证明的完成项，必须在对应平台或环境验收：

- 微信公众平台合法 request/uploadFile 域名配置。
- 微信 AppID、AppSecret 与 API 环境的端到端 code 登录。
- 真机断网、弱网、恢复网络同步。
- 小程序体验版和正式版发布审核。
- 税控或版式级电子发票对接。
- 企业级复杂审批、BI 大屏和多维钻取。

对应计划：

- [Phase 6 微信小程序联调与发布实施计划](./phase-6-mini-program-integration-plan.md)
- [Phase 6 微信小程序真机验收脚本](./phase-6-mini-program-acceptance.md)
- [Phase 6 微信小程序发布前检查清单](./phase-6-mini-program-release-checklist.md)

## 后续处理原则

MUST：

- 外部验收发现的问题优先回写自动化测试，再修代码。
- 与真实环境相关的配置继续保存在 `.local`、环境变量或平台后台，不进入 Git。
- 每个后续增强必须独立计划、独立验证、可回滚。

RECOMMENDED：

- 下一步先执行小程序真机验收；若通过，再决定是否推进税控发票、复杂审批或 BI 能力。
