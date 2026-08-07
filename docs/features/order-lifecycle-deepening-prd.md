# MallBay 业务事实与流程模块深化 PRD

> 文档类型：架构深化产品需求文档（PRD）
> 文档版本：V2.9
> 当前状态：实施中；核心契约与主要调用方迁移已完成，已补登录态空数据验收，仍待有业务数据的核心详情页验收
> 创建日期：2026-08-07
> 适用范围：MallBay Web 管理端及 API 模块化单体

## 1. 需求背景

### 1.1 业务背景

MallBay 的订单、施工、库存、采购、定价、客户、结算、财务、身份权限和平台能力相互依赖。当前多个 service 和页面分别读取或拼接状态，容易产生以下问题：

- 同一个业务事实由多个模块重复解释。
- 订单完成、库存数量、价格成本、客户消费和已收款的口径不一致。
- 跨模块写入的事务边界不清晰，可能产生半成品。
- 页面和 Controller 需要知道过多内部表结构、状态组合和权限判断。
- 大型 service 继续增长，测试只能覆盖实现细节，难以验证业务契约。

### 1.2 核心问题

本轮不是按文件大小拆 service，而是为能够隐藏业务复杂度、统一事实来源的模块建立 deep module interface，并明确：

1. 谁拥有事实。
2. 谁负责状态解释。
3. 谁负责跨模块事务。
4. 消费者可以依赖什么结果。
5. 哪些内部实现不得被页面和其他模块绕过。

### 1.3 关联材料

- [`architecture-review-mallbay-20260807`](../architecture-review-mallbay-20260807.md)
- [`ADR-0001 Operational Report`](../adr/0001-operational-report-module.md)
- [`ADR-0002 OrderLifecycle`](../adr/0002-order-lifecycle-final-delivery.md)
- [`ADR-0003 InventoryLedger`](../adr/0003-inventory-ledger-owns-stock-facts.md)
- [`ADR-0004 PricingDecision`](../adr/0004-pricing-decision-snapshots.md)
- [`CONTEXT.md`](../../CONTEXT.md)

## 2. 产品目标

- 建立 7 个模块的事实归属、公开契约和实施优先级。
- 让页面和 Controller 消费能力、结果和只读摘要，不自行拼接业务事实。
- 保持现有 API、权限、状态含义和历史数据不被无意改变。
- 通过 contract tests 固化现有正确行为，再进行内部实现重组。
- 为后续订单履约、库存、定价、结算和财务分析提供一致数据基础。

## 3. 本期范围与非目标

### 3.1 本期范围

| 优先级 | 模块 | 本期要形成的能力契约 |
|---|---|---|
| P0 | 订单履约闭环 | `OrderLifecycle`：履约阶段、能力、最终交付和跨模块原子事务 |
| P0 | 库存采购事实 | `InventoryLedger`：预留、释放、收货、出库、调整和追溯；采购编排保留在内部 |
| P1 | 定价与成本规则 | `PricingDecision`：价格、成本、命中规则版本、快照和审批原因 |
| P1 | 客户与企业结算 | `CustomerAccount` 与 `SettlementView`：客户/车辆关系、标签、消费摘要和企业对账读取 |
| P1 | 财务单据与现金事实 | `FinancialDocument`：单据状态、审批动作、现金事实和来源追溯读取 |
| P2 | 身份、成员与权限 | `AccessContext`：身份、门店范围、岗位、能力和数据裁剪 |
| P2 | 平台与可观测性 | `AuditEventWriter`、`NotificationDispatcher`：审计写入和通知派发共享契约 |

### 3.2 非目标

- 不拆分微服务，不引入消息总线或事件溯源。
- 不新增业务状态，除非后续独立 PRD 通过评审。
- 不改变现有 API 的业务含义、权限模型或历史数据口径。
- 不让只有一个真实实现的 Prisma 查询被包装成无意义的公开 adapter。
- 不将所有 service 机械按文件大小拆分。
- 不在本 PRD 内完成页面视觉重写、报表指标新增或小程序适配。
- 不把异步通知作为仍需原子一致的业务写入替代方案。

