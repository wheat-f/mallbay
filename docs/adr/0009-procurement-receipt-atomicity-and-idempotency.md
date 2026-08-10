---
status: accepted
---

# 采购收货与库存收货事实原子提交并由业务操作保证幂等

采购收货状态和 `InventoryLedger` 的收货事实必须在同一事务中提交，避免采购单与库存数量事实分叉。采购执行或订单履约 module 生成稳定的业务操作幂等键，`InventoryLedger` 负责持久化校验并拒绝重复产生库存事实。迁移期间不允许采购和库存两套 implementation 双写。
