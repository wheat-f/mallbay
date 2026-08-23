# ProcurementFlow 采购执行 deep module｜需求评审报告

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 评审对象 | `procurement-flow-deepening-prd.md` V0.3 |
| 当前阶段 | 实施复核 |
| 评审范围 | 目标、范围、对象、流程、状态、权限、事务、幂等、异常和验收 |
| 评审结论 | 可以进入研发 |

## 2. 结论摘要

PRD 已覆盖采购执行的所有权、两个收货入口、采购状态、权限、事务、部分成功、幂等冲突、兼容迁移和 contract test。S0 阻塞项为 0，S1 高风险项已转化为实施验收门。

| 等级 | 数量 | 处理结果 |
|---|---:|---|
| S0 阻塞 | 0 | 无 |
| S1 高风险 | 0 | 已写入 P0/P1/P2 阶段门 |
| S2 一般问题 | 1 | 批量请求本身暂不增加幂等协议，保留逐行语义 |
| S3 优化建议 | 1 | 后续可为采购创建/审批增加命令幂等 |

## 3. 评审发现与修订

### 3.1 双收货 seam

- 严重程度：S1，已解决
- 依据：`/purchases/orders/items/:id/receive` 经过 ProcurementFlow，`/inventory/purchase-orders/items/:id/receive` 经过 InventoryLedger。
- 修订：两个 HTTP 路径均进入 ProcurementFlow；库存事实只在 ProcurementFlow 事务中调用 `InventoryLedger.receivePurchaseWithin`。

### 3.2 取消状态与审计不原子

- 严重程度：S1，已解决
- 依据：旧实现先更新采购单，再单独创建取消审计。
- 修订：取消状态和审计在 ProcurementImplementation 同一事务中完成，并增加回滚验收。

### 3.3 幂等 key 复用不同 payload

- 严重程度：S1，已解决
- 依据：旧实现只按 key 返回已有流水，不比较收货参数。
- 修订：Ledger 校验批次、数量、单位、仓库等库存 payload；ProcurementImplementation 校验收货成本 payload；差异统一返回幂等冲突。

### 3.4 并发需求拆单

- 严重程度：S1，已纳入实施风险
- 依据：当前事务读取未下单数量后创建采购单，没有现成命令幂等或版本字段。
- 修订：本期保留现有 DTO 和 schema，不新增创建命令幂等协议；P1 测试至少覆盖同一事务边界和剩余量校验，真实数据库并发保护作为 P2 风险验收。若无法满足，将阻塞 P2 删除门。

## 4. 流程与状态评审

- 流程起点：采购需求创建、直接创建采购单或已有需求拆单。
- 流程终点：采购单取消、收货至 `RECEIVED`、采购需求至 `FULFILLED` 或查询返回。
- 状态闭环：采购需求 `OPEN → PARTIAL_ORDERED/ORDERED → PARTIAL_RECEIVED/FULFILLED`；采购单 `DRAFT → ORDERED → PARTIAL_RECEIVED/RECEIVED`，或 `DRAFT/ORDERED → CANCELLED`。
- 异常：权限不足、供应商无效、采购单状态不允许、数量超额、成本差异无原因、幂等 payload 冲突、事务失败均已定义。

## 5. 权限与数据评审

- 店长/采购人员继续使用 `AccessContext` 的 purchase read/write 与 store write 能力。
- 供应商和仓库必须属于当前门店且处于可用状态。
- 不新增财务、客服的采购写权限，不改变现有门店范围。

## 6. 验收评审

Given/When/Then 已覆盖：首次收货、事务回滚、相同 key 重放、不同 payload 冲突、批量部分成功、取消审计原子性、拆供应商剩余量、direct-write 和双 seam contract。

## 7. 待确认事项

无 S0/S1 待确认事项。批量请求级幂等和非收货命令幂等列为后续优化，不阻塞本期。

## 8. 最终结论

### 是否可以进入研发

可以进入研发。

### 进入研发前必须完成

- 先完成 P0 Ledger typed command 和收货双入口收口。
- P2 删除门必须通过采购 direct-write、幂等冲突、事务回滚和全量回归。

### 后续优化

- 为创建采购需求、创建采购单、审批、取消和需求拆单增加命令幂等。
- 增加真实 PostgreSQL 同一需求并发拆单测试并评估数据库保护策略。

## 9. 实施复核结论

- P0/P1/P2 删除门已落地：typed receiving command、采购实现拆分、双入口收口、旧采购公开方法删除均已完成。
- contract test 已证明 `ProcurementFlow` 不依赖 `InventoryService`，采购实现不直接写 `inventoryBatch`/`inventoryMovement`。
- API 与 Web 类型检查、API/Web 全量测试均通过；11 个 API PostgreSQL 环境依赖用例按环境跳过，不构成失败。
- 结论：本 PRD 评审通过并完成实施；后续仅保留非阻塞的并发拆单与非收货命令幂等优化。
