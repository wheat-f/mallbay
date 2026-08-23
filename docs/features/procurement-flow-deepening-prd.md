# ProcurementFlow 采购执行 deep module PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | ProcurementFlow 采购执行 seam 深化 |
| 文档版本 | V0.3 |
| 当前状态 | 已实施，阶段门通过 |
| 日期 | 2026-08-23 |
| 关联 ADR | ADR-0005、ADR-0009、ADR-0012、ADR-0016、ADR-0017 |

## 2. 背景与问题

当前 `ProcurementFlow` 是约 13 个转发方法组成的浅 adapter；采购需求、采购单、审批、取消、拆供应商、收货、收货成本和采购查询仍由 `InventoryImplementation` 承载。采购收货还存在两条入口：采购页面通过 `ProcurementFlow`，库存页面通过 `InventoryLedger`，最终都落到同一库存实现。

影响：

- 采购执行的状态、事务和幂等规则没有集中在采购 module 的 seam。
- 收货事实与采购状态的所有权容易被重复实现。
- 取消状态更新和取消审计当前可能分离提交。
- 同一收货幂等键携带不同 payload 时不会拒绝。
- `ProcurementFlow` 的测试只能验证转发，不能验证采购执行不变量。

## 3. 目标

1. `ProcurementFlow` 成为采购执行的唯一跨 module seam。
2. 将采购执行实现从 `InventoryImplementation` 拆到内部 `ProcurementImplementation`。
3. 由 `ProcurementFlow` 统一拥有采购状态、收货成本、采购审计和事务编排。
4. 收货库存事实全部通过 `InventoryLedger.receivePurchaseWithin` typed command 写入。
5. 保留采购状态、HTTP 路径、DTO 和批量收货部分成功行为，不引入新状态。
6. 通过 contract test 证明采购路径不再依赖 `InventoryService` 的采购方法，也不直接写库存事实。

## 4. 非目标

- 不改变采购需求、采购单和库存数据库 schema。
- 不新增创建采购需求、创建采购单、审批、取消和需求拆单的幂等协议。
- 不把仓库、供应商主数据迁入 ProcurementFlow；它们继续由 `InventoryCatalog` 拥有。
- 不改变批量收货逐行独立事务和部分成功返回语义。
- 不改变采购状态枚举或 HTTP 路径。

## 5. 用户角色与权限

| 角色 | 可查看 | 可执行 | 数据范围 |
|---|---|---|---|
| 店长 | 本门店采购需求、采购单、收货和成本 | 创建、拆单、审批、取消、收货、成本修正 | 指定门店 |
| 采购人员 | 本门店采购需求、采购单、收货和成本 | 创建、拆单、收货、成本修正；审批/取消按现有权限矩阵 | 指定门店 |
| 财务/客服 | 由现有 Finance/权限规则决定的采购读取 | 不新增采购写权限 | 现有范围 |

权限判断仍使用 `AccessContext` 的有效访问能力与门店范围，不信任请求中的岗位字段。

## 6. 核心对象与状态

| 对象 | 定义 | 状态与归属 |
|---|---|---|
| 采购需求 | 表达产品、数量和单位的补货需要 | `OPEN → PARTIAL_ORDERED/ORDERED → PARTIAL_RECEIVED/FULFILLED`，由 ProcurementFlow 更新 |
| 采购单 | 面向供应商的采购执行单据 | `DRAFT → ORDERED → PARTIAL_RECEIVED/RECEIVED`；`DRAFT/ORDERED → CANCELLED`，由 ProcurementFlow 更新 |
| 收货事实 | 采购货物进入库存批次的数量、单位、成本和来源事实 | 由 `InventoryLedger` 写库存批次与 `PURCHASE_IN` 流水；采购成本与采购状态由 ProcurementFlow 同事务更新 |
| 收货成本记录 | 计划价、实际价、差异原因及批次关联 | 由 ProcurementFlow 创建/修正，必须和收货事务一致 |

## 7. 业务流程

### 7.1 采购需求到采购单

1. 访问主体提交采购需求或选择已有需求。
2. ProcurementFlow 校验门店范围、需求明细和供应商。
3. 系统计算每个需求明细的未下单数量。
4. 单供应商或多供应商分配在同一事务中创建采购单。
5. 系统更新需求状态为 `PARTIAL_ORDERED` 或 `ORDERED`。

### 7.2 单批次收货

1. 访问主体提交采购明细、批次、数量、单位、仓库、实际成本和必填幂等键。
2. ProcurementFlow 开启事务并校验采购单状态、数量、仓库和成本差异原因。
3. ProcurementFlow 调用 `InventoryLedger.receivePurchaseWithin` 写入或重放库存批次与 `PURCHASE_IN` 流水。
4. 首次写入时，ProcurementFlow 创建收货成本记录、审计记录，更新采购明细、需求履约数量和采购单/需求状态。
5. 任一写入失败，事务整体回滚。

