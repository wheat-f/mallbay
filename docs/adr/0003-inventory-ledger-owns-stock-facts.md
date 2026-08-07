# InventoryLedger 统一拥有库存数量事实

---
status: accepted
---

可用、锁定、出库、收货、调整和单位转换后的库存数量，以 `InventoryLedger` 的库存批次与流水事实为准；采购需求、采购单和订单匹配只能通过该 interface 产生库存事实，不能直接修改数量。库存 module 内部保留采购编排和 Prisma implementation，先通过 interface contract tests 固化批次、单位、幂等、来源和追溯语义，不提前引入只有一个真实实现的外部 adapter。
