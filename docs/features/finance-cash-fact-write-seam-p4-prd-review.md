# 订单现金事实写入 seam P4 追加评审

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 评审对象 | `finance-cash-fact-write-seam-prd.md` V0.4 的 P4 Returns 追加设计与落地结果 |
| 评审日期 | 2026-08-22 |
| 评审范围 | 销售退款、供应商退款、供应商退款冲销的现金事实写入边界 |
| 评审结论 | 通过；可进入实施，且实施验收已完成 |

## 2. 评审结论

- S0 阻塞项：0
- S1 高风险项：0
- S2 建议项：0
- 既有 Returns 权限、HTTP 路径、状态口径和数据库 schema 保持不变。
- Returns 继续拥有退货业务状态、调整单和审计；Finance `CashFactWriter` 统一拥有 `PaymentRecord` 写入、来源、幂等和冲销关系。

## 3. 关键设计核验

| 核验项 | 结果 |
|---|---|
| 销售退款固定为 `CUSTOMER_RECEIPT_REVERSAL` / `EXPENSE` | 通过 |
| 供应商退款固定为 `SUPPLIER_REFUND_OUT` / `OUTFLOW` | 通过 |
| 供应商退款冲销固定为 `SUPPLIER_REFUND_REVERSAL` / `INFLOW` | 通过 |
| 三类事实均有明确 `sourceType`、`sourceId`、`occurredAt` 和幂等键 | 通过 |
| 供应商退款冲销强制 `reversalOfId` 并回写 `reversedById` | 通过 |
| 现金事实与 Returns 状态/调整单在同一事务内提交或回滚 | 通过 |
| 重放不重复创建，输入漂移返回冲突，唯一竞争返回可重试错误 | 通过 |
| Returns、Orders、Finance 生产源码无 writer 之外的 `paymentRecord.create` | 通过 |

## 4. 实施验证证据

- P4 定向 seam 与深模块契约测试：19/19 通过。
- API TypeScript typecheck：通过。
- API 全量测试：452 总计，441 通过，11 个真实数据库 opt-in 测试跳过，0 失败。
- `git diff --check`：通过。

## 5. 最终意见

P4 设计闭环覆盖了所有 Returns 现金事实路径、事务边界、幂等、冲销关系、错误和直接写表删除门。评审通过，代码已落地；后续新增现金事实类型必须扩展 `CashFactWriter`，不得恢复业务模块直接写 `PaymentRecord`。