## 4. 已确认的跨模块规则

### 4.1 事实所有权

| 事实 | 唯一业务拥有者 | 其他模块的使用方式 |
|---|---|---|
| 订单履约阶段和最终交付 | `OrderLifecycle` | 通过 view/capability/result 读取或提交 command |
| 库存数量、预留、批次和流水 | `InventoryLedger` | 通过 ledger command 变更，不直接写批次数量 |
| 订单价格和成本判断 | `PricingDecision` | 在报价/订单边界取得并冻结 snapshot |
| 客户/车辆关系和客户标签 | `CustomerAccount` | 通过客户摘要和历史投影读取 |
| 收款、付款和现金流水 | `FinancialDocument` 及其现金事实 | 通过来源追溯和只读查询使用 |
| 身份、门店范围和能力 | `AccessContext` | 业务模块只消费授权上下文 |
| 审计事件和通知派发 | 平台共享能力 | 业务模块提交结构化事件，不自行实现渠道细节 |

### 4.2 已确认的订单履约规则

- 最终交付允许店长/管理员执行；销售、施工、财务和售后只能完成各自前置动作。
- 跨店订单由订单归属门店的店长/管理员执行最终交付；施工门店不能仅凭施工权限完成交付。
- 质保只在最终交付事务中自动生成并激活，本轮不新增独立人工生成入口。
- `PENDING_DELIVERY` 只作为内部派生状态；满足条件后订单统一进入 `COMPLETED`。
- 已完成交付的重复请求返回幂等成功，不重复生成质保、审计或待办关闭动作。
- 前置条件不满足返回业务错误；并发状态版本冲突返回冲突错误。
- 应用用例负责开启事务并传入事务上下文；`OrderLifecycle` 负责事务内的业务原子性和一致性检查。

### 4.3 统一写入原则

每个跨模块写入必须写清“条件 → 动作 → 结果”，并满足：

1. 事务内完成必须原子完成的事实。
2. 事务外只发送成功后的通知和非关键派生任务。
3. 重复请求必须可识别，不能产生重复业务事实。
4. 失败必须返回稳定错误类别和可展示的阻塞原因。
5. 页面不得用多个原始状态字段自行推断最终业务状态。

## 5. 用户角色与数据范围

| 角色 | 主要职责 | 默认数据范围 | 本轮关键操作 |
|---|---|---|---|
| 店长/管理员 | 门店经营和最终业务确认 | 本门店；管理员按现有授权扩大 | 最终交付、库存调整、权限管理 |
| 销售 | 客户、报价和订单前置信息 | 本人/本门店 | 创建订单、提交报价、查看履约结果 |
| 施工人员 | 施工、材料使用和质检前置 | 被派工任务及施工门店 | 开始/完成施工、提交质检材料 |
| 财务 | 收款、付款、发票和结算 | 授权门店/组织 | 登记或核验现金事实、处理财务单据 |
| 售后/质保 | 质保和售后处理 | 关联客户、订单和任务 | 查看已激活质保、处理售后 |
| 审计/平台管理员 | 跨组织追溯和平台治理 | 授权组织范围 | 查看审计、重试通知、处理权限问题 |

无权限时返回统一拒绝结果，不通过空数据伪装成无记录；数据范围由 `AccessContext` 提供，业务模块不得自行解析 JWT 或重复判断成员关系。

## 6. 模块需求与公开契约

### 6.1 P0：订单履约闭环 `OrderLifecycle`

#### 模块目标

统一订单创建后的派工、施工阶段、质检、收款条件、最终交付、取消/回退和能力查询。订单 `COMPLETED` 只表示最终交付完成，不等同于施工记录 `COMPLETED`。

#### 公开契约

