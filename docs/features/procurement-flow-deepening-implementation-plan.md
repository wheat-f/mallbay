# ProcurementFlow 采购执行 seam 实施计划

## 1. 实施状态

| 项目 | 内容 |
|---|---|
| 关联 PRD | `procurement-flow-deepening-prd.md` V0.2 |
| 状态 | 已完成，P0/P1/P2 阶段门通过 |
| 关联 ADR | ADR-0005、0009、0012、0016、0017 |

## 2. 分阶段任务

### P0：Ledger 收货 typed command

- 新增 `receivePurchaseWithin(transaction, input)`。
- Ledger 负责库存批次 upsert、`PURCHASE_IN` 流水、库存事实幂等和 payload 冲突校验。
- ProcurementFlow 作为唯一采购收货入口；InventoryController 的采购收货路径切换到 ProcurementFlow，HTTP 路径不变。
- 补充收货首次提交、重放、payload 冲突、事务回滚和批量部分成功测试。

### P1：采购实现迁移

- 新建 `ProcurementImplementation`，迁移采购需求、采购单、拆供应商、审批、取消、采购查询、收货成本和批量收货。
- ProcurementFlow 直接依赖 ProcurementImplementation，不再依赖 InventoryService。
- 采购状态、收货成本和采购审计写入由 ProcurementImplementation 统一编排。
- 取消状态与审计同事务；收货状态与 Ledger 事实同事务。

### P2：旧采购路径删除门

- 从 InventoryImplementation 和 InventoryService 删除采购公开方法。
- 删除 InventoryLedger 的旧采购转发入口，保留 typed stock-fact command。
- 增加采购 direct-write、双收货 seam、兼容 adapter 和 module export contract tests。
- 运行库存、采购、架构契约测试、TypeScript typecheck、API 全量测试和 diff check。

## 3. 关键实现约束

- 不新增数据库 schema，不允许采购和库存双写。
- 不改变采购状态枚举、HTTP 路径、DTO 字段含义和批量收货部分成功行为。
- `idempotencyKey` 在 ProcurementFlow 收货 seam 必须存在；同 key 不同 payload 必须拒绝。
- 所有跨 module 库存事实写入都使用 Ledger typed command 和当前事务上下文。

## 4. 退出条件

1. 采购 controller 的全部采购写入由 ProcurementFlow 进入 ProcurementImplementation。
2. 收货只有一个生产入口，且库存批次/流水只由 InventoryLedger 写入。
3. 取消、收货成本和采购状态事务原子性测试通过。
4. 拆供应商剩余量、采购状态、部分收货和幂等冲突测试通过。
5. 采购源码 direct-write 与双 seam contract tests 通过。
6. API typecheck、全量测试和 diff check 无失败。

## 5. 实施结果

| 阶段 | 结果 | 证据 |
|---|---|---|
| P0 | 完成 | `InventoryLedger.receivePurchaseWithin`、收货幂等重放/冲突测试、双 HTTP 路径统一 |
| P1 | 完成 | 新建 `ProcurementImplementation`，采购状态/成本/审计事务由采购实现编排 |
| P2 | 完成 | 删除旧采购公开方法与旧 Ledger 转发入口，新增 direct-write、双 seam、模块 wiring 契约测试 |
| 回归 | 通过 | API `447 passed / 11 skipped / 0 failed`；Web `621 passed / 0 failed`；两端 typecheck 通过 |
