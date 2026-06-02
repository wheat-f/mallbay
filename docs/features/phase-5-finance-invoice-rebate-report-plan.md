# Phase 5 财务发票返利报表实施计划

- 文档类型：功能实施计划
- 文档状态：初版
- 适用范围：费用申请、报销审批、打款流水、发票、返利和经营报表
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)

## 目标

Phase 5 MUST 在订单、施工、库存、质保、售后和提成链路之后补齐经营财务闭环：

- 财务可处理费用申请、报销审批和打款记录。
- 已完工且已收款订单可申请发票和返利。
- 发票支持申请、开具、作废、重开。
- 返利支持申请、审核、审批、发放。
- 管理员、店长和财务可查看经营汇总报表。

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

- 不生成电子发票 PDF。
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
- 发票状态变更必须写入发票日志。
- 返利审核和发放必须写入返利日志，发放后生成财务流水。
- 报表至少包含订单数、订单总额、已收款、施工记录、售后、发票、返利指标。

## 测试计划

- `PermissionPolicy` 财务、发票、返利和报表权限单元测试。
- `FinanceService` 费用、报销审批和财务流水测试。
- `InvoicesService` 发票申请、开具、作废和重开测试。
- `RebatesService` 返利申请、审核、发放和流水测试。
- `ReportsService` 经营汇总测试。
- Prisma schema 不变量测试。
- Web API client 请求路径测试。