```text
getLifecycle(orderId, actor) -> OrderLifecycleView
createOrder(actor, input) -> OrderCreated
transition(actor, orderId, command) -> OrderLifecycleResult
listCapabilities(actor, orderIds) -> OrderCapabilityMap
```

`transition` 支持现有业务允许的派工、开始施工、完成施工、质检、最终交付、取消和回退 command。页面只消费能力和结果。

#### 最终交付规则

当订单属于当前授权范围、施工已完成、质检通过、收款条件满足且订单未处于终态时，店长/管理员发起最终交付；系统在同一事务内：

1. 创建并激活质保。
2. 将订单置为 `COMPLETED`。
3. 写入审计事件。
4. 关闭对应余额待办。

任一步骤失败则整体回滚；成功后才允许发送通知。

#### 验收

- Given：施工完成、质检通过、余额为零、操作者为归属门店店长；When：提交最终交付；Then：订单完成、质保激活、审计写入、余额待办关闭且各事实只产生一次。
- Given：施工完成但质检未通过；When：提交最终交付；Then：拒绝并返回质检阻塞原因，订单不变。
- Given：订单已完成；When：重复提交；Then：返回幂等成功，不新增质保或审计事实。
- Given：施工门店与订单归属门店不同；When：施工人员提交最终交付；Then：拒绝，归属门店授权角色仍可操作。

### 6.2 P0：库存采购事实 `InventoryLedger`

#### 模块目标

统一库存数量、批次、预留、释放、出库、收货、调整、单位换算和流水追溯。采购需求、采购单和收货流程不得绕过 ledger 直接修改可用库存。

#### 公开契约

```text
reserve(input) -> ReservationResult
release(input) -> ReleaseResult
receive(input) -> ReceiptResult
outbound(input) -> OutboundResult
adjust(input) -> AdjustmentResult
trace(input) -> InventoryTrace
```

每次数量变更必须返回批次、标准单位、数量、来源对象、幂等键和流水编号；单位转换只能使用统一 domain function。

#### 业务规则

- 订单匹配只产生预留或匹配结果，不直接扣减库存。
- 采购收货在验收成功后通过 `receive` 增加库存事实。
- 施工领料通过 `outbound` 产生出库流水；释放未使用预留不能产生负库存。
- 库存调整必须带原因、操作者和来源，并保留前后数量。
- 相同幂等键重复提交返回原结果，不重复写流水。

#### 验收

- Given：库存有可用批次；When：预留并重复提交同一幂等键；Then：只存在一笔预留事实，返回相同结果。
- Given：采购单未完成收货验收；When：查询可用库存；Then：不包含该采购单未验收数量。
- Given：出库数量大于可用数量；When：提交出库；Then：拒绝且库存和流水不变。
- Given：任意数量变化；When：查询追溯；Then：可定位批次、单位、来源、操作者和流水。

### 6.3 P1：定价与成本规则 `PricingDecision`

#### 模块目标

将规则配置、版本发布、灰度、车型映射、施工标准、岗位费率和模拟计算封装为一次可追溯的业务决策。正式报价和订单必须冻结价格/成本快照，规则发布后不回算历史单据。

#### 公开契约

```text
decide(input, context) -> PricingDecisionResult
```

结果至少包含销售价格、成本、命中规则版本、适用范围、快照标识、计算时间和审批/人工介入原因。配置 CRUD、冲突校验、发布和 rollout 留在模块内部。

#### 验收

- Given：规则版本在生效范围内且输入完整；When：请求定价；Then：返回确定结果、规则版本和可追溯快照。
- Given：输入缺少车型或规则冲突；When：请求定价；Then：不返回伪造价格，返回可解释错误。
- Given：规则发布后历史订单已冻结；When：查询历史订单；Then：仍使用原价格和成本快照。

### 6.4 P1：客户与企业结算 `CustomerAccount` / `SettlementView`

#### 模块目标

统一客户、车辆归属、人工标签、系统标签、消费摘要和企业跨订单结算读取口径。客户模块拥有客户/车辆关系；企业结算只读客户和订单事实，不反向拥有客户或订单状态。

