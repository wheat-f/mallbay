# MallBay 架构审查｜2026-08-07

## 审查目的

在已完成 Operational Report module 深化后，继续为 MallBay 剩余业务模块建立统一的 deep module 架构基线。审查关注 module 的 interface、implementation、seam、职责集中度、状态所有权、事务边界和可测试性，不以拆分微服务为目标。

## 当前基线

- 系统仍是 Nx monorepo 下的模块化单体。
- `packages/shared` 只承载跨端契约，不承载 Prisma 或业务实现。
- `docs/adr/0001-operational-report-module.md` 已记录报表分析 module 的 interface 与指标语义。
- `Operational Report module` 是本批次第一个完成深化的 module；本文件记录其余模块的审查结果和实施顺序。

## 模块分组与优先级

| 优先级 | 模块群 | 当前实现 | 主要架构问题 | 建议 deep module interface |
|---|---|---|---|---|
| P0 | 订单履约闭环 | `orders`、`sales-quotes`、`customer-settlements`、`construction`、`warranties`、`after-sales` | 订单状态、施工完工、质检、尾款、最终交付、质保和售后之间存在跨模块事务与状态解释，部分编排仍集中在大 service | `OrderLifecycle`：创建、派工、施工阶段、最终交付、取消/回退、能力查询 |
| P0 | 库存采购事实 | `inventory`、`purchases` | `inventory.service.ts` 约 2,152 行、52 处 Prisma 访问，库存批次、预留、出库、采购、收货、单位转换和流水共用一个 implementation | `InventoryLedger`：预留、释放、出库、收货、调整、追溯；`ProcurementFlow` 作为同模块内部流程 |
| P1 | 定价与成本规则 | `pricing`、`products`、`sales-quotes` | 规则集、版本发布、灰度、车型映射、施工标准、试算和正式订单快照耦合，规则版本与订单价格快照需要明确 seam | `PricingDecision`：给定输入返回价格/成本/规则版本/审批原因；配置发布留在内部 implementation |
| P1 | 客户与企业结算 | `customers`、`customer-settlements` | 客户、车辆归属、销售权限、企业成员和跨订单对账由多个 service 解释；客户详情与结算读取容易形成重复查询口径 | `CustomerAccount`：客户/车辆关系、归属转移、标签和历史摘要；`SettlementView` 作为只读结算投影 |
| P1 | 财务单据与现金事实 | `finance`、`invoices`、`rebates`、`commissions` | 费用、报销、付款、发票、返利、提成各有状态流转，但现金事实、审批事实和来源单据的关系需要统一查询 interface | `FinancialDocument`：单据状态、审批动作、付款事实和来源追溯；各工作流保留内部实现 |
| P2 | 身份、成员与权限 | `auth`、`users`、`members`、`permissions`、`settings` | 认证上下文、门店成员、角色能力和设置访问在多个服务中重复解析；`process.env` 和 Prisma 直接依赖仍较多 | `AccessContext`：当前身份、门店范围、能力判定；认证/成员/设置仍作为内部 implementation |
| P2 | 平台与可观测性 | `notifications`、`observability`、`prisma`、`common` | 属于共享能力，暂不适合继续抽象为业务 module；需要稳定事件和审计写入约定 | `AuditEventWriter`、`NotificationDispatcher` 作为共享能力 interface |
| 已完成 | 经营分析 | `reports` | 已完成 Operational Report interface、日期/成本/权限/洞察和明细规模语义 | 见 ADR-0001 |

## P0：订单履约闭环

### 证据

- `apps/api/src/orders/orders.service.ts` 约 1,243 行、33 处 Prisma 访问，并同时处理订单查询、付款、商业变更、取消/回退、历史核验和收款账户。
- `apps/api/src/construction/construction.service.ts` 约 43KB，同时修改施工记录和订单状态，并调用 `finalizeOrderDelivery`。
- `apps/api/src/orders/domain/order-delivery.ts` 已经存在最终交付领域策略，是最自然的外部 seam 候选。
- `apps/api/src/orders/domain/order-workflow.ts` 已经承担阶段和能力派生，但仍需要成为所有调用方共享的唯一解释。

### 结论

订单最终交付是跨施工、质检、质保、尾款和待办的业务事实，不能由施工 service、订单 service 或页面分别推断。`OrderLifecycle` 应成为订单履约闭环的 deep module；Controller 和页面只消费能力与结果，不自行拼接状态。

### 目标 interface

```text
getLifecycle(orderId, actor) -> OrderLifecycleView
createOrder(actor, input) -> OrderCreated
transition(actor, orderId, command) -> OrderLifecycleResult
listCapabilities(actor, orderIds) -> OrderCapabilityMap
```

`transition` 的 command 包含派工、开始施工、完成施工、质检、最终交付、取消和允许的回退；所有跨模块写入在 module 内部保持一个事务边界。现有 `summary/detail/list` 继续作为查询适配入口，逐步迁移到该 interface。

