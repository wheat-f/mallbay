---
status: accepted
---

# 施工履约证据不拥有最终交付状态

施工履约 module 由 `ConstructionFulfillment` 作为 external seam，统一提供施工阶段、履约能力、阻塞原因、施工证据视图、普通施工命令和跨店履约入口。施工记录、证据、跨店任务持久化以及照片、材料、质检和离线同步属于内部 implementation；容量、成本和排班保持独立 seam。

普通施工和跨店履约命令必须由 `ConstructionFulfillment` 归一化访问主体与命令上下文后调用 `OrderLifecycle.transition`。`OrderLifecycle.transition` 是命令事务、幂等记录、履约版本变化、拒绝结果和观测的唯一 authority；`ConstructionFulfillment` 不得直接推进订单或施工状态，也不得通过 `ConstructionService` 形成第二条命令路径。

订单的最终交付状态仍由 `OrderLifecycle` 拥有；施工记录完成、质检通过或施工证据完整，均不得单独等同于最终交付。