#### 公开契约

```text
getCustomerSummary(customerId, actor) -> CustomerSummary
getVehicleSummary(customerId, actor) -> VehicleSummary[]
maintainManualTags(customerId, actor, command) -> TagResult
getSettlementView(customerId, actor, period) -> SettlementView
```

消费摘要按既定规则同时纳入已完成和在途订单；金额、订单数和待收金额分别标注口径。企业对账按企业客户和期间聚合，订单明细可追溯到来源订单。

#### 验收

- Given：客户存在在途订单；When：查看客户消费摘要；Then：摘要按既定口径包含在途订单，不将其误记为已完成消费。
- Given：有客户维护权限；When：新增、移除人工标签；Then：只改变人工标签，不覆盖系统标签，并记录操作者和时间。
- Given：无客户维护权限；When：提交标签变更；Then：拒绝且客户标签不变。
- Given：企业有多笔订单且期间已确定；When：查看对账；Then：每笔汇总均可展开到来源订单，期间外订单不计入。

### 6.5 P1：财务单据与现金事实 `FinancialDocument`

#### 模块目标

区分业务单据状态、审批动作、现金/反向现金流水和来源单据。发票、返利、提成、费用和报销保留各自 workflow，但不各自重新定义“已收款”。

#### 公开契约

```text
getDocumentView(documentId, actor) -> FinancialDocumentView
listCashFacts(query, actor) -> CashFact[]
traceSource(documentId, actor) -> SourceTrace
```

#### 业务规则与验收

- 单据状态变化、审批动作和现金事实分别记录，不能用单据状态替代到账事实。
- 付款、退款和冲正必须形成可追溯的正向或反向现金事实，并关联来源单据。
- Given：发票已开但未收款；When：查询现金事实；Then：不显示为已收款。
- Given：现金事实已冲正；When：查询余额和来源追溯；Then：原事实与冲正事实均可见，净额按统一口径计算。
- Given：无权查看财务数据；When：查询单据或现金事实；Then：拒绝而非返回脱敏后的不完整结论。

### 6.6 P2：身份、成员与权限 `AccessContext`

#### 模块目标

集中表达当前身份、门店范围、岗位、能力和数据裁剪。认证、成员、角色绑定和设置仍由内部 implementation 维护。

#### 公开契约

```text
resolve(request) -> AccessContext
can(context, capability, resource) -> AccessDecision
scope(context, resourceType) -> DataScope
```

业务模块不得重复解析 JWT、成员记录或 `process.env` 能力配置。角色变更、门店调动和离职后的新请求必须使用最新上下文；历史审计保留当时操作者身份。

#### 验收

- Given：用户无目标门店范围；When：访问门店资源；Then：拒绝且不泄露资源是否存在。
- Given：用户角色被撤销；When：发起新的写操作；Then：按最新能力拒绝。
- Given：用户有门店范围但无具体能力；When：读取/写入资源；Then：读取和写入按能力分别判断。

### 6.7 P2：平台与可观测性 `AuditEventWriter` / `NotificationDispatcher`

#### 模块目标

提供稳定的审计写入和通知派发契约，保证关键业务事实可追溯、成功后通知可重试，且通知失败不回滚已提交的核心事实。

#### 公开契约

```text
write(event) -> AuditEventRef
dispatch(notification) -> DispatchResult
```

审计事件至少包含事件类型、主体、来源模块、操作者、组织范围、关联对象、幂等键和发生时间。通知至少包含接收对象、模板/类型、跳转目标和去重键。审计属于核心事务的一部分；通知在事务成功后派发并支持重试。

#### 验收

- Given：关键业务事务成功；When：提交事务；Then：存在一条可追溯审计事件。
- Given：关键业务事务回滚；When：查询审计；Then：不存在该未提交业务事实的审计事件。
- Given：事务成功但通知渠道失败；When：执行重试；Then：核心业务事实不重复，通知按去重键最多产生一次有效送达。

