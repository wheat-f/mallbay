# InventoryLedger 库存事实写入 seam 实施计划

## 1. 实施状态

| 项目 | 内容 |
|---|---|
| 关联 PRD | `inventory-ledger-fact-seam-closure-prd.md` V0.2 |
| 关联 ADR | ADR-0003、ADR-0005、ADR-0009、ADR-0012、ADR-0016 |
| 状态 | P0/P1/P2 已完成 |

## 2. 分解

### P0：Ledger typed command 与事务上下文

- 固定库存事实命令及类型/来源映射。
- 为已有 Ledger 增加事务内命令。
- 增加命令结果、回滚和 direct-write 契约测试。

### P1：跨模块调用者迁移（已完成）

- `OrderLifecycle.releaseReversibleFacts` 使用 `releaseWithin`。
- `ConstructionService` 的核验、领取、损耗使用对应 Ledger 命令。
- `ReturnsService` 的销售退货收货、检验转换、采购退货出库使用 Ledger 命令。
- 采购收货继续由 `InventoryService`/`ProcurementFlow` 在同一事务内调用 Ledger 事实实现。

### P2：旧路径删除门（已完成）

- 将原 `InventoryService` Prisma implementation 移至内部 `InventoryImplementation`。
- 将 `InventoryService` 收敛为只做委托的兼容 adapter，adapter 不包含库存事实 Prisma 写入。
- `InventoryLedger` 直接依赖 `InventoryImplementation`，并继续作为跨模块唯一库存事实 seam。
- 扩展 direct-write contract test 校验 inventory adapter、orders、construction、returns。
- 执行 API typecheck、定向测试、API 全量回归和 diff check。

## 3. 退出条件

1. 四类真实调用者通过 Ledger typed commands 写入库存事实。
2. 跨模块事务回滚测试通过。
3. orders、construction、returns 生产源码 direct-write 扫描通过；InventoryService 仅保留为无写入兼容 adapter，InventoryImplementation 为模块内部实现。
4. API 类型检查和全量测试无失败。

## 4. 本阶段验证结果

- 定向 seam、adapter deletion-gate 与 direct-write 契约测试文件：21/21 通过。
- API 全量测试：455 总计，444 通过，11 个真实数据库 opt-in 测试跳过，0 失败。
- API TypeScript typecheck：通过。
