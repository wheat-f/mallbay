# InventoryLedger 库存事实写入 seam 收口 PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | InventoryLedger 库存事实写入 seam 收口 |
| 文档版本 | V0.2 |
| 当前状态 | P0/P1/P2 已完成，评审通过 |
| 日期 | 2026-08-22 |
| 适用范围 | API inventory、orders、construction、returns、procurement |
| 关联 ADR | ADR-0003、ADR-0005、ADR-0009、ADR-0012、ADR-0016 |

## 2. 背景与问题

现有 `InventoryLedger` 主要是把 `InventoryService` 方法转发出去的浅 seam。库存批次、库存流水和订单库存分配曾由多个 implementation 直接写入：

- `InventoryService` 负责库存、采购收货、锁库、出库和调整；
- `OrderLifecycle` 直接释放库存分配并创建流水；
- `ConstructionService` 直接创建核验、领取和损耗流水；
- `ReturnsService` 直接创建退货批次、调整批次数量和退货流水。

这使库存事实的数量不变量、来源、幂等和事务关系无法集中验证。

## 3. 目标

1. `InventoryLedger` 成为库存事实的唯一写入 seam。
2. 使用显式 typed commands 固定库存动作与流水类型，不允许调用方拼接任意 `movementType`。
3. 跨模块 workflow 可以把 Ledger 命令加入自身事务，保持业务状态与库存事实原子提交。
4. 业务模块继续拥有订单、施工、退货和采购状态，不把这些状态移入 Ledger。
5. 通过 direct-write contract test 证明四类跨模块调用者不再直接写库存事实。

## 4. 接口设计

### 4.1 业务命令

`InventoryLedger` 对外保留库存查询/命令 seam，并新增事务内 typed commands：

- `releaseWithin`：释放订单预留并生成 `STOCK_RELEASE`；
- `verifyMaterialWithin`：生成零数量核验流水；
- `pickupMaterialsWithin`：生成零数量领取流水；
- `recordMaterialLossWithin`：校验可用数量、扣减批次并生成 `DAMAGE_OUT`；
- `receiveSalesReturnWithin`：创建销售退货批次并生成 `RETURN_IN` 或 `DAMAGE_OUT`；
- `convertSalesReturnInspectionWithin`：创建检验子批次、扣减原批次并生成 `STOCK_ADJUST` 或 `DAMAGE_OUT`；
- `outboundPurchaseReturnWithin`：扣减采购退货批次并生成 `RETURN_OUT`。

调用方不能传入任意库存流水类型来替代上述命令。已有 `reserve`、`release`、`receive`、`outbound`、`adjust`、`trace` 保持兼容，旧入口继续作为 adapter。

### 4.2 事务规则

- 独立库存 HTTP 命令由 Ledger 负责开启事务。
- 订单履约、施工、采购和退货 workflow 由自身事务负责整体原子性，并将事务上下文传入 Ledger。
- Ledger 只操作库存事实所需的窄模型能力；业务状态更新仍由调用方完成。
- Ledger 命令失败时，调用方事务整体回滚，不留下孤立库存流水或批次数量变化。

### 4.3 当前迁移边界

`InventoryImplementation` 是 InventoryModule 内部的 Prisma implementation，承载既有库存/采购入口的底层行为；`InventoryService` 已降为无 Prisma 写入的兼容 adapter。跨模块 workflow 只能依赖 `InventoryLedger`，InventoryModule 不向外暴露 `InventoryService` 或 `InventoryImplementation`。

## 5. 不变规则

- 不改变 HTTP 路径、DTO、角色权限、订单/采购/施工/退货状态和数据库 schema。
- 不新增新旧 implementation 双写。
- 不修改历史库存流水；历史直写仅保留读取兼容。
- 采购收货状态与收货事实仍在同一事务提交。

## 6. 验收标准

```text
Given：订单履约、施工、退货或采购流程需要改变库存事实
When：执行对应 InventoryLedger typed command
Then：库存批次、分配和流水由 Ledger 写入，调用方只更新自己的业务状态
```

```text
Given：任一调用方在 Ledger 命令之后更新业务状态失败
When：事务回滚
Then：库存批次、库存分配、库存流水和业务状态均不产生部分提交
```

```text
Given：扫描 inventory、orders、construction、returns 生产源码
When：执行 direct-write contract test
Then：orders、construction、returns 不存在 inventoryBatch/inventoryMovement/orderInventoryAllocation 的直接写入；InventoryService 不包含 Prisma 写入，InventoryImplementation 仅作为 InventoryModule 内部 implementation 保留
```

```text
Given：同一业务操作幂等键重复提交
When：再次执行 Ledger 命令
Then：返回原事实或稳定冲突，不产生第二条库存流水
```