## 7. 统一状态与结果约定

各模块不得把不同对象的状态直接等价。所有 command 结果至少区分：成功、幂等成功、业务前置条件失败、权限拒绝、资源不存在、并发冲突、系统失败。错误结果包含稳定错误类别、阻塞原因和关联对象，不返回内部数据库错误。

终态对象不能通过普通 command 再次改变；需要恢复或冲正时，必须由对应模块提供明确的反向业务动作和审计记录。

## 8. 跨模块依赖与实施顺序

```text
AccessContext ─┐
               ├─ OrderLifecycle ── CustomerAccount / SettlementView
InventoryLedger┘          │                    │
                          ├─ PricingDecision  └─ FinancialDocument
                          └─ AuditEventWriter / NotificationDispatcher
```

实施顺序：

1. 订单履约闭环：先固化 contract tests 和最终交付事务。
2. 库存采购事实：固化数量、单位、幂等、流水契约，再迁移采购编排。
3. 定价与成本：冻结决策和订单报价快照。
4. 客户与企业结算：统一客户/车辆摘要、标签和在途/已完成消费口径。
5. 财务单据与现金：统一现金事实和来源追溯。
6. 身份成员权限：收拢 `AccessContext`，降低重复鉴权。
7. 平台可观测性：统一审计和通知写入约定，服务以上模块。

每个阶段遵循：现有行为基线 → contract tests → 内部 implementation 重组 → 消费者迁移 → 全量回归。

## 9. 权限、数据与兼容要求

- 继续使用现有权限模型和门店数据范围，不新增隐含超级权限。
- 公共契约返回业务摘要和结果，不暴露 Prisma 类型、表结构或内部状态组合。
- 历史数据缺失时返回“不可核验/待补充”等明确结果，不自动补造事实。
- 旧 API 继续由适配层提供，消费者迁移完成前不得删除旧入口。
- 任何口径变化必须先更新 PRD、ADR、contract tests 和数据迁移说明。

## 10. 统一验收标准

- 每个模块拥有至少一组 contract tests，覆盖成功、失败、重复、权限和并发边界。
- 任一模块的事实只能通过其公开 command 写入，绕过路径在代码审查和测试中被禁止。
- 1440、1024、390 宽度的页面不因模块迁移产生新的溢出或遮挡。
- 关键操作具备 loading、success、error、disabled 和无权限反馈。
- `typecheck`、现有测试、代表页面检查和生产构建通过。
- 订单、库存、价格、客户消费、现金事实和权限结果可从来源对象追溯。

## 11. 研发任务拆解

| 阶段 | 任务 | 产出 | 进入条件 |
|---|---|---|---|
| 1 | 为 7 个契约建立类型、错误类别和 contract tests | 可执行契约测试 | 本 PRD 通过 |
| 2 | 实现 `OrderLifecycle`、迁移最终交付 | 订单履约统一 seam | 阶段 1 通过 |
| 3 | 实现 `InventoryLedger`、迁移库存和采购写入 | 库存事实唯一写入口 | 阶段 2 回归通过 |
| 4 | 实现 `PricingDecision` 并冻结快照 | 价格/成本可追溯 | 阶段 3 回归通过 |
| 5 | 实现客户结算和财务只读投影 | 结算/现金统一读取 | 阶段 4 回归通过 |
| 6 | 实现 `AccessContext`、平台审计/通知契约 | 统一权限与可观测性 | 阶段 5 回归通过 |

### 11.1 本轮实施进度

