# Phase 5 财务发票返利报表实施计划

- 文档类型：功能实施计划
- 文档状态：初版
- 适用范围：费用申请、报销审批、打款流水、发票、返利和经营报表
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)

## 目标

Phase 5 MUST 在订单、施工、库存、质保、售后和提成链路之后补齐经营财务闭环：

- 财务可处理费用申请、报销审批和打款记录。
- 采购可提交本门店费用和报销申请，但不能审批报销或查看全量财务流水。
- 已完工且已收款订单可申请发票和返利。
- 销售只能为自己名下订单申请并查看发票和返利，财务、店长和管理员按本权限范围处理。
- 发票支持申请、开具、作废、重开。
- 返利支持申请、审核、审批、发放。
- 管理员、店长和财务可查看经营汇总报表；管理员可查看全量汇总，店长和财务默认查看本门店；销售可查看本人销售业绩。

## 交付范围

MUST：

- 新增 `apps/api/src/finance/` 模块。
- 新增 `apps/api/src/invoices/` 模块。
- 新增 `apps/api/src/rebates/` 模块。
- 新增 `apps/api/src/reports/` 模块。
- Prisma 新增 `ExpenseApplication`、`ReimbursementApplication`、`PaymentRecord`。
- Prisma 新增 `Invoice`、`InvoiceLog`。
- Prisma 新增 `CustomerRebate`、`RebateLog`。
- 权限策略新增财务、发票、返利和报表能力判断。
- 前端新增 `/finance`、`/invoices`、`/rebates`、`/reports` 页面。

MUST NOT：

- 不生成税控/版式级电子发票 PDF；允许本地 PDF 文件 URL 初版用于开发验证和业务闭环。
- 不实现复杂多级老板审批流，老板能力暂由管理员策略承接。
- 不实现返利自动规则计算，返利金额由申请时明确填写。
- 不把报表做成独立 BI 系统，当前阶段只输出关键指标汇总。

## API

- `GET /finance/expenses`
- `POST /finance/expenses`
- `GET /finance/reimbursements`
- `POST /finance/reimbursements`
- `POST /finance/reimbursements/:id/review`
- `GET /finance/payment-records`
- `GET /invoices`
- `POST /invoices`
- `POST /invoices/:id/issue`
- `POST /invoices/:id/void`
- `POST /invoices/:id/reissue`
- `GET /rebates`
- `POST /rebates`
- `POST /rebates/:id/review`
- `POST /rebates/:id/pay`
- `GET /reports/summary`

## 验收

- 财务可提交费用申请和报销申请。
- 财务、店长或管理员可审批报销，审批通过或打款后生成财务流水。
- 未完工或未收清的订单不能申请发票或返利。
- 销售为其他销售订单申请发票时必须被服务端拒绝。
- 销售查询发票列表时只能返回自己订单对应的发票。
- 销售为其他销售订单申请返利时必须被服务端拒绝。
- 销售查询返利列表时只能返回自己订单对应的返利。
- 发票状态变更必须写入发票日志。
- 返利审核和发放必须写入返利日志，发放后生成财务流水。
- 报表至少包含订单数、订单总额、已收款、施工记录、售后、提成、库存、财务、发票、返利指标。
- 管理员访问报表时可不传 `storeId`，系统返回全量经营汇总；店长或财务不传 `storeId` 时系统使用本人门店。
- 销售访问报表时只能统计本人订单、本人订单发票/返利和本人销售提成，不能返回全店施工、库存、财务等经营指标。
- 销售等非财务申请角色直接调用费用或报销申请 API 时必须被拒绝。

## 测试计划

- `PermissionPolicy` 财务、发票、返利和报表权限单元测试。
- `FinanceService` 费用、报销审批和财务流水测试。
- `InvoicesService` 发票申请、开具、作废和重开测试。
- `RebatesService` 返利申请、审核、发放和流水测试。
- `ReportsService` 经营汇总测试。
- Prisma schema 不变量测试。
- Web API client 请求路径测试。
