# Phase 5 财务发票返利报表功能说明

- 文档类型：已交付功能说明
- 文档状态：初版
- 适用范围：费用申请、报销审批、打款流水、发票、返利和经营报表
- 来源依据：[Phase 5 财务发票返利报表实施计划](./phase-5-finance-invoice-rebate-report-plan.md)

本文档说明 Phase 5 已交付的财务、发票、返利和报表能力。

## 已交付能力

- 费用申请：记录门店、标题、金额、事由和申请人。
- 报销申请：支持关联费用申请，并记录审批状态。
- 报销审批：审批通过或标记打款后生成财务流水。
- 财务流水：记录打款类型、金额、来源业务和操作人。
- 发票申请：仅允许已完工且已收款订单申请发票。
- 发票状态：支持开具、作废、重开，并保留状态日志。
- 返利申请：仅允许已完工且已收款订单申请返利。
- 返利状态：支持审核、拒绝和发放，发放后生成财务流水。
- 经营报表：输出订单、收款、施工、售后、发票和返利关键指标。

## 角色权限

- 管理员：跨门店管理财务、发票、返利和报表。
- 店长：管理本门店财务、发票、返利和报表。
- 财务：管理本门店费用、报销、发票、返利和财务报表。
- 销售：可为本门店已完工且已收款订单申请发票和返利。
- 采购：可提交费用和报销申请。

## API 范围

- `GET /finance/expenses`、`POST /finance/expenses`。
- `GET /finance/reimbursements`、`POST /finance/reimbursements`。
- `POST /finance/reimbursements/:id/review`。
- `GET /finance/payment-records`。
- `GET /invoices`、`POST /invoices`。
- `POST /invoices/:id/issue`、`POST /invoices/:id/void`、`POST /invoices/:id/reissue`。
- `GET /rebates`、`POST /rebates`。
- `POST /rebates/:id/review`、`POST /rebates/:id/pay`。
- `GET /reports/summary`。

## 前端页面

- `/finance`：费用申请、报销申请、报销审批和财务流水。
- `/invoices`：发票申请、开具、作废和重开。
- `/rebates`：返利申请、审核和发放。
- `/reports`：经营指标汇总。

## 约束

- MUST 通过财务 API 生成财务流水，不允许前端直接写流水表。
- MUST 通过发票 API 执行状态变更，不允许直接更新 `Invoice.status`。
- MUST 通过返利 API 执行审核和发放，不允许绕过日志。
- MUST 在申请发票或返利前校验订单完工状态和收款状态。
- MUST NOT 在 Phase 5 实现电子发票 PDF、复杂返利规则、移动端离线和 BI 大屏。
