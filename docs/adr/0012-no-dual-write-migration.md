---
status: accepted
---

# 深化 module 迁移不采用新旧 implementation 双写

迁移采用旧入口适配到新 module interface 的方式。旧入口可以暂时保留，但新的业务事实只能由一个 implementation 产生；不允许新旧两套 implementation 同时写入库存、收款、订单履约或其他核心事实。迁移完成后删除旧路径，并通过 interface contract tests 和现有行为回归验证等价性。
