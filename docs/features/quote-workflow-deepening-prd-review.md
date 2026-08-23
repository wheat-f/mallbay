# QuoteWorkflow（报价执行）PRD 评审报告

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 评审对象 | `docs/features/quote-workflow-deepening-prd.md` |
| 文档版本 | v0.1-draft |
| 当前阶段 | 架构深化设计评审 |
| 评审范围 | 目标、ownership、interface、流程、状态、权限、幂等、异常、验收与迁移阶段门 |
| 评审结论 | 补充高风险项后重新评审 |

## 2. 结论摘要

### 总体结论

方向正确，QuoteWorkflow 的 scope、事实 ownership 和命令/查询分离符合 `CONTEXT.md`、ADR-0002、ADR-0004 和 ADR-0012。但初稿对跨 module 原子性、重算幂等和兼容映射仍不够具体，不能直接进入实施。

### 问题统计

| 等级 | 数量 | 说明 |
|---|---:|---|
| S0 阻塞 | 0 | 主流程和目标已明确 |
| S1 高风险 | 4 | 需要在实施前写清并加入阶段门 |
| S2 一般问题 | 3 | 不阻塞方向，但影响验收完整性 |
| S3 优化建议 | 1 | 可在实现中处理 |

## 3. 高风险问题

### QW-R1：批准与容量确认的原子性未闭环

- 严重程度：S1
- 所在位置：PRD §7.3、§11.1-5；`apps/api/src/sales-quotes/sales-quotes.service.ts:444-464`；`apps/api/src/construction/capacity-reservation.service.ts:69-75`
- 问题描述：当前报价审批事务先把报价与审批记录写成批准，随后再调用容量 module 的 `confirmQuote`。初稿只写“批准时确认容量”，没有定义容量确认失败时报价应处于什么状态，也没有明确是否新增事务内 adapter。
- 影响：可能出现报价已批准但容量仍为 HELD 或不存在，调用者无法判断是否可以转订单，形成跨 module 事实不一致。
- 修改建议：明确 `CapacityReservationAdapter.confirmQuoteWithin(tx, quoteId)` 或等价的事务内协作方式；批准结果只有在报价、审批和容量确认共同成功时才返回成功。保留容量事实 ownership，不让 QuoteWorkflow 直接写容量表。增加容量缺失、重复确认和确认失败的集成测试。
- 待确认角色：研发、测试
- 是否阻塞研发：是

### QW-R2：重算命令没有稳定幂等标识

- 严重程度：S1
- 所在位置：PRD §7.3、§11.1-9；`apps/api/src/sales-quotes/sales-quotes.service.ts:504-528`
- 问题描述：现有重算使用 `RECALCULATE:${id}:${Date.now()}` 创建新报价。相同请求在网络超时后重试会产生不同命令标识，初稿却要求所有命令重试不得重复生成报价。
- 影响：可能产生多个新报价版本、重复容量占位和多条审计记录。
- 修改建议：为重算命令增加显式 `commandId`，或由调用者传入稳定 idempotency key；同一旧报价、同一命令标识和同一输入指纹重试必须返回同一新报价。旧报价撤回与新报价创建必须通过单一 QuoteWorkflow 执行路径完成。
- 待确认角色：研发、产品
- 是否阻塞研发：是

### QW-R3：`CONVERTED` 状态的唯一写入 authority 需要写死

- 严重程度：S1
- 所在位置：PRD §6.1、§7.2、§11.1-7；`apps/api/src/orders/domain/order-lifecycle.ts:209-255`
- 问题描述：初稿写“QuoteWorkflow 负责转订单，OrderLifecycle 负责订单事实”，但没有明确 `SalesQuote.status=CONVERTED` 和 `convertedOrderId` 必须由 `OrderLifecycle` 在同一事务内写入。当前实现正是由 `convertApprovedQuoteWithin` 完成报价 claim、订单创建、报价关联和审计。
- 影响：实施时可能在 QuoteWorkflow 再加一条报价状态更新，破坏 ADR-0002 的单一订单写入 seam 和 ADR-0012 的禁止双写迁移。
- 修改建议：把“转订单”定义为 QuoteWorkflow 的适配命令，唯一实际状态变更由 `OrderLifecycle` 完成；QuoteWorkflow 不得在调用前后写 `CONVERTED` 或 `convertedOrderId`，只透传 `OrderLifecycle` 的结果。
- 待确认角色：研发
- 是否阻塞研发：是