- 已完成 7 个业务模块和 2 个平台共享能力的 Nest seam：`OrderLifecycle`、`InventoryLedger`、`PricingDecision`、`CustomerAccount`、`SettlementView`、`FinancialDocument`、`AccessContext`、`AuditEventWriter`、`NotificationDispatcher`。
- 已将最终交付改为显式的归属门店店长/管理员 command；收款和施工质检只写入各自事实，不再隐式完成订单。最终交付事务负责质检、收款、订单终态、质保激活、审计和待办关闭，并处理重复提交。
- 已将库存预留/收货/出库/释放/调整入口迁移到 `InventoryLedger`；采购入库和人工调整新增可选幂等键，`InventoryMovement` 通过唯一约束防止同一来源重复写入，历史调用方无需传入该字段即可兼容。
- 已移除公开的独立人工生成质保入口，质保生成和激活收敛到最终交付事务。
- 已将财务费用详情和付款记录查询迁移到 `FinancialDocument`，并导出该模块契约；原查询服务保留为兼容 implementation。
- 已将创建订单的价格快照校验迁移到 `PricingDecision`，客户结算列表迁移到 `SettlementView`，门店权限上下文和店长变更通知分别接入 `AccessContext`、`NotificationDispatcher`。
- 已为库存人工调整补充服务层幂等回归；订单创建、客户标签/车辆和定价模拟入口也已统一通过对应契约。
- 已将门店审核、冻结、店长变更及成员邀请/移除的通知与权限调用迁移到平台契约。
- 已将上述门店核心操作的审计调用迁移到 `AuditEventWriter`，保留 `AuditLogService` 作为兼容回退。
- 已将订单改单、支付账户和商业信息变更等核心订单审计调用迁移到 `AuditEventWriter`；事务内持久化审计仍由现有 `persistAuditEvent` 保证。
- 已将设置访问和门店能力检查迁移到 `AccessContext`，成员、设置和门店不再必须直接调用 `PermissionsService`。
- 已将用户管理、基础字典和设置审计的权限判断迁移到 `AccessContext`，保留旧权限服务作为兼容回退。
- 已将总部字典模板权限判断也迁移到 `AccessContext`；剩余 `PermissionsService` 调用仅作为兼容回退或底层契约 implementation。
- 已将施工派工、开工、完工和质检通过 `OrderLifecycle` 注册的施工 transition handler 收拢；请假、跨店协作通知，以及产能和施工成本审计继续迁移到平台契约。
- 已将定价规则、成本配置、价格发布、模板和报价服务的审计调用迁移到 `AuditEventWriter`。
- 审计事件新增可选幂等键及唯一约束；通知 dispatcher/服务新增可选去重键并映射到现有 `Notification.todoKey`，旧调用保持兼容。
- `OrderLifecycle` 已提供 `createOrder`、`getLifecycle`、`getCapabilities`、`listCapabilities`、最终交付、取消和反审核退回 command；订单创建、详情、最终交付、取消和退回已消费正式生命周期契约；施工派工/开工/完工/质检仍待从 `ConstructionService` 提取，`derive` 仅保留兼容别名。
- `AuditEventWriter.writeTransactional` 已支持“先持久化、再输出日志”；订单、施工、定价和报价的已有审计 helper 已迁移，避免事务失败后留下已提交日志假象。
- `NotificationDispatcher` 的去重键重试会返回原通知；并发唯一键冲突也会回读原通知，不向业务层泄露数据库冲突。
- 客户企业结算的对账单、收款和红冲审计，以及产品建议价、材料成本和单位建议价审计，已迁移到 `AuditEventWriter.writeTransactional`；未注入 writer 时保留原 `persistAuditEvent` 回退。
- 已补齐 `FinancialDocument.traceSource` 来源追溯契约，并用费用申请、报销申请和付款事实的关联关系返回可追溯结果；已加入 contract test。
- 已为新增 seam 建立 contract tests；后续继续将兼容 implementation 内部拆出真实事务、查询投影和错误结果，不改变现有 API 语义。

### 11.2 可执行任务状态

