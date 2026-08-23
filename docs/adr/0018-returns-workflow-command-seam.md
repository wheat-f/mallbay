---
status: accepted
---

# ReturnsWorkflow owns the return execution command seam

## Context

销售退货和采购退货共享幂等 action、审计和跨模块事实编排，但拥有不同的业务状态机。原 `ReturnsService` 将查询、20+ 个 command 方法、状态条件、事务和事实 adapter 调用全部暴露给 controller，导致 command interface 过宽，调用方必须了解 implementation 细节。

退货执行需要集中退货业务状态和 action 记录，同时遵守既有 ownership：

- Finance 通过 `CashFactWriter` 拥有现金事实写入；
- Inventory 通过 `InventoryLedger` 拥有库存数量事实写入；
- Returns 只拥有退货业务状态、明细、结算调整、action 和审计编排。

## Decision

`ReturnsWorkflow` 是退货 command 的唯一外部 execution seam。controller 将现有 DTO 转换为显式动作类型的 execution command，并调用统一 `execute` interface；销售退货和采购退货在 workflow 内部保留各自状态规则。

`ReturnsWorkflow` 持有退货业务事务，向 `CashFactWriter` 和 `InventoryLedger` 传递窄事务上下文；业务状态、action、审计与对应事实 adapter 调用必须原子提交。

成功重放返回原结果；同幂等键不同请求摘要拒绝；失败 action 不用原幂等键自动重试。并发保护使用 action 唯一约束、事务内状态条件校验和必要的行锁，不新增调用方版本字段。

本期以当前实际状态机为准，不启用 `APPROVED` / `CLOSED`，不新增审核后取消、纯换货零现金结算或成本核验驳回 workflow。销售退款继续使用当前 `ReturnAction.id` 作为现金事实 `sourceId`。

查询列表和详情保持现有行为，不作为本期 command seam 重构目标。

## Consequences

### Positive

- controller 和测试只需要学习一个 command interface。
- 幂等、事务、审计和事实 adapter 编排获得 locality。
- Finance/Inventory ownership 不被退货业务吞并，跨模块事实仍只有一条写入 seam。
- 未来新增退货动作只需在 workflow 内增加状态规则和 command mapping。

### Negative

- workflow implementation 仍需承载两套状态机，不能用一个过度泛化的状态枚举简化它。
- 查询与 command 在本期仍共处同一实现，后续若读取压力或变更频率持续增加，再单独评估 read module seam。
- 统一 dispatch 的 command union 需要维护动作输入的类型映射。

## Rejected alternatives

### 直接给现有 20+ 方法增加 wrapper

拒绝。只增加 wrapper 会形成浅 adapter，复杂度仍停留在 controller 和 public interface，不能通过 deletion test。

### 新增通用 ReturnAdapter 合并销售/采购状态机

拒绝。销售退货和采购退货不是同一 interface 的两个 adapter；真实 adapter 是 Finance 与 Inventory 的事实 seam，两个状态机应保留各自规则。

### 让 Returns 直接写 PaymentRecord 或库存表

拒绝。违反 ADR-0015 和 ADR-0016，破坏现金事实与库存事实的单一 ownership。
