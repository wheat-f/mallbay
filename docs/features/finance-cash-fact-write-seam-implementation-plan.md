# 订单现金事实写入 seam 实施计划

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 关联 PRD | `docs/features/finance-cash-fact-write-seam-prd.md` V0.4 |
| 关联评审 | `docs/features/finance-cash-fact-write-seam-prd-review.md` V0.2；P4 追加评审见 `finance-cash-fact-write-seam-p4-prd-review.md` |
| 关联 ADR | ADR-0012、ADR-0014、ADR-0015 |
| 日期 | 2026-08-22 |
| 适用范围 | `apps/api` Finance、Orders 与 Returns |
| 实施状态 | P0～P4 已完成 |
| 核心原则 | 单一现金事实 writer、同事务、幂等重放、冲突不覆盖、兼容入口适配 |

## 2. 已确认实施决策

1. `CashFactWriter` 是 Finance module 的现金事实写入 implementation。
2. `OrderPayment`、订单金额和履约版本仍由 Orders module 在同一事务内负责。
3. 订单初始定金和普通订单收款是本轮迁移对象。
4. `FinanceService` 的四个既有 writer 方法继续保留，但只作为兼容 adapter。
5. writer 的事务上下文必须提供 `paymentRecord.findFirst` 与 `paymentRecord.create`。
6. 同一门店同一现金事实幂等键：相同输入返回原记录；不同输入返回 `CASH_FACT_IDEMPOTENCY_CONFLICT`。
7. 数据库唯一竞争返回 `CASH_FACT_CONCURRENT_WRITE`，当前事务回滚；调用 workflow 使用相同业务幂等键重试整笔事务。
8. Returns 的销售退款、供应商退款、供应商退款冲销通过 Finance writer 迁移；Returns 继续拥有退款业务状态。

## 3. 实施分解

### P0：现金事实领域 seam

目标：建立可独立测试、具有足够深度的 writer interface。

主要文件：

- `apps/api/src/finance/domain/cash-fact-writer.ts`
- `apps/api/src/finance/finance.module.ts`
- `apps/api/src/finance/domain/cash-fact-writer.test.ts`

任务：

- 定义现金事实输入、类型、方向和最小写入结果。
- 定义窄事务上下文，强制提供幂等查询与创建能力。
- 实现按 `storeId + idempotencyKey` 查询、创建、重放和冲突比较。
- 比较 `type`、`direction`、`amountCents`、`accountId`、`sourceType`、`sourceId`、`createdById`、`occurredAt`、`reversalOfId`。
- 将数据库唯一竞争映射为 `CASH_FACT_CONCURRENT_WRITE`。
- 提供订单收款、客户收款、客户收款冲销、返利支付、报销支付的固定类型/方向方法。
- 导出 writer provider，但不导出 FinanceService 等兼容 implementation。

退出条件（已满足）：

- writer 单测覆盖 create、同键重放、输入冲突、反向关系冲突和唯一竞争。
- writer 不返回 Prisma 完整行。

### P1：订单首期写入迁移

目标：订单自己的商业事实和 Finance 现金事实在同一事务内完成。

主要文件：

- `apps/api/src/orders/use-cases/create-order.use-case.ts`
- `apps/api/src/orders/orders.service.ts`
- `apps/api/src/orders/orders.module.ts`

任务：

- CreateOrderUseCase 创建初始 `OrderPayment` 后调用 `recordOrderPayment`。
- 普通 `addPayment` 创建 `OrderPayment` 后调用 `recordOrderPayment`。
- 订单现金事实使用 `ORDER_PAYMENT` / `INCOME`，来源使用 `OrderPayment.id`。
- 初始定金使用 `ORDER_INITIAL_DEPOSIT:{orderId}`；普通收款使用 `ORDER_PAYMENT:{orderId}:{idempotencyKey}`。
- 保持原订单金额聚合、超额校验、履约版本和审计顺序。
- OrdersModule 显式依赖 FinanceModule，调用方注入 writer interface。

退出条件（已满足）：

- 初始定金失败时订单、订单收款和现金事实全部回滚。
- 普通收款重放、输入冲突、并发唯一冲突和金额更新回归通过。