| 任务 ID | 任务 | 状态 | 证据/下一步 |
|---|---|---|---|
| ORD-001 | `OrderLifecycle` 生命周期、能力查询和创建入口 | 已完成 | `order-lifecycle.ts`、订单详情/创建调用方、生命周期 contract tests |
| ORD-002 | 最终交付事务、质保激活、余额待办和审计幂等 | 已完成 | `OrderLifecycle.transition(FINAL_DELIVERY)`、订单生命周期测试、全量回归 |
| ORD-003 | 取消、反审核退回和允许的状态 transition 收拢到 `OrderLifecycle.transition` | 已完成 | `OrderLifecycle.transition` 覆盖最终交付、取消、反审核退回及施工 transition，拥有统一 command 入口；订单服务仅保留无 seam 时的兼容回退 |
| ORD-004 | 将派工、开工、完工、质检纳入订单履约 transition | 已完成 | `ConstructionService` 注册施工 transition handler，公共施工 command 通过 `OrderLifecycle` 路由，既有物料/照片/提成/跨店规则保留在 implementation |
| INV-001 | 预留、释放、出库、收货、调整和追溯接入 `InventoryLedger` | 已完成 | `inventory-ledger.ts`、库存幂等测试、流水唯一约束迁移 |
| INV-002 | 采购流程只通过 ledger 写入收货事实 | 已完成 | 采购收货调用方与库存服务回归 |
| PRICE-001 | 定价决策、订单价格校验和价格/成本审计接入 `PricingDecision` | 已完成 | 定价/订单/报价调用方与审计 writer |
| CUST-001 | 客户摘要、车辆摘要、人工标签和在途消费口径 | 已完成 | `CustomerAccount`、客户服务测试 |
| SETTLE-001 | 企业对账、收款、红冲和来源审计 | 已完成 | `SettlementView`、客户结算服务、审计 writer |
| FIN-001 | 财务单据详情、现金事实和来源追溯 | 已完成 | `FinancialDocument.traceSource`、财务 contract test |
| ACCESS-001 | 身份上下文、能力判定和数据范围迁移 | 已完成 | `AccessContext` 及设置/成员/用户消费者 |
| PLATFORM-001 | 审计事务写入、通知去重和并发重试 | 已完成 | `AuditEventWriter`、`NotificationDispatcher`、409 项 API 测试 |
| QA-001 | Web 代表页面 live 检查、1440/1024/390 响应式与浏览器证据 | 部分完成 | 报表中心、订单列表已在三种宽度检查；登录态已验证工作台与订单列表可访问、空数据状态可读且无横向溢出；Web typecheck/build 已通过；当前登录门店无订单数据，仍需有业务数据的订单/施工/客户详情页验收 |

## 12. 待确认与决策状态

本轮用户已确认并采用订单履约评审建议：

- 最终交付角色：归属门店店长/管理员。
- 质保入口：最终交付事务自动生成并激活。
- `PENDING_DELIVERY`：内部派生，成功后为 `COMPLETED`。
- 重复/前置条件/并发结果：幂等成功/业务错误/冲突错误。
- 事务边界：上层用例开启事务，模块拥有事务内原子性。

本 PRD 其余模块只定义事实归属、契约和验收边界；具体字段名、错误码和技术实现属于研发拆解，不构成未决业务规则。若实现发现需要改变业务语义，必须回到 PRD 评审，不得在代码中静默决定。

## 13. 变更记录

