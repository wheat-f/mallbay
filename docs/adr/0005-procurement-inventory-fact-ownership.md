---
status: accepted
---

# 采购执行不拥有库存数量事实

采购执行负责采购需求、采购单、审批和收货过程编排；库存批次、数量、单位、来源、幂等和流水事实由 `InventoryLedger` 统一产生。采购收货必须调用库存流水事实的 interface，不得由采购 implementation 直接更新库存批次或数量。

供应商主数据可以继续作为采购 implementation 的内部能力，除非未来形成独立的供应商关系 module。第一阶段不把供应商主数据、采购状态和库存数量合并为一个 public interface。