### 禁止事项

- 不让页面根据订单状态、施工状态、付款状态拼出“已完成”。
- 不让施工记录 `COMPLETED` 直接等价于订单 `COMPLETED`。
- 不把质保生成、订单完成和待办关闭拆成可独立成功的多次请求。
- 不通过事件替代当前仍要求原子提交的最终交付事务；异步通知只能在事务成功后发生。

## P0：库存采购事实

### 证据

- `apps/api/src/inventory/inventory.service.ts` 约 90KB、2,152 行、52 处 Prisma 访问。
- 同一 implementation 同时处理批次、仓库、供应商、采购单、采购需求、订单匹配、锁库、出库、收货、单位转换、拆批和库存调整。
- 多个写入已使用 `$transaction`，且已有 `inventory/domain/unit-conversion.ts`，说明库存事实和单位换算已经具备内部 seam。

### 结论

库存数量的真实来源应是不可静默覆盖的库存流水和批次事实；采购需求/采购单是供应过程，不应直接修改可用库存。先建立 `InventoryLedger` interface，内部再保留采购编排，不引入只有一个实现的外部 adapter。

### 目标 interface

```text
reserve(input) -> ReservationResult
release(input) -> ReleaseResult
receive(input) -> ReceiptResult
outbound(input) -> OutboundResult
adjust(input) -> AdjustmentResult
trace(input) -> InventoryTrace
```

所有数量变更必须返回批次、单位、数量、来源、幂等键和流水编号；单位换算只能通过内部 domain function；订单匹配和采购收货不得绕过 ledger 写批次数量。

## P1：定价与成本规则

### 证据

- `pricing` 约 3,955 行，包含规则集、施工标准、岗位费率、车型映射、版本发布、灰度和试算。
- 已有 `pricing/domain/pricing-engine.ts`、`cost-estimator.ts`、`money.ts` 等纯 domain implementation，具备深模块化基础。
- 正式订单和报价需要冻结价格/成本快照，不能在规则发布后回算历史订单。

### 结论

对外只暴露一次定价决策：输入订单业务事实和规则上下文，返回价格、成本、命中的规则版本、快照信息和审批原因。规则配置 CRUD、冲突校验、发布和 rollout 是内部 implementation，不应让订单页面直接理解规则表结构。

## P1：客户与企业结算

### 结论

客户是客户关系和车辆归属的拥有者；订单、售后和报表只能通过客户 module 的公开读取接口取得客户/车辆摘要。企业结算是跨订单的只读/收款编排，不应反向拥有客户或订单状态。客户标签、消费摘要和企业对账必须共享“已完成订单”和在途订单的既定语义。

## P1：财务单据与现金事实

### 结论

财务模块应区分三类事实：业务单据状态、审批动作、现金/反向现金流水。发票、返利和提成是来源单据或结算结果，不应各自重新定义“已收款”。先建立统一的 `FinancialDocument` 只读查询 interface，再保留费用/报销/发票/返利/提成各自的写入 workflow。

## P2：身份、成员与权限

### 结论

服务端认证上下文是权限唯一来源。后续应形成 `AccessContext`，集中表达用户、门店范围、岗位、能力和数据裁剪；业务 module 不应重复解析 JWT、store member 或 settings capability。此模块优先级低于订单/库存，因为当前主要风险是重复和可维护性，而非核心事实被错误写入。

## 共同实施顺序

1. 订单履约：先固化 `OrderLifecycle` contract tests，收拢最终交付事务。
2. 库存采购：固化 `InventoryLedger` 的数量/单位/幂等/流水契约，再拆采购编排。
3. 定价成本：冻结 `PricingDecision` 和价格/成本快照语义，保持旧订单不回算。
4. 客户结算：统一客户/车辆摘要与企业结算的读取口径。
5. 财务单据：统一现金事实和来源追溯查询。
6. 身份权限：收拢 `AccessContext`，降低跨 module 重复鉴权。

每个阶段遵循：

```text
现有行为基线 → interface contract tests → 内部 implementation 重组 → 消费者迁移 → 全量回归
```

## 本轮不做

- 不拆微服务。
- 不提前引入消息总线或事件溯源。
- 不为只有一个真实实现的 Prisma 查询创建公开 adapter interface。
- 不把所有 service 按文件大小机械拆分；只有能隐藏业务复杂度、减少调用方知识的 seam 才进入实现。

## 后续交付物

- `ADR-0002`：订单履约最终交付的事务与状态所有权。
- `ADR-0003`：库存流水与预留事实的所有权。
- `ADR-0004`：定价决策与订单价格/成本快照。
- 后续各 module 的 `CONTEXT.md` 术语会先合并到根上下文，只有形成独立 bounded context 时再拆分 context。