| 版本 | 日期 | 变更内容 | 修改原因 |
|---|---|---|---|
| V0.1 | 2026-08-07 | 初版订单履约深化 PRD | 建立 `OrderLifecycle` 评审材料 |
| V0.2 | 2026-08-07 | 扩展库存、定价、客户结算、财务、身份权限和平台可观测性；纳入已确认订单规则 | 统一本轮架构深化范围 |
| V0.3 | 2026-08-07 | 完成 9 个 seam、首批调用方迁移和 contract tests | 开始 PRD 落地实施 |
| V0.4 | 2026-08-07 | 固化最终交付事务、移除独立质保生成入口、补充库存流水幂等键和唯一约束 | 落实 P0 履约与库存事实边界 |
| V0.5 | 2026-08-07 | 迁移财务单据详情和付款记录查询到 `FinancialDocument` | 开始收口 P1 财务事实读取边界 |
| V0.6 | 2026-08-07 | 迁移订单价格校验、客户结算列表、权限上下文和门店变更通知消费者 | 推进 P1/P2 契约从包装层进入真实调用链 |
| V0.7 | 2026-08-07 | 补充库存幂等服务测试并迁移客户、定价剩余关键入口 | 强化事实写入和契约覆盖 |
| V0.8 | 2026-08-07 | 迁移门店与成员通知、成员权限判断到平台契约 | 收口 P2 身份、成员和通知消费者 |
| V0.9 | 2026-08-07 | 迁移门店审核、冻结和店长变更审计调用到 `AuditEventWriter` | 收口 P2 平台审计消费者 |
| V1.0 | 2026-08-07 | 迁移订单核心审计调用并完成 402 项 API 全量回归 | 固化 P0 订单事实追溯边界 |
| V1.1 | 2026-08-07 | 迁移设置访问和门店能力检查到 `AccessContext` | 推进 P2 权限消费者收口 |
| V1.2 | 2026-08-07 | 迁移用户、字典和设置审计权限消费者到 `AccessContext` | 完成 P2 权限第一轮收口 |
| V1.3 | 2026-08-07 | 迁移总部字典模板权限消费者到 `AccessContext` | 完成设置权限消费者收口 |
| V1.4 | 2026-08-07 | 迁移施工通知、产能审计和施工成本审计到平台契约 | 收口施工执行的 P2 平台依赖 |
| V1.5 | 2026-08-07 | 迁移定价与报价审计消费者到 `AuditEventWriter` | 收口 P1 定价和报价的审计依赖 |
| V1.6 | 2026-08-07 | 补充审计事件和通知去重持久化边界 | 落实 P2 平台契约的幂等要求 |
| V1.7 | 2026-08-07 | 完善 `OrderLifecycle` 生命周期与能力查询契约并迁移订单详情 | 完成 P0 履约查询契约收口 |
| V1.8 | 2026-08-07 | 实现事务审计 writer 并迁移订单、施工、定价、报价审计 helper | 收口 P2 审计事务边界 |
| V1.9 | 2026-08-07 | 完成通知去重键重试和并发冲突回读 | 完成 P2 通知幂等行为 |
| V2.0 | 2026-08-07 | 迁移客户企业结算和产品服务的剩余审计写入消费者 | 继续收口 P1 结算/定价与 P2 审计调用链 |
| V2.1 | 2026-08-07 | 补齐 `FinancialDocument.traceSource` 来源追溯契约与测试 | 完成 P1 财务事实追溯验收缺口 |
| V2.2 | 2026-08-07 | 将订单创建和批量能力查询接入 `OrderLifecycle` | 收口 P0 履约公开查询/创建入口 |
| V2.3 | 2026-08-07 | 将订单取消和反审核退回迁移到 `OrderLifecycle.transition` | 收口 P0 履约状态 command |
| V2.4 | 2026-08-07 | 完成报表中心和订单列表的 live/响应式基础验收并记录数据态限制 | 补充 Web 侧 PRD 验收证据 |
| V2.5 | 2026-08-07 | 完成 Web typecheck、生产构建和三种宽度基础回归 | 补充全端构建验收证据 |
| V2.6 | 2026-08-07 | 将最终交付调用方迁移到 `OrderLifecycle.transition` | 完成 P0 履约 command 统一入口 |
| V2.7 | 2026-08-07 | 补齐最终交付、取消、反审核退回三类 transition contract tests | 证明已收拢 P0 履约 command 的事务和审计结果 |
| V2.8 | 2026-08-07 | 将派工、开工、完工、质检接入 `OrderLifecycle` 施工 transition handler | 收口 P0 施工阶段 command 入口 |
| V2.9 | 2026-08-07 | 补充已登录 Chrome 空数据态验收证据，并明确有业务数据详情页仍待验收 | 校准 QA-001 完成边界，避免将空数据误报为真实详情数据验收 |