### QW-R4：现有 HTTP 兼容映射不完整

- 严重程度：S1
- 所在位置：PRD §9、§11；`apps/api/src/sales-quotes/sales-quotes.controller.ts:16-63`；现有 Web 的 `QUOTE_APPROVAL_REQUIRED` 分流
- 问题描述：初稿只说保持路由和响应不变，但未列出每个 route 到 command/read interface 的映射，也未明确已有错误码 `QUOTE_APPROVAL_REQUIRED` 不得被新的通用分类覆盖。
- 影响：Controller 迁移后可能改变 HTTP status、错误 code、审批自动分流或转单重复响应，造成 Web 回归失败。
- 修改建议：增加 route compatibility matrix，逐一固定创建、列表、详情、导出、提交、审批、拒绝、撤回、重算和转单的调用入口、成功结果与错误 code 映射；明确 `QUOTE_APPROVAL_REQUIRED` 保持原有语义。
- 待确认角色：研发、测试、Web
- 是否阻塞研发：是

## 4. 一般问题与优化建议

| 编号 | 等级 | 问题 | 影响 | 修改建议 |
|---|---|---|---|---|
| QW-R5 | S2 | `expire` 的返回值是扫描数量还是成功状态更新数量未定义 | 调度指标和验收可能误判过期成功率 | 固定返回 `scannedCount`、`expiredCount`、`releasePendingCount` 等语义，至少保证 `expiredCount` 可验收 |
| QW-R6 | S2 | 查询分离后成本脱敏字段清单只在旧测试中存在 | 新 read interface 可能漏字段或返回内部定价快照 | 将脱敏字段清单和 finance/non-finance 矩阵写入 contract tests |
| QW-R7 | S2 | 缺少可观测性验收 | 线上无法区分重复命令、容量失败和转单失败 | 沿用现有 audit/observability，增加命令类型、replay、结果 code、失败原因的验证 |
| QW-R8 | S3 | “稳定错误分类”与现有 Nest exception 映射仍偏抽象 | 实施时可能出现重复 code | 以现有错误 code 为基础做最小兼容映射，不一次性重命名所有旧 message |

## 5. 流程与状态评审

主流程可以闭环：创建 → 提交 → 审核/过期/撤回 → 重算或转订单。需要补充两条 authority 规则：

1. 审核批准的成功条件包括报价、审批记录和容量确认的共同成功；失败不得返回已批准成功。
2. 转订单的报价 claim、订单创建、`convertedOrderId` 写入和 `CONVERTED` 状态由 `OrderLifecycle` 在同一事务内完成，QuoteWorkflow 不重复写入。

## 6. 权限与数据范围评审

权限方向与现有 `AccessContext` 一致；需要把“系统调度”限定为内部可信调用上下文，不新增一个可被普通用户模拟的 capability。查询分离后必须复用当前销售本人、店长门店、财务成本查看和跨店来源/执行门店校验。

## 7. 异常与边界评审

必须补充以下 Given / When / Then：

1. Given 审批记录为 PENDING 但容量为 null，When 店长批准，Then 命令失败并留下可诊断结果，报价不返回 APPROVED。
2. Given 同一旧报价和同一重算 commandId，When 请求重试，Then 返回同一新报价，不创建第二个版本。
3. Given QuoteWorkflow 收到已批准报价转单，When OrderLifecycle 已完成同一 commandId，Then 返回既有订单，不再次写报价或订单。
4. Given 销售访问查询，When 返回报价详情或导出，Then 不出现预计成本、临时成本、成本完整性、毛利等内部字段。

## 8. 修改任务清单