### 7.3 批量收货

每一行收货独立执行上述单批次流程。成功行提交，失败行回滚并进入 `failed`，整个请求返回 `received/failed`，不因一行失败回滚其他成功行。

## 8. 业务规则

### 8.1 采购单审批与取消

- `DRAFT → ORDERED`：仅采购写权限可执行，非草稿拒绝。
- `DRAFT/ORDERED → CANCELLED`：必须填写非空取消原因；状态更新与取消审计同一事务。
- `PARTIAL_RECEIVED/RECEIVED/CANCELLED` 不允许再次审批或取消。

### 8.2 需求拆单

- 每个供应商至少包含一条有效数量明细。
- 单个需求明细的分配总量不得超过剩余未下单数量。
- 供应商必须是当前门店有效供应商。
- 全部剩余量分配完成时需求为 `ORDERED`，否则为 `PARTIAL_ORDERED`。

### 8.3 收货

- 采购单为 `DRAFT` 或 `CANCELLED` 时拒绝收货。
- 收货累计数量不得超过采购单明细数量。
- 实际价与计划价不同且未填写差异原因时拒绝。
- 批次单位、基础单位、换算比例和仓库校验由 ProcurementFlow 编排，库存批次和流水写入由 Ledger 固定。
- `idempotencyKey` 必填；同一 `storeId + sourceType + sourceId + idempotencyKey` 重试返回原事实。
- 同一 key 的批次号、数量、单位、仓库或成本 payload 不同，返回幂等冲突，不产生新事实。

### 8.4 收货成本修正

- 修正必须在事务中更新收货成本、批次成本及受影响的未结算成本结果。
- 已出库批次的历史库存事实不被静默改写；保留现有成本调整/审计语义。

## 9. 迁移边界

| 阶段 | 迁移内容 | 删除门 |
|---|---|---|
| P0 | Ledger 增加 typed `receivePurchaseWithin`；采购收货统一走 ProcurementFlow | Ledger 事实测试、事务回滚测试 |
| P1 | 新建 `ProcurementImplementation`，迁移采购执行逻辑；ProcurementFlow 直接依赖它 | 采购实现测试、状态/成本/拆单测试 |
| P2 | 删除 InventoryService/InventoryImplementation 的采购公开方法与旧收货入口 | 采购 direct-write contract、双 seam contract、全量回归 |

## 10. 验收标准

```text
Given：采购单为 ORDERED，收货明细数量不超过未收货数量，且携带新的幂等键
When：执行单批次收货
Then：InventoryLedger 写入一个库存批次和一条 PURCHASE_IN 流水，ProcurementFlow 同事务更新成本、采购明细和采购状态
```

```text
Given：收货成本、采购状态或审计任一步骤失败
When：事务结束
Then：库存批次、库存流水、收货成本、采购明细、采购状态和审计均不留下部分提交
```

```text
Given：同一收货幂等键已成功提交
When：使用相同 payload 重试
Then：返回原收货事实，不新增批次数量或库存流水
```

```text
Given：同一收货幂等键已成功提交
When：使用不同批次号、数量、单位、仓库或成本重试
Then：返回幂等冲突，不修改任何采购或库存事实
```

```text
Given：批量收货包含 2 条明细，其中 1 条校验失败
When：提交批量收货
Then：成功行提交、失败行回滚，返回 1 条 received 和 1 条 failed
```

```text
Given：扫描采购生产源码
When：执行 contract test
Then：采购路径不调用 InventoryService 采购方法，不直接写 inventoryBatch/inventoryMovement，所有库存事实调用经过 InventoryLedger
```

## 11. 待确认与默认假设

- 当前无新增产品指标目标值；以测试通过率、重复收货冲突率和采购收货失败可追溯性作为技术验收证据。
- 收货幂等键在 DTO 保持可选以兼容历史调用，但 ProcurementFlow seam 对新执行拒绝缺失 key；前端批量收货需为每行生成 key。若存量客户端不能升级，需在灰度前补齐客户端生成逻辑。

## 12. 实施结果

- `ProcurementImplementation` 已从 `InventoryImplementation` 独立出来，`ProcurementFlow` 不再依赖 `InventoryService`。
- 库存页面与采购页面的收货路径均进入 `ProcurementFlow`；库存批次和 `PURCHASE_IN` 流水只通过 `InventoryLedger` typed command 写入。
- 收货幂等键缺失、相同 payload 重放和不同 payload 冲突均有测试覆盖；前端收货工作台按批次生成稳定键。
- 阶段门证据：API typecheck 通过，API 全量测试 `447 passed / 11 skipped / 0 failed`，Web typecheck 通过，Web 全量测试 `621 passed / 0 failed`。