### P2：Finance 兼容 adapter 收口

目标：保持已有 Finance workflow 的调用契约，同时删除重复的 PaymentRecord 拼装逻辑。

主要文件：

- `apps/api/src/finance/finance.service.ts`
- `apps/api/src/customer-settlements/customer-settlements.service.ts`
- `apps/api/src/rebates/rebates.service.ts`
- `apps/api/src/finance/reimbursement-workflow.service.ts`

任务：

- `recordCustomerReceipt` 委托 `CashFactWriter.recordCustomerReceipt`。
- `recordCustomerReceiptReversal` 委托对应 reversal writer。
- `recordRebatePayout` 委托 rebate writer。
- `recordReimbursementPayout` 委托 reimbursement writer。
- 保留调用方需要的最小 `{ id }` 返回值。
- 不改变既有业务幂等键、来源标识和事务传入方式。

退出条件（已满足）：

- 客户结算、返利、报销 workflow 继续通过原 FinanceService 方法获得相同结果。
- FinanceService 内部不直接调用 `paymentRecord.create`。

### P3：契约、回归与 direct-write 门禁

目标：证明 seam 已被真实调用，并避免迁移回退。

主要文件：

- `apps/api/src/deep-module-contracts.test.ts`
- `apps/api/src/orders/orders.service.test.ts`
- `apps/api/src/orders/use-cases/create-order.use-case.test.ts`
- `apps/api/src/finance/finance.service.test.ts`
- `apps/api/src/finance/domain/cash-fact-writer.test.ts`

任务：

- 更新 test fake，所有 writer transaction 都提供 `findFirst` 和 `create`。
- 增加 `reversalOfId` 冲突测试。
- 增加 P2002 → `CASH_FACT_CONCURRENT_WRITE` 测试。
- 扫描 `orders`、`finance` 和 `returns` 生产源码，除 writer 外禁止 `paymentRecord.create`。
- 运行 API typecheck、API 全量测试和 diff check。

退出条件（已满足）：

- API typecheck 通过。
- API 全量测试无失败。
- direct-write contract test 通过。
- `git diff --check` 无错误。

### P4：Returns 现金事实迁移

目标：让 Returns 保留退款业务事实所有权，但不再直接创建 `PaymentRecord`。

范围：

- 销售退款 `CUSTOMER_RECEIPT_REVERSAL` / `EXPENSE`。
- 供应商退款 `SUPPLIER_REFUND_OUT` / `OUTFLOW`。
- 供应商退款冲销 `SUPPLIER_REFUND_REVERSAL` / `INFLOW`。

主要文件：

- `apps/api/src/returns/returns.service.ts`
- `apps/api/src/returns/returns.module.ts`
- `apps/api/src/finance/domain/cash-fact-writer.ts`
- `apps/api/src/deep-module-contracts.test.ts`

任务：

- 注入 Finance writer，不改变 Returns 的状态、ReturnAction、调整单和审计所有权。
- 销售退款使用 `recordCustomerReceiptReversal`。
- 供应商退款新增 `recordSupplierRefundPayout`，将返回 id 写入调整单。
- 供应商退款冲销新增 `recordSupplierRefundReversal`，强制 `reversalOfId` 并更新原记录 `reversedById`。
- 为三类路径补充事务回滚、来源、幂等键和 direct-write 契约测试。

退出条件：Returns、Orders 和 Finance 生产源码均无 `paymentRecord.create`；P4 定向与 API 全量回归通过。

## 4. 文件级实施清单

