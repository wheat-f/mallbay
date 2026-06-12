# Phase 5 财务发票返利报表功能说明

- 文档类型：已交付功能说明
- 文档状态：初版
- 适用范围：费用申请、报销审批、打款流水、发票、返利和经营报表
- 来源依据：[Phase 5 财务发票返利报表实施计划](./phase-5-finance-invoice-rebate-report-plan.md)

本文档说明 Phase 5 已交付的财务、发票、返利和报表能力。

## 已交付能力

- 费用申请：记录门店、标题、金额、事由和申请人；仅管理员、店长、财务和采购可提交。
- 报销申请：支持关联费用申请，并记录审批状态；仅管理员、店长、财务和采购可提交。
- 报销审批：审批通过或标记打款后生成财务流水。
- 财务流水：记录打款类型、金额、来源业务和操作人。
- 发票申请：仅允许已完工且已收款订单申请发票；销售只能为自己的订单申请和查看自己的订单发票。
- 发票状态：支持开具、作废、重开，并保留状态日志。
- 返利申请：仅允许已完工且已收款订单申请返利；销售只能为自己的订单申请和查看自己的订单返利。
- 返利状态：支持审核、拒绝和发放，发放后生成财务流水。
- 经营报表：输出订单、收款、施工、售后、提成、库存、财务、发票和返利关键指标；店长和财务默认本店，管理员可不传门店查看全量经营汇总，销售仅查看本人销售业绩。
- 提成报表：按月展示销售提成、师傅提成、调整金额和提成合计。

## 角色权限

- 管理员：跨门店管理财务、发票、返利和报表；访问 `GET /reports/summary` 时可省略 `storeId` 查询全量汇总。
- 店长：管理本门店财务、发票、返利和报表。
- 财务：管理本门店费用、报销、发票、返利和财务报表；工作台提供经营报表入口。
- 销售：可为自己名下已完工且已收款订单申请发票和返利，发票和返利列表仅能查看自己订单对应的数据；可从工作台“我的业绩”查看本人订单、回款、本人订单发票/返利和本人销售提成。
- 采购：可提交本门店费用和报销申请，但不能审批报销或查看全量财务流水。

## API 范围

- `GET /finance/expenses`、`POST /finance/expenses`。
- `GET /finance/reimbursements`、`POST /finance/reimbursements`。
- `POST /finance/reimbursements/:id/review`。
- `GET /finance/payment-records`。
- `GET /invoices`、`POST /invoices`。
- `POST /invoices/:id/issue`、`POST /invoices/:id/void`、`POST /invoices/:id/reissue`。
- `GET /rebates`、`POST /rebates`。
- `POST /rebates/:id/review`、`POST /rebates/:id/pay`。
- `GET /reports/summary`，`storeId` 可选；管理员省略时返回全量汇总，店长或财务省略时返回本人门店汇总。

## 前端页面

- `/finance`：费用申请、报销申请、报销审批和财务流水。
- `/invoices`：发票申请、开具、作废和重开。
- `/rebates`：返利申请、审核和发放。
- `/reports`：经营指标汇总、经营分析、销售趋势、施工趋势、售后趋势、提成趋势、库存趋势、财务趋势、发票趋势和返利趋势。

## 约束

- MUST 通过财务 API 生成财务流水，不允许前端直接写流水表。
- MUST 通过 `PermissionPolicy.canSubmitFinanceApplication` 控制费用/报销申请提交权限，不允许普通销售等角色直接提交财务申请。
- MUST 对销售访问 `GET /reports/summary` 时按 `order.salesPersonId`、`salesCommissionLog.salesUserId` 和订单归属过滤，不允许销售看到全店经营报表。
- MUST 通过发票 API 执行状态变更，不允许直接更新 `Invoice.status`。
- MUST 通过 `PermissionPolicy.canApplyInvoiceForOrder` 控制销售发票申请归属，不允许销售为其他销售的订单申请发票。
- MUST 在发票列表查询中对销售角色按 `order.salesPersonId` 过滤，不允许销售查看同门店其他销售订单的发票。
- MUST 通过返利 API 执行审核和发放，不允许绕过日志。
- MUST 通过 `PermissionPolicy.canApplyRebateForOrder` 控制销售返利申请归属，不允许销售为其他销售的订单申请返利。
- MUST 在返利列表查询中对销售角色按 `order.salesPersonId` 过滤，不允许销售查看同门店其他销售订单的返利。
- MUST 在申请发票或返利前校验订单完工状态和收款状态。
- MUST NOT 在 Phase 5 实现税控/版式级电子发票、复杂返利规则、移动端离线和 BI 大屏；当前仅交付本地 PDF 文件 URL 初版，用于开发验证和业务闭环。