| 编号 | 修改任务 | 负责人角色 | 优先级 | 是否阻塞 |
|---|---|---|---|---|
| 1 | 增加审批-容量确认的事务内协作和失败语义 | 研发 | P0 | 是 |
| 2 | 为重算增加稳定 commandId 与 replay 结果 | 研发/产品 | P0 | 是 |
| 3 | 固化 OrderLifecycle 对 `CONVERTED` 与 `convertedOrderId` 的唯一 authority | 研发 | P0 | 是 |
| 4 | 增加 route compatibility matrix 与 `QUOTE_APPROVAL_REQUIRED` 保持规则 | 研发/Web/测试 | P0 | 是 |
| 5 | 补充 expire 结果、脱敏和 observability contract tests | 研发/测试 | P1 | 否 |

## 9. 最终结论

### 是否可以进入研发

当前不建议直接进入实施；补齐 QW-R1 至 QW-R4 后重新评审。

### 通过条件

- PRD 明确批准与容量确认的事务和失败语义。
- PRD 明确重算的稳定幂等标识和旧/新报价关联。
- PRD 明确 `OrderLifecycle` 是 `CONVERTED` 与 `convertedOrderId` 的唯一写入 authority。
- PRD 增加现有 HTTP route、错误 code 和 Web 分流兼容矩阵。

## 10. 修订后复审（v0.2-revised）

### 复审结果

| 项目 | 结果 |
|---|---|
| QW-R1 批准/容量原子性 | 已关闭：增加事务内容量确认 adapter、失败回滚和集成验收 |
| QW-R2 重算幂等 | 已关闭：增加稳定 `commandId`、输入指纹和 replay 规则；禁止使用当前时间作为重试标识 |
| QW-R3 转订单 authority | 已关闭：明确 `OrderLifecycle` 唯一写入 `CONVERTED` 与 `convertedOrderId` |
| QW-R4 HTTP 兼容 | 已关闭：增加 route compatibility matrix，并保留 `QUOTE_APPROVAL_REQUIRED` |
| QW-R5 过期结果 | 已关闭：定义 scanned/expired/release-pending 结果语义 |
| QW-R6 脱敏 | 已关闭：纳入 read contract tests 和权限矩阵验收 |
| QW-R7 可观测性 | 已关闭：纳入 command type、replay、result code、失败分类和耗时验收 |

### 复审结论

PRD v0.2-revised 已能明确回答业务、研发和测试的关键问题：做什么、不做什么、谁拥有事实、状态如何闭环、重复/并发/失败如何处理、路由如何兼容以及如何判断迁移完成。

**结论：可以进入研发。**

进入实施前必须保留以下硬门：

1. 不允许 QuoteWorkflow 直接写容量表、订单表或现金事实。
2. 不允许出现第二条报价状态写入路径。
3. `CONVERTED` 和 `convertedOrderId` 只能由 `OrderLifecycle` 在其事务内写入。
4. 重算的相同 commandId 重试不得产生第二个报价版本。
5. `QUOTE_APPROVAL_REQUIRED` 的现有 Web 分流和报价成本脱敏不得回归。

## 11. 实施验收记录

| 阶段门 | 结果 |
|---|---|
| QuoteWorkflow command/read seam | 通过：Controller 与 scheduler 使用 token interface，module 不再导出 `SalesQuotesService` |
| 批准/容量事务协作 | 通过：`confirmQuoteWithin` / `releaseQuoteWithin` 与容量审计纳入同一事务 |
| 重算幂等 | 通过：稳定 commandId/replay 测试通过，禁止时间戳生成重试标识 |
| 过期结果语义 | 通过：扫描、实际过期和容量释放待重试数量分离 |
| 业务与事实 ownership | 通过：未新增订单、容量、现金事实第二写入路径 |
| 测试与构建 | 通过：API 全量 460/460，typecheck、Nest build 通过；11 个真实 PostgreSQL 测试按环境跳过 |

**最终结论：QuoteWorkflow PRD 已通过评审并完成落地。**