| 文件 | 改动 | 状态 |
|---|---|---|
| `apps/api/src/finance/domain/cash-fact-writer.ts` | 新增 writer、幂等与并发冲突处理 | 本轮收口 |
| `apps/api/src/finance/domain/cash-fact-writer.test.ts` | 新增 seam 单测 | 本轮收口 |
| `apps/api/src/finance/finance.module.ts` | 注册/导出 writer | 已完成 |
| `apps/api/src/finance/finance.service.ts` | 四个兼容 writer 委托 | 已完成 |
| `apps/api/src/orders/orders.module.ts` | 引入 FinanceModule | 已完成 |
| `apps/api/src/orders/use-cases/create-order.use-case.ts` | 初始定金迁移 | 已完成 |
| `apps/api/src/orders/orders.service.ts` | 普通收款迁移 | 已完成 |
| `apps/api/src/deep-module-contracts.test.ts` | module 和 direct-write 契约 | 本轮收口 |
| `apps/api/src/orders/orders.service.test.ts` | 现金事实字段回归 | 已完成 |
| `apps/api/src/orders/use-cases/create-order.use-case.test.ts` | 初始定金 mock/回归 | 本轮收口 |
| `apps/api/src/returns/returns.service.ts` | 三类 Returns 现金事实迁移 | 已完成 |
| `apps/api/src/returns/returns.module.ts` | 引入 FinanceModule | 已完成 |
| `docs/adr/0014-finance-cash-fact-write-seam.md` | 记录所有权与阶段边界 | 已完成 |
| `docs/adr/0015-returns-cash-facts-use-finance-writer.md` | 记录 Returns 迁移决策 | 已完成 |

## 5. 测试矩阵

| 类别 | 场景 | 结果要求 |
|---|---|---|
| 单元 | writer 首次创建 | `created=true`，返回最小结果 |
| 单元 | 同键同输入 | `created=false`，不 create |
| 单元 | 同键金额/来源/日期冲突 | `CASH_FACT_IDEMPOTENCY_CONFLICT` |
| 单元 | 同键 `reversalOfId` 冲突 | `CASH_FACT_IDEMPOTENCY_CONFLICT` |
| 单元 | 数据库唯一竞争 | `CASH_FACT_CONCURRENT_WRITE` |
| 订单 | 初始定金 | OrderPayment 与 PaymentRecord 同事务 |
| 订单 | 普通收款 | 金额聚合、履约版本、来源和现金事实一致 |
| 订单 | 后续更新失败 | 全部订单/现金事实回滚 |
| Finance | 客户收款/冲销 | 兼容入口委托 writer，幂等键不变 |
| Finance | 返利/报销支付 | 兼容返回 `{ id }`，不直接写表 |
| 契约 | orders/finance direct-write 扫描 | 除 writer 外无直接 PaymentRecord 写入 |
| 回归 | API 全量 | 0 failed；真实数据库 opt-in 测试按环境执行 |

## 6. 风险与回滚

- 若 writer 单测失败，停止迁移，不修改数据库 schema。
- 若订单回归失败，保留 Finance adapter 和订单 writer 代码，但不得恢复新的直接 `PaymentRecord` 写入；修正 seam 或回滚整个应用变更。
- 若发现历史 `PaymentRecord` 缺失，不在本轮自动补写；记录为数据核验任务。
- Returns 已迁移；若未来新增 PaymentRecord 类型，必须通过 CashFactWriter 扩展，不得恢复直写。

## 7. 完成定义

满足以下条件才视为本轮完成：

1. PRD V0.4 与 P4 追加评审结论为“通过”。
2. `CashFactWriter` 强制读取、创建、幂等、冲突和并发错误契约已实现。
3. 初始定金和普通订单收款已迁移。
4. FinanceService 四个兼容入口已委托 writer。
5. API typecheck、全量 API 测试和 direct-write contract test 通过。
6. Returns 三类现金事实均通过 writer，生产源码无 direct `PaymentRecord` 写入。

## 8. 实施结果

- `CashFactWriter` 已实现强制 `findFirst` 查询契约、幂等重放、输入冲突、`reversalOfId` 冲突和 `P2002` 竞争错误映射。
- 订单初始定金与普通订单收款已迁移到 writer；订单金额和履约版本仍由 Orders 在同一事务内维护。
- FinanceService 四个兼容写入入口已委托 writer，返回契约保持兼容。
- 定向测试 57/57 通过。
- API 全量测试 452 个中 441 通过、11 个真实数据库 opt-in 测试跳过、0 失败。
- API typecheck 与 `git diff --check` 通过。
- P4 Returns 三类现金事实已迁移；若未来新增 PaymentRecord 类型，必须继续通过 CashFactWriter 扩展，不得恢复直写。
