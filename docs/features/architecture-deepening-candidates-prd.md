# MallBay 五个架构深化候选实施 PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | MallBay 五个架构深化候选实施 |
| 文档版本 | V1.2 |
| 当前状态 | 评审通过，五个候选已进入分阶段实施；阶段一至五均已有代码入口，阶段门验收进行中 |
| 创建日期 | 2026-08-09 |
| 产品范围 | Web 管理端及 API 模块化单体 |
| 关联材料 | `CONTEXT.md`、`docs/architecture-review-mallbay-20260807.md`、ADR-0001 至 ADR-0012 |
| 实施顺序 | Inventory/Procurement → Construction Fulfillment → Customer/Settlement → Financial Document Query → AccessContext |

## 2. 需求背景

### 2.1 业务背景

MallBay 已完成 Operational Report、OrderLifecycle、InventoryLedger、PricingDecision 等第一批 deep module 基础建设。剩余核心模块仍存在大 implementation、事实解释重复、跨 module 状态推断和调用者依赖 Prisma 细节的问题。

本需求不以拆分微服务为目标，而是通过明确的 module responsibility、public interface、事实所有权和 contract tests，降低业务规则在多个调用者之间散落的风险。

### 2.2 当前问题

1. `InventoryService` 同时处理采购、库存批次、预留、收货、出库、单位转换和库存调整。
2. `ConstructionService` 同时处理施工阶段、施工证据、材料、照片、离线和人员排班。
3. 客户详情、消费概览、企业结算和报表可能重复解释订单金额及在途订单口径。
4. 财务、发票、返利、提成和报销分别解释单据状态、现金事实和来源追溯。
5. 不同 module 仍重复解析用户、门店成员、角色、能力和数据范围。

### 2.3 需求依据

- 现有架构审查识别出的 P0/P1/P2 模块群。
- 已确认的五候选 deep module 设计。
- 已确认的事实所有权、主日期口径、无双写迁移和追加式证据规则。
- 现有代码规模与调用关系：`inventory.service.ts`、`construction.service.ts`、`customers.service.ts`、`reports.service.ts` 等。

## 3. 产品目标

### 3.1 业务目标

- 库存数量、采购收货和库存流水只有一个事实来源。
- 施工记录、施工证据和最终交付状态不再被页面或施工 implementation 混用。
- 客户消费概览和企业结算应收使用明确且可追溯的金额口径。
- 财务页面统一解释单据、审批、现金事实和来源关系。
- 业务 module 不再重复解析身份、门店范围和能力。

### 3.2 工程目标

- 每个候选形成小而稳定的 public interface。
- 至少两个真实调用者通过 interface 使用 module。
- contract tests 成为 module 的主要测试面。
- Prisma 类型和查询细节留在 implementation 内部。
- 迁移过程中不发生新旧 implementation 双写。

### 3.3 成功判定

以下指标目标值需要业务、研发和测试在评审后补充：

- 业务规则重复解释点减少数量：待确认。
- 迁移后调用者直接访问 implementation 的数量：目标为 0。
- 每个 module 的 contract test 覆盖率：待确认。
- 关键核心流程回归通过率：目标为 100%。
- 1440、1024、390 宽度下核心页面无新增不可接受溢出：目标为 100%。

## 4. 非目标

本期不包含：

- 拆分微服务或引入消息总线。
- 将 Prisma 替换为其他数据库实现。
- 为只有一个真实 implementation 的场景提前创建远程 adapter。
- 重写现有页面视觉样式。
- 修改既有订单、库存、财务和权限业务含义。
- 引入异步读模型、事件溯源或全量缓存。
- 修改微信小程序信息架构。

## 5. 统一架构原则

### 5.1 Module 与 interface

每个 module 必须包含：

- 明确的 responsibility。
- 小而稳定的 public interface。
- 隐藏在 interface 后的 implementation complexity。
- 至少两个真实调用者。
- 通过 interface 执行的 contract tests。

### 5.2 事实所有权

- 库存数量和库存流水事实由 `InventoryLedger` 拥有。
- 采购执行拥有采购需求、采购单和采购状态，不拥有库存数量。
- 最终交付状态由 `OrderLifecycle` 拥有。
- 客户关系和标签由 `CustomerAccount` 拥有。
- 企业结算应收由 `SettlementView` 作为结算投影解释，不拥有客户或订单生命周期。
- 现金事实由财务事实 implementation 产生，`FinancialDocumentQuery` 统一读取和解释。
- 访问上下文由 `AccessContext` 统一解析和裁剪。

### 5.3 事务与幂等

- 采购收货状态和库存收货事实必须同事务提交。
- 最终交付继续由 `OrderLifecycle` 在一个业务事务中完成。
- 业务操作的上游 module 生成稳定幂等键，事实 module 负责持久化校验。
- 迁移期间不允许新旧 implementation 双写。
- Controller 和页面不得自行组合跨 module 业务事实。

### 5.6 已确认的收货与结算规则

- 采购收货数量大于采购单未收数量时，默认拒绝收货。
- 超收拒绝返回 `OVER_RECEIPT_NOT_ALLOWED`，不更新采购状态，不产生库存流水。
- 企业收款由结算 workflow 编排；Finance 是现金事实的唯一写入者。
- `SettlementView` 和 `FinancialDocumentQuery` 不直接写入现金事实。
- 结算收款、现金事实和结算状态在同一业务事务中成功或失败。
- 结算收款操作生成幂等键，Finance 负责持久化校验。
- 代码枚举作为稳定实现状态，module 内部维护业务状态映射；页面不得自行合并状态。

### 5.7 已确认的历史、查询和副作用规则

- 历史数据不做破坏性迁移或业务事实回算；module 提供只读兼容映射。
- 历史字段缺失时返回待补齐、不可计算或兼容状态，不按零计算。
- Operational Report 沿用 366 天查询上限和 2,000 行明细上限。
- 库存、采购、结算和财务沿用现有入口的分页与导出限制；具体限制在实施任务中引用现有入口。
- 查询超限返回明确业务错误，不静默截断。
- 施工当前视图展示最新有效且未撤销的证据，历史视图展示全部追加记录及撤销/补充关系。
- 核心业务事实和审计事件同事务提交。
- 通知在核心事务成功后异步执行，由 `NotificationDispatcher` 去重和重试；通知失败不回滚核心事实。
- 权限沿用现有 capability、action、scopeType 和 scopeIds，不新增本期权限含义。
- 五个实施阶段设置硬性阶段门；未通过 contract tests、调用者迁移、旧路径删除、回归验收或出现 S0/S1 时，不进入下一阶段。
- 总 PRD 维护跨 module 规则；后续五份子 PRD 只能细化各自 implementation，不得重新定义已确认业务口径。
- 权限发布和回滚沿用现有缓存失效机制；不新增永久缓存或由业务 module 自行决定缓存时间。
- 已撤销施工证据从当前施工视图隐藏，在质保、售后和审计追溯中保留并标记撤销；最终交付只使用当前有效质检结果。
- 采购需求 `CANCELLED` 保留为历史兼容状态，本轮不新增采购需求取消入口。
- 本轮新增独立质检历史记录，施工当前视图读取最新有效结果，质保、售后和审计读取完整历史。
- 客户收款迁移为由结算 workflow 编排、Finance 唯一写入 `PaymentRecord` 的现金事实流程。
- `AccessContext` 迁移 Inventory/Procurement、Construction、Customer/Settlement、Finance、Reports 的核心调用者；legacy `PermissionPolicy` 仅保留在内部 implementation。
- `FinancialDocumentQuery` 第一阶段覆盖费用、报销、发票、返利、提成和客户收款的只读查询，不重写其他财务写入 workflow。
- 施工履约使用“施工记录状态 + 质检结果”两层模型，不新增“待质检”持久化状态；`PENDING_QUALITY` 等属于派生阶段。
- 历史施工记录不伪造完整质检历史；新增历史记录后，旧当前字段作为 legacy current snapshot 展示。
- 新客户收款必须持久化业务操作幂等键；历史收款记录使用兼容键读取。
- 新 public interface 使用业务错误码；旧入口继续将错误码适配为现有 HTTP 错误和中文文案。

### 5.4 日期和金额口径

查询必须返回：

- 主日期口径。
- 查询范围。
- 纳入的对象或订单类型。
- 金额分类。
- 生成时间。

日期字段缺失时不得静默回退到更新时间或其他日期。

### 5.5 错误模型

module interface 使用稳定业务错误码或业务错误类型，例如：

- `INSUFFICIENT_STOCK`
- `DUPLICATE_OPERATION`
- `INVALID_LIFECYCLE_TRANSITION`
- `SETTLEMENT_PERIOD_CLOSED`
- `COST_DATA_INCOMPLETE`
- `ACCESS_DENIED`

HTTP 状态码、页面文案和展示方式由外层适配。

## 6. 用户角色与权限

本期沿用现有权限模型，不新增权限角色或数据范围。

| 角色 | 使用场景 | 可查看内容 | 可执行操作 | 数据范围 |
|---|---|---|---|---|
| 门店店长 | 经营、采购、施工、结算和财务管理 | 当前授权门店数据 | 由现有 capability 决定 | 当前门店或授权范围 |
| 销售人员 | 客户、订单、消费概览和部分施工进度 | 本人或现有授权范围 | 由现有销售能力决定 | 本人/门店既有范围 |
| 施工人员 | 施工履约、证据和现场任务 | 分配给本人或现有施工范围 | 施工阶段允许动作 | 本人任务/执行门店 |
| 财务人员 | 财务单据、现金事实和结算 | 现有财务授权范围 | 现有财务审批和收款操作 | 当前授权门店或平台 |
| 平台管理员 | 跨门店配置和审计 | 现有全局范围 | 现有平台能力 | 全平台 |

权限迁移规则：

1. 新 module 使用 `AccessContext` 或现有权限 implementation 提供的等价能力。
2. 旧入口可以暂时保留，但新代码不得增加新的 legacy 权限解析。
3. 无权限的写操作返回稳定 `ACCESS_DENIED`。
4. 读列表只返回有权查看的数据，不得通过空列表掩盖资源权限错误。

## 7. 核心业务对象

| 对象 | 定义 | 所有者/解释者 | 关键规则 |
|---|---|---|---|
| 采购需求 | 产品、数量和单位的补货需要 | ProcurementFlow | 不直接增加库存 |
| 采购单 | 采购执行过程中的供应商和明细单据 | ProcurementFlow | 可审批、部分收货和关闭 |
| 收货事实 | 货物进入仓库批次的数量、单位、成本和时间 | InventoryLedger | 产生库存流水 |
| 库存流水事实 | 库存数量变化及来源原因 | InventoryLedger | 不可静默覆盖，必须幂等 |
| 施工履约 | 订单施工阶段的过程和能力视图 | Construction Fulfillment | 不单独决定最终交付 |
| 施工证据 | 照片、材料、质检和现场记录 | Construction Fulfillment | 追加式保存 |
| 客户消费概览 | 客户经营价值的金额摘要 | CustomerAccount | 可包含在途订单 |
| 企业结算应收 | 结算期间纳入对账的订单应收 | SettlementView | 可与消费概览使用不同范围 |
| 财务单据 | 发票、费用、报销、返利或提成等单据 | 各自写入 workflow，统一由查询 module 读取 | 不等同于现金事实 |
| 现金事实 | 收款、付款、退款、冲销及来源关系 | 财务事实 implementation | 必须可追溯 |
| 访问上下文 | 用户、门店范围、能力和数据裁剪 | AccessContext | 不依赖 HTTP |

## 8. 实施顺序

```text
InventoryLedger + ProcurementFlow
              ↓
Construction Fulfillment
              ↓
CustomerAccount + SettlementView
              ↓
FinancialDocumentQuery
              ↓
AccessContext
```

每个阶段遵循：

1. 建立旧行为基线。
2. 定义或补充 public interface。
3. 编写 contract tests。
4. 在原 implementation 内迁移逻辑。
5. 迁移至少两个真实调用者。
6. 删除旧的重复解释或写入路径。
7. 运行类型检查、单元测试、构建和代表页面验收。

## 9. 候选一：ProcurementFlow + InventoryLedger

### 9.1 目标

将采购流程与库存数量事实分离，使采购收货只能通过库存流水事实产生库存变化。

### 9.2 Public interface

```text
ProcurementFlow
  createRequirement(input) -> PurchaseRequirement
  createOrder(input) -> PurchaseOrder
  approveOrder(orderId) -> PurchaseOrder
  receive(input) -> ProcurementReceiptResult
  getOverview(scope) -> ProcurementOverview

InventoryLedger
  reserve(input) -> ReservationResult
  release(input) -> ReleaseResult
  receive(input) -> ReceiptResult
  outbound(input) -> OutboundResult
  adjust(input) -> AdjustmentResult
  trace(input) -> InventoryTrace
```

### 9.3 业务规则

1. 当采购收货请求有效且采购单允许收货时，`ProcurementFlow` 在同一事务中更新采购收货状态并调用 `InventoryLedger.receive`，结果同时包含采购收货状态和库存流水引用。
2. 当相同业务操作幂等键重复提交时，系统返回原有结果，不产生第二条库存事实。
3. 当收货数量超过未收数量时，系统返回 `OVER_RECEIPT_NOT_ALLOWED`，不更新采购状态且不产生库存流水。
4. 当库存预留、释放、出库或调整发生时，必须记录来源、单位、数量和操作原因。
5. 采购需求创建不改变库存数量。
6. 供应商主数据暂留在采购 implementation 内，不进入 `InventoryLedger` interface。
7. 采购需求取消入口不在本轮范围内；历史 `CANCELLED` 记录只能按兼容规则读取。

### 9.4 状态流转

```text
采购需求：草稿 → 已提交 → 已转采购单 / 已关闭
采购单：草稿 → 待审批 → 已审批 → 部分收货 → 已收货 / 已取消
库存操作：待执行 → 已执行 / 已拒绝 / 已幂等返回
```

实际代码枚举作为稳定 implementation 状态；module 内部将其映射为业务状态。页面和其他调用者不得自行合并或解释多个代码状态。

| 业务对象 | 实际代码枚举 | 业务解释 |
|---|---|---|
| 采购需求 | `OPEN` | 待处理 |
| 采购需求 | `PARTIAL_ORDERED` | 部分已转采购 |
| 采购需求 | `ORDERED` | 已转采购 |
| 采购需求 | `PARTIAL_RECEIVED` | 关联采购单部分收货 |
| 采购需求 | `FULFILLED` | 需求已满足 |
| 采购需求 | `CANCELLED` | 已取消 |
| 采购单 | `DRAFT` | 草稿/待审批 |
| 采购单 | `ORDERED` | 已下单 |
| 采购单 | `PARTIAL_RECEIVED` | 部分收货 |
| 采购单 | `RECEIVED` | 已收货 |
| 采购单 | `CANCELLED` | 已取消 |

### 9.5 依赖

- Prisma transaction。
- `convertToBaseQuantity` 和单位转换 domain function。
- 权限上下文。
- 审计事件。
- 订单库存匹配。

### 9.6 调用者迁移

- 采购需求、采购单和收货页面。
- 订单库存匹配、预留和出库流程。
- 库存批次和库存流水页面。

### 9.7 验收标准

- Given 采购单允许部分收货，When 提交小于未收数量的收货请求，Then 采购收货状态和库存收货事实在同一事务中成功更新。
- Given 相同幂等键已成功收货，When 再次提交，Then 返回原结果且库存流水数量不增加。
- Given 采购需求尚未生成采购单，When 创建采购需求，Then 库存可用数量不变化。
- Given 出库请求库存不足，When 提交出库，Then 返回 `INSUFFICIENT_STOCK` 且不产生部分库存流水。
- Given 页面调用采购收货，When 请求完成，Then 页面不需要知道批次表和库存流水表结构。

### 9.8 文件范围

- `apps/api/src/inventory/inventory.service.ts`
- `apps/api/src/inventory/domain/inventory-ledger.ts`
- `apps/api/src/inventory/domain/inventory-ledger.test.ts`
- `apps/api/src/inventory/domain/unit-conversion.ts`
- `apps/api/src/inventory/inventory.controller.ts`
- `apps/api/src/inventory/inventory.module.ts`
- `apps/api/src/inventory/inventory.service.test.ts`
- `apps/api/src/purchases/*`
- `apps/api/src/orders/*`
- `apps/api/prisma/schema.prisma`

## 10. 候选二：Construction Fulfillment

### 10.1 目标

统一施工阶段、履约能力、阻塞原因和施工证据视图，同时保证最终交付状态只由 `OrderLifecycle` 拥有。

### 10.2 Public interface

```text
getFulfillmentView(orderId, actor) -> FulfillmentView
listFulfillments(scope, actor) -> FulfillmentList
getCapabilities(orderId, actor) -> FulfillmentCapabilities
executeStep(orderId, command, actor) -> FulfillmentResult
recordEvidence(orderId, evidence, actor) -> EvidenceResult
syncOffline(input, actor) -> SyncResult
```

`executeStep.command.type` 仅允许：

- `DISPATCH`
- `START_CONSTRUCTION`
- `COMPLETE_CONSTRUCTION`
- `QUALITY_CHECK`

### 10.3 业务规则

1. 施工页面查询阶段和能力时，必须通过履约视图，不自行拼接订单、施工和付款状态。
2. 施工状态变更通过 `OrderLifecycle` 执行。
3. 施工完成、质检通过或施工证据完整，不单独等同于最终交付。
4. 照片、材料、质检和现场记录采用追加式记录；修正不得静默覆盖历史证据。
5. 离线同步必须具备稳定操作标识和重复提交保护。
6. 施工人员、排班和产能可以继续作为内部 implementation，不进入履约 interface。
7. 质检每次结果写入独立历史记录，不再只覆盖施工记录当前质检字段；当前视图选择最新有效结果。

### 10.4 状态流转

```text
待派工 → 已派工 → 施工中 → 待质检 → 质检通过
                               └→ 质检不通过 → 施工中
```

实际状态映射：

| 业务对象 | 实际代码枚举 | 业务解释 |
|---|---|---|
| 订单 | `PENDING_DISPATCH` | 待派工 |
| 订单 | `DISPATCHED` | 已派工 |
| 订单 | `IN_CONSTRUCTION` | 施工中 |
| 订单 | `COMPLETED` | 已完成/已最终交付 |
| 订单 | `WARRANTIED` | 已进入质保完成口径 |
| 订单 | `CANCELLED` | 已取消 |
| 施工记录 | `DISPATCHED` | 已派工 |
| 施工记录 | `IN_CONSTRUCTION` | 施工中 |
| 施工记录 | `COMPLETED` | 施工完成，不能单独等同最终交付 |
| 质检 | `PASS` | 质检通过 |
| 质检 | `REWORK_REQUIRED` | 需要返工 |

`OrderLifecycle` 内部阶段还包括 `PENDING_QUALITY`、`PENDING_MATERIAL_PICKUP`、`PENDING_OUTBOUND`、`PENDING_INVENTORY_CONFIRM`、`PENDING_WARRANTY`、`PENDING_BALANCE`、`PENDING_DELIVERY` 和 `HISTORICAL_VERIFICATION`；这些是基于施工记录、质检结果、库存、收款和质保事实派生的阶段，不新增对应持久化状态。

最终交付由 `OrderLifecycle` 根据施工完工、质检、收款、质保和待办条件统一决定。

### 10.5 验收标准

- Given 订单处于待派工，When 用户提交有效派工 command，Then 施工记录和订单履约阶段按现有规则更新。
- Given 施工记录已完成但质检未通过，When 查询履约视图，Then 不显示最终交付完成。
- Given 质检结果被纠正，When 新记录提交，Then 保留原质检证据并新增纠正记录。
- Given 离线操作已同步，When 重复提交同一操作标识，Then 不产生重复照片、材料或状态记录。
- Given 用户无施工能力，When 执行施工 command，Then 返回 `ACCESS_DENIED` 且不改变状态。

### 10.6 文件范围

- `apps/api/src/construction/construction.service.ts`
- `apps/api/src/construction/construction.module.ts`
- `apps/api/src/construction/construction.controller.ts`
- `apps/api/src/construction/construction.service.test.ts`
- `apps/api/src/orders/domain/order-lifecycle.ts`
- `apps/api/src/orders/domain/order-delivery.ts`
- `apps/api/src/orders/orders.service.ts`
- `apps/web/app/construction/*`
- `apps/web/app/orders/[id]/page.tsx`
- `apps/web/app/workbench/[storeId]/page.tsx`

## 11. 候选三：CustomerAccount + SettlementView

### 11.1 目标

统一客户、车辆、归属、人工标签和消费摘要，同时统一企业结算的订单投影和收款编排，不让客户关系 module 拥有订单生命周期。

### 11.2 Public interface

```text
CustomerAccount
  getSummary(customerId, actor) -> CustomerSummary
  listVehicles(customerId, actor) -> VehicleSummary[]
  updateOwnership(input, actor) -> OwnershipResult
  updateTags(input, actor) -> TagResult
  getConsumption(customerId, actor) -> ConsumptionSummary

SettlementView
  getSettlementView(customerId, range, actor) -> SettlementView
  listSettledOrders(customerId, range, actor) -> SettlementOrder[]
  recordCollection(input, actor) -> CollectionResult
```

金额结果必须返回主日期口径、查询范围、纳入订单类型、金额分类和生成时间。

### 11.3 业务规则

1. 客户消费概览中的经营金额、实际收款和待收可以包含在途订单。
2. 企业结算应收使用明确的结算期间和纳入条件，不默认等于客户消费概览。
3. 客户人工标签由 `CustomerAccount` 维护；系统标签和人工标签必须区分展示。
4. 企业结算不修改客户归属，不改变订单生命周期。
5. 收款由结算 workflow 编排，Finance 产生现金事实；收款分摊必须关联企业结算和现金事实，不能重复计入。

### 11.4 验收标准

- Given 客户存在一笔在途订单，When 查询客户消费概览，Then 经营金额包含该订单且返回纳入口径。
- Given 企业结算期间不包含某订单，When 查询企业结算应收，Then 该订单不进入应收，但不影响客户消费概览的经营金额规则。
- Given 用户添加人工标签，When 刷新客户详情和客户列表，Then 标签均可见且不覆盖系统标签。
- Given 收款已分摊到结算单，When 重复提交同一收款操作，Then 不产生重复现金事实。
- Given 用户无权访问客户，When 查询客户或结算，Then 返回稳定权限错误或裁剪后的结果。

### 11.5 文件范围

- `apps/api/src/customers/customers.service.ts`
- `apps/api/src/customers/domain/customer-account.ts`
- `apps/api/src/customers/customers.controller.ts`
- `apps/api/src/customer-settlements/customer-settlements.service.ts`
- `apps/api/src/customer-settlements/domain/settlement-view.ts`
- `apps/api/src/customer-settlements/customer-settlements.controller.ts`
- `apps/api/src/customers/customers.service.test.ts`
- `apps/web/app/customers/page.tsx`
- `apps/web/app/customers/[id]/page.tsx`
- `apps/web/app/customers/[id]/settlement/page.tsx`
- `apps/api/src/reports/reports.service.ts`

## 12. 候选四：FinancialDocumentQuery

### 12.1 目标

统一财务单据状态、审批时间线、现金事实和来源追溯的只读解释；费用、报销、发票、返利和提成继续保留各自写入 workflow。

### 12.2 Public interface

```text
getDocument(documentId, actor) -> FinancialDocumentView
getTimeline(documentId, actor) -> FinancialTimeline
getCashFacts(documentId, actor) -> CashFact[]
getSourceTrace(documentId, actor) -> SourceTrace
searchDocuments(scope, actor) -> FinancialDocumentSummary[]
```

结果通过 `documentType` 区分发票、费用、报销、返利和提成等单据，不压缩成弱类型金额对象。

### 12.3 业务规则

1. 应收、实际收款、付款、退款和冲销必须分别表达。
2. 发票状态不得自动等同于现金到账。
3. 返利和提成结果不得虚构现金事实。
4. 每条现金事实必须能够追溯来源单据和反向关系。
5. 第一阶段采用实时查询、明确规模限制和 `generatedAt`，不引入异步读模型。
6. 各财务 workflow 的写入状态不被统一查询 module 替代。
7. 客户收款查询纳入统一只读查询；客户收款写入由结算 workflow 调用 Finance 的现金事实入口。
8. 客户收款新流程必须接收并持久化业务操作幂等键；历史记录使用兼容键。

实际财务状态映射：

| 对象 | 实际代码枚举 |
|---|---|
| 费用/报销审批 | `PENDING / APPROVED / REJECTED / PAID / CANCELLED` |
| 发票 | `APPLIED / ISSUED / VOIDED / REISSUED` |
| 返利 | `APPLIED / REVIEWED / APPROVED / REJECTED / PAID` |
| 客户结算单 | `DRAFT / CONFIRMED / VOIDED` |
| 客户收款 | `DRAFT / POSTED / REVERSED` |

### 12.4 验收标准

- Given 发票已开具但未收款，When 查询财务单据，Then 发票状态和现金事实分别展示。
- Given 一笔付款已发生，When 查询来源追溯，Then 可以定位来源订单或财务单据。
- Given 发生退款或冲销，When 查询现金事实，Then 返回原事实与反向关系。
- Given 查询超过明细规模限制，When 提交查询，Then 返回明确规模错误，不截断为无提示结果。
- Given 用户无财务权限，When 查询财务单据，Then 返回 `ACCESS_DENIED`。

### 12.5 文件范围

- `apps/api/src/finance/domain/financial-document.ts`
- `apps/api/src/finance/finance-query.service.ts`
- `apps/api/src/finance/finance.service.ts`
- `apps/api/src/finance/finance.controller.ts`
- `apps/api/src/invoices/invoices.service.ts`
- `apps/api/src/rebates/rebates.service.ts`
- `apps/api/src/commissions/commissions.service.ts`
- `apps/api/src/finance/*workflow.service.ts`
- `apps/api/src/reports/reports.service.ts`
- `apps/web/app/finance/*`
- `apps/web/app/invoices/*`
- `apps/web/app/rebates/*`
- `apps/web/app/commissions/*`

## 13. 候选五：AccessContext

### 13.1 目标

统一表达用户身份、门店范围、角色能力和资源数据范围，使业务 module 不再重复解析 JWT、门店成员和 legacy role。

### 13.2 Public interface

```text
resolve(actor, context?) -> ResolvedAccessContext
allows(access, capability, action, scope?) -> boolean
require(access, capability, action, scope?) -> void
scopeFor(access, resource, scope?) -> DataScope
```

interface 不接收 HTTP Request，不暴露 Prisma 类型。

### 13.3 业务规则

1. 新 module 使用 `AccessContext` 获取能力和数据范围。
2. legacy role 可以在 `AccessContext` 内部兼容，但新代码不得增加新的 legacy 解析。
3. 写操作无权限返回 `ACCESS_DENIED`。
4. 列表查询只返回有权查看的数据；不能通过空列表掩盖资源权限错误。
5. 资源已存在但用户无权查看时，不泄露资源存在性。
6. 多门店用户按当前 context 裁剪数据。

### 13.4 验收标准

- Given 用户只有门店 A 权限，When 查询门店 B 数据，Then 不返回门店 B 数据。
- Given 用户具备某 capability 的 read 但没有 write，When 执行写操作，Then 返回 `ACCESS_DENIED` 且数据不变。
- Given legacy role 用户登录，When 通过 `AccessContext` 解析，Then 权限结果与迁移前一致。
- Given 定时任务使用抽象 actor，When 查询数据范围，Then 不依赖 HTTP Request 仍能得到相同权限结果。

### 13.5 文件范围

- `apps/api/src/permissions/domain/access-context.ts`
- `apps/api/src/permissions/permissions.service.ts`
- `apps/api/src/permissions/permissions.interceptor.ts`
- `apps/api/src/common/policies/permission.policy.ts`
- `apps/api/src/members/members.service.ts`
- `apps/api/src/settings/settings-access.service.ts`
- `apps/api/src/settings/audit.service.ts`
- `apps/api/src/auth/*`
- 各业务 module 中的 `withStoreMember` 和权限解析调用点

## 14. 统一异常与边界

| 场景 | 统一处理 |
|---|---|
| 重复提交 | 使用业务操作幂等键返回原结果 |
| 并发状态变化 | 重新读取事实并返回稳定业务错误，不覆盖新状态 |
| 无权限 | 写操作返回 `ACCESS_DENIED`；读列表按数据范围裁剪 |
| 对象不存在 | 返回资源不存在；不得通过权限错误泄露资源存在性 |
| 日期字段缺失 | 不静默回退，返回不可计算或待补齐状态 |
| 查询超限 | 返回明确规模错误，并保留已确认上限 |
| 外部文件或通知失败 | 核心业务事实提交结果与非核心通知失败分离，保留重试或失败记录 |
| 历史数据字段不完整 | 进入待补齐/不可计算状态，不按零计算 |
| 迁移期间旧入口 | 适配到新 interface，不允许双写 |

## 15. Contract tests 与回归测试

### 15.1 Contract tests

- `InventoryLedger`：预留、释放、收货、出库、调整、追溯、幂等、单位和错误。
- `ProcurementFlow`：采购需求、采购单、审批、部分收货、事务一致性。
- `Construction Fulfillment`：阶段视图、能力、受限 command、证据追加、离线幂等。
- `CustomerAccount`：客户关系、人工标签、车辆、消费口径。
- `SettlementView`：结算期间、应收、收款分摊、在途订单边界。
- `FinancialDocumentQuery`：单据类型、现金事实、来源追溯、退款和冲销。
- `AccessContext`：身份、门店范围、能力、数据裁剪、legacy role。

### 15.2 现有回归测试

- `apps/api/src/inventory/inventory.service.test.ts`
- `apps/api/src/construction/construction.service.test.ts`
- `apps/api/src/orders/domain/order-lifecycle.test.ts`
- `apps/api/src/customers/customers.service.test.ts`
- `apps/api/src/finance/finance-query.service.test.ts`
- `apps/api/src/invoices/invoices.service.test.ts`
- `apps/api/src/rebates/rebates.service.test.ts`
- `apps/api/src/commissions/commissions.service.test.ts`
- `apps/api/src/permissions/domain/access-context.test.ts`
- 相关 Web 页面测试和浏览器验收

### 15.3 删除测试

每个候选完成至少两个真实调用者迁移后，删除旧 module seam 或重复路径，并确认：

- 业务规则没有回到调用者。
- Prisma 查询细节没有扩散。
- contract tests 仍然通过。
- 页面、导出和 API 行为保持不变。

## 16. 页面与交互要求

本期不做大规模视觉重写，但受影响页面必须补齐：

- 加载状态。
- 空状态。
- 错误状态。
- 无权限状态。
- 数据过期或不可计算状态。
- 重复提交反馈。
- 业务错误码对应的可理解文案。
- 口径元数据显示。

重点页面：

- 库存、采购需求、采购单、收货、订单匹配。
- 施工任务、施工详情、订单详情、工作台。
- 客户列表、客户详情、企业结算。
- 财务首页、发票、报销、返利、提成和报表。
- 设置、成员和权限页面。

## 17. 数据迁移与兼容

- 不新增其他业务事实表；施工质检历史记录是本期已确认的例外，因为现有施工记录当前字段无法表达追加式质检事实。除该质检历史外，任何新增事实表都必须经过技术评估和需求评审。
- 现有数据状态和金额含义不回算。
- 历史缺失成本进入待补齐或不可计算，不按零处理。
- 旧 API 入口保持兼容，内部适配到新 interface。
- 迁移过程不双写。
- 新增字段或结果类型时，旧页面可以获得兼容默认展示，但不得改变事实口径。

## 18. 交付物

1. 五个候选的 interface contract tests。
2. 五个候选的 implementation 迁移任务。
3. 调用者迁移清单和删除旧路径记录。
4. 相关 ADR 和 `CONTEXT.md` 更新。
5. API 类型检查、Web 类型检查、单元测试、构建和代表页面浏览器验收结果。
6. 每个阶段的变更说明、风险和未完成项。
7. 五份候选 module 子 PRD，子 PRD 不得改变总 PRD 与 ADR 已确认的事实口径。
8. 旧质检字段到 legacy current snapshot 的兼容展示说明。

## 19. 待确认事项

以下内容不影响 architecture direction，但会影响具体研发拆分，需要在评审后确认：

1. 库存、采购、结算和财务各入口的具体分页/导出限制引用哪个现有入口。
2. 五个候选的 contract test 覆盖率目标值。
3. 经营指标重复解释点的量化基线。
4. 施工证据撤销/补充关系在质保和售后页面的具体展示方式。
5. 业务错误码到中文文案的统一产品文案表。
6. 代表页面浏览器验收的最终页面清单。

## 20. 验收总标准

- 不存在新旧 implementation 双写。
- 每个 module 至少有两个真实调用者。
- 每个 public interface 不泄露 Prisma 类型。
- 每个核心事实只有一个拥有者。
- 采购收货和库存收货事实原子提交。
- 施工证据追加保存，最终交付继续由 `OrderLifecycle` 决定。
- 客户消费概览和企业结算应收明确区分口径。
- 财务单据和现金事实可追溯。
- 权限和数据范围与现有行为一致。
- 关键成功、失败、重复、并发、权限和历史数据场景有 contract tests。
- `corepack pnpm --filter @mallbay/web typecheck` 通过。
- `corepack pnpm --filter @mallbay/web test` 通过。
- `corepack pnpm --filter @mallbay/web build` 通过。
- API 类型检查、API 测试和代表页面浏览器验收通过。

## 21. 任务级状态与触发条件附录

### 21.1 采购与库存

| 对象 | 当前状态 | 进入条件 | 允许动作 | 退出结果 |
|---|---|---|---|---|
| 采购需求 | `OPEN` | 创建采购需求 | 转采购、兼容读取 | `PARTIAL_ORDERED` / `ORDERED` / `CANCELLED` |
| 采购需求 | `PARTIAL_ORDERED` | 部分明细已转采购单 | 继续转采购、收货 | `ORDERED` / `PARTIAL_RECEIVED` / `FULFILLED` |
| 采购需求 | `ORDERED` | 全部明细已转采购单 | 收货 | `PARTIAL_RECEIVED` / `FULFILLED` |
| 采购需求 | `PARTIAL_RECEIVED` | 已收部分数量 | 继续收货 | `FULFILLED` |
| 采购需求 | `FULFILLED` | 需求数量满足 | 只读 | 终态 |
| 采购需求 | `CANCELLED` | 历史兼容状态 | 只读 | 终态 |
| 采购单 | `DRAFT` | 创建采购单 | 提交/审批、取消 | `ORDERED` / `CANCELLED` |
| 采购单 | `ORDERED` | 审批或提交成功 | 收货、取消 | `PARTIAL_RECEIVED` / `RECEIVED` / `CANCELLED` |
| 采购单 | `PARTIAL_RECEIVED` | 收货数量小于采购数量 | 继续收货 | `RECEIVED` |
| 采购单 | `RECEIVED` | 所有明细收齐 | 只读 | 终态 |
| 采购单 | `CANCELLED` | 草稿或已下单状态取消 | 只读 | 终态 |
| 库存分配 | `LOCKED` | 订单匹配并预留成功 | 出库、释放 | `OUTBOUND` / `RELEASED` |
| 库存分配 | `OUTBOUND` | 订单出库成功 | 只读 | 终态 |
| 库存分配 | `RELEASED` | 订单取消或释放预留 | 重新匹配 | `LOCKED` |

约束：采购需求取消枚举只用于历史兼容，本轮不新增取消入口；采购单超收统一拒绝，返回 `OVER_RECEIPT_NOT_ALLOWED`。

### 21.2 施工与订单履约

| 对象 | 当前状态/结果 | 触发条件 | 结果 |
|---|---|---|---|
| 订单 | `PENDING_DISPATCH` | 有效派工 command | `DISPATCHED` |
| 订单 | `DISPATCHED` | 已派工人员开始施工 | `IN_CONSTRUCTION` |
| 订单 | `IN_CONSTRUCTION` | 施工条件满足且前后照片、材料条件满足 | 施工记录 `COMPLETED` |
| 施工记录 | `COMPLETED` + `qualityResult=null` | 等待质检 | 履约阶段 `PENDING_QUALITY` |
| 施工记录 | `COMPLETED` + `qualityResult=PASS` | 质检通过 | 进入余额、质保或最终交付判断 |
| 施工记录 | `COMPLETED` + `qualityResult=REWORK_REQUIRED` | 质检要求返工 | 施工记录/订单回到 `IN_CONSTRUCTION` |
| 订单 | `PENDING_DELIVERY` | 质检通过、余额满足、其他条件满足 | `OrderLifecycle` 执行最终交付 |
| 订单 | `COMPLETED` | 最终交付事务成功 | 可进入质保/售后流程 |
| 订单 | `WARRANTIED` | 质保事实满足现有规则 | 质保完成口径 |

施工记录状态和质检结果是两个独立事实；`PENDING_QUALITY`、`PENDING_BALANCE`、`PENDING_DELIVERY` 等是 `OrderLifecycle` 派生阶段，不新增持久化枚举。跨店施工的 `CrossStoreTaskStatus` 必须在子 PRD 中单独列出，不得套用本表的单店状态。

### 21.3 财务与结算

| 对象 | 状态 | 进入条件 | 关键动作 |
|---|---|---|---|
| 费用/报销 | `PENDING` | 创建或重新提交 | 审批、撤回 |
| 费用/报销 | `APPROVED` | 审批通过 | 报销付款或后续财务动作 |
| 费用/报销 | `REJECTED` | 审批驳回 | 重新提交或结束 |
| 报销 | `PAID` | Finance 付款成功并产生现金事实 | 只读 |
| 发票 | `APPLIED` | 发票申请 | 开具、作废 |
| 发票 | `ISSUED` | 开具成功 | 作废、重开 |
| 发票 | `VOIDED` | 作废成功 | 只读/重开关联 |
| 发票 | `REISSUED` | 重开成功 | 只读 |
| 返利 | `APPLIED` | 申请提交 | 审核 |
| 返利 | `REVIEWED` | 业务审核 | 批准/驳回 |
| 返利 | `APPROVED` | 财务批准 | 发放 |
| 返利 | `PAID` | 现金事实成功 | 只读 |
| 企业结算单 | `DRAFT` | 创建对账单 | 确认、作废 |
| 企业结算单 | `CONFIRMED` | 对账单确认 | 收款、作废 |
| 企业收款 | `POSTED` | 收款和现金事实同事务成功 | 红冲 |
| 企业收款 | `REVERSED` | 全额红冲成功 | 只读 |

企业收款由结算 workflow 编排，Finance 写入 `PaymentRecord`；现金事实和结算状态不得分开成功。

## 22. 任务级权限矩阵

运行时权限 snapshot 优先于 legacy position；以下矩阵描述 legacy 行为必须保持的结果。

| Module/资源 | Read | Write/专项操作 | 数据范围 |
|---|---|---|---|
| Inventory | MANAGER、PURCHASING、CUSTOMER_SERVICE | MANAGER、PURCHASING | 当前授权门店 |
| Purchase | MANAGER、PURCHASING、FINANCE、CUSTOMER_SERVICE | MANAGER、PURCHASING | 当前授权门店 |
| Construction 派工/质检 | MANAGER、SCHEDULER | MANAGER、SCHEDULER | 当前执行门店 |
| Construction 施工任务 | 分配给本人的施工人员 | 分配给本人的施工人员 | 本人任务；管理操作按门店权限 |
| Customer 查看 | ADMIN、MANAGER、FINANCE、SCHEDULER、CUSTOMER_SERVICE、SALES | - | SALES 默认本人归属；其他授权门店 |
| Customer 编辑 | ADMIN、MANAGER、CUSTOMER_SERVICE、归属 SALES | 以上角色 | SALES 仅本人归属；其他授权门店 |
| Finance/Commission | MANAGER、FINANCE | MANAGER、FINANCE | 当前授权门店 |
| Finance 申请提交 | 当前门店成员 | 当前门店成员 | 本人申请；审批和付款按 Finance capability |
| Invoice | MANAGER、SALES、FINANCE 可申请 | MANAGER、FINANCE 管理；SALES 仅本人订单 | 当前授权门店/本人订单 |
| Rebate | MANAGER、SALES、CUSTOMER_SERVICE 可申请 | MANAGER、FINANCE 审批；SALES 仅本人订单 | 当前授权门店/本人订单 |
| Reports | ADMIN、MANAGER、FINANCE、SALES | - | 当前授权门店 |

无权限写操作返回 `ACCESS_DENIED`；列表读取按 scope 裁剪；资源存在性不得通过错误消息泄露。

## 23. Public interface 任务字段与错误约束

| Interface | 必填输入 | 必返结果 | 关键错误 |
|---|---|---|---|
| `InventoryLedger.receive` | storeId、purchaseOrderId、items、idempotencyKey、occurredAt | receiptId、batchIds、movementIds、quantities、unit、traceId | `OVER_RECEIPT_NOT_ALLOWED`、`DUPLICATE_OPERATION`、`INVALID_UNIT` |
| `InventoryLedger.reserve` | orderId、items、idempotencyKey | allocationIds、reservedQuantity、shortage | `INSUFFICIENT_STOCK`、`DUPLICATE_OPERATION` |
| `ProcurementFlow.receive` | purchaseOrderId、items、idempotencyKey、actor | procurementStatus、receiptId、inventoryTrace | `PURCHASE_ORDER_NOT_RECEIVABLE`、`OVER_RECEIPT_NOT_ALLOWED` |
| `ConstructionFulfillment.executeStep` | orderId、typed command、actor、operationId | orderStage、constructionStatus、capabilities | `INVALID_LIFECYCLE_TRANSITION`、`ACCESS_DENIED`、`EVIDENCE_INCOMPLETE` |
| `ConstructionFulfillment.recordEvidence` | orderId、stage、evidence、operationId | evidenceId、currentValidity、historyRef | `DUPLICATE_OPERATION`、`EVIDENCE_REVOKED` |
| `SettlementWorkflow.recordCollection` | statementId、allocations、amount、operationId、occurredAt | receiptId、cashFactId、remainingReceivable | `SETTLEMENT_PERIOD_CLOSED`、`DUPLICATE_OPERATION` |
| `FinancialDocumentQuery.getDocument` | documentType、documentId、actor | typed document、timeline、cash facts、generatedAt | `DOCUMENT_NOT_FOUND`、`ACCESS_DENIED` |
| `AccessContext.resolve` | abstract actor、store/context | actor、storeIds、capabilities、scope、policyVersion | `ACCESS_DENIED`、`ACCESS_CONTEXT_UNAVAILABLE` |

所有 public interface 的 transaction context、Prisma client 和数据库类型均为内部 implementation 细节，不得出现在调用者输入中。

## 24. 阶段门与任务拆分前置条件

| 阶段 | 进入条件 | 必须完成 | 退出条件 |
|---|---|---|---|
| Inventory/Procurement | 本 PRD 通过 | Ledger/Procurement contract tests、收货原子性、两条收货入口收拢 | 采购页、库存页、订单匹配均通过回归 |
| Construction Fulfillment | 第一阶段退出 | 质检历史记录、履约派生阶段、照片/材料/离线测试 | 施工详情、订单详情、工作台状态一致 |
| Customer/Settlement | 第二阶段退出 | 消费/结算口径、Finance 收款入口、幂等和红冲测试 | 客户详情、结算、报表金额一致 |
| FinancialDocumentQuery | 第三阶段退出 | 六类单据查询、现金来源追溯、错误码适配 | 财务首页、详情、导出一致 |
| AccessContext | 第四阶段退出 | 五类核心调用者迁移、权限矩阵测试、缓存失效测试 | 新代码无新增 legacy 权限解析 |

任何阶段出现 S0/S1、核心事实双写、contract test 失败或回归页面数据口径变化，立即停止进入下一阶段。

## 25. 实施前剩余非阻塞事项

以下事项不再改变 architecture direction，可作为任务拆分和验收准备：

1. 将各入口现有分页/导出限制补成具体 DTO 和测试引用。
2. 确定 contract test 覆盖率目标和重复规则减少量基线。
3. 确定业务错误码中文文案表。
4. 确定代表页面浏览器验收清单。
5. 为跨店施工子流程创建独立子 PRD。

## 26. 评审 S2 项补充结果

### 26.1 当前分页、导出和查询限制基线

本期不擅自扩大现有查询规模；新 interface 先适配现有入口行为。

| 查询/入口 | 当前基线 | PRD 规则 |
|---|---|---|
| Operational Report | `dateFrom/dateTo`；服务端已有 366 天查询上限和 2,000 行明细上限 | 继续沿用；超限返回明确错误 |
| Finance applications | `page` 最小 1，`pageSize` 最小 1、最大 100 | 新查询复用最大 100；未传 page/pageSize 使用现有默认值 |
| Inventory batches/movements | 当前 DTO 使用 store/product/batch/order/type/date 过滤，未提供 page/pageSize | 第一阶段保持现有行为；大数据分页作为后续性能任务，不在本期静默改变返回结构 |
| Purchase order export | `exportDimension` 仅允许 `supplier/product/date` | 继续沿用三个维度；不得新增未评审维度 |
| Customer settlement | 当前列表 DTO 未提供 page/pageSize | 第一阶段保持现有行为；结算大数据量优化必须单独评审 |

所有新查询结果必须包含 `generatedAt`；若调用现有无分页入口，implementation 必须记录规模风险，不得通过截断伪造完整结果。

### 26.2 Contract test 验收目标

不以单一代码覆盖率数字替代行为验收。每个 public interface 必须覆盖其 PRD 场景矩阵的 100%：

- 成功路径。
- 不满足前置条件。
- 重复操作和幂等。
- 并发或状态已变化。
- 权限允许和拒绝。
- 历史数据或字段缺失。
- 查询超限。
- 事务回滚。
- 通知/非核心副作用失败。

代码覆盖率作为辅助指标，具体阈值由测试任务根据现有基线补充；不降低上述场景覆盖要求。

### 26.3 业务错误码文案映射

| 错误码 | 默认中文文案 | 处理建议 |
|---|---|---|
| `ACCESS_DENIED` | 无权限执行当前操作 | 保持当前页面数据不变 |
| `DOCUMENT_NOT_FOUND` | 单据不存在或已失效 | 返回列表或详情安全空态 |
| `DUPLICATE_OPERATION` | 操作已处理，请勿重复提交 | 展示原操作结果 |
| `OVER_RECEIPT_NOT_ALLOWED` | 收货数量不能超过未收数量 | 保留用户输入，允许修正 |
| `INSUFFICIENT_STOCK` | 可用库存不足 | 展示缺口和可用数量 |
| `PURCHASE_ORDER_NOT_RECEIVABLE` | 当前采购单不可收货 | 刷新采购单状态 |
| `INVALID_LIFECYCLE_TRANSITION` | 当前状态不允许执行该操作 | 刷新履约视图 |
| `EVIDENCE_INCOMPLETE` | 施工证据尚未完整 | 展示缺失照片/材料/质检项 |
| `EVIDENCE_REVOKED` | 当前证据已撤销 | 引导查看有效证据或历史 |
| `SETTLEMENT_PERIOD_CLOSED` | 当前结算期间已关闭 | 不允许继续收款分摊 |
| `COST_DATA_INCOMPLETE` | 成本信息待补齐，暂不能计算毛利 | 不按零计算 |
| `ACCESS_CONTEXT_UNAVAILABLE` | 当前权限信息暂不可用，请稍后重试 | 不使用过期权限扩大范围 |

旧入口保留现有 HTTP status 和中文异常；仅新 public interface 使用上述业务错误码，并由 adapter 映射。

### 26.4 代表页面浏览器验收清单

每个阶段至少验收以下页面的 1440、1024 和 390 宽度：

| 阶段 | 代表页面 |
|---|---|
| Inventory/Procurement | `/inventory`、`/inventory/movements`、`/inventory/matching`、`/purchases/requirements`、`/purchases/orders`、`/purchases/inbound` |
| Construction Fulfillment | `/construction/tasks`、施工详情、`/orders/[id]`、`/workbench/[storeId]`、`/construction/cross-store` |
| Customer/Settlement | `/customers`、`/customers/[id]`、`/customers/[id]/settlement` |
| FinancialDocumentQuery | `/finance`、`/finance/expenses`、`/finance/reimbursements`、`/invoices`、`/rebates`、`/commissions`、`/reports` |
| AccessContext | `/settings/permissions`、`/members`、`/settings/audit`，以及上述各阶段至少一个受权限裁剪页面 |

每个页面必须验证 loading、empty、error、permission-denied、long-text、large-data、重复提交和刷新后口径一致。

### 26.5 交付指标基线

本期不虚构业务收益目标。上线后记录以下工程和业务基线，供后续迭代比较：

- 各候选 module 的调用者直接访问 implementation 次数。
- 重复业务规则调用点数量。
- contract test 场景通过率。
- 业务错误码出现次数及失败原因分布。
- 查询超限次数和平均响应时间。
- 客户消费概览与企业结算口径误读反馈数量。

## 27. 实施跟进记录（2026-08-09）

本节只记录实施对 PRD 接口约束的落实，不改变已确认的业务规则、事实所有权、权限含义或状态口径。

### 27.1 公共接口收口

- `InventoryLedger`、`CustomerAccount`、`SettlementView` 使用显式 actor 和 DTO 类型，不再用旧 service 的 `Parameters<>` 推导公共参数。
- `ConstructionFulfillment` 的 `FulfillmentView` 只暴露业务状态、时间、照片和履约阶段，不暴露 Prisma 枚举类型或查询结果对象。
- `FinancialDocumentQuery` 提供 `getDocument`、`getTimeline`、`getCashFacts`、`searchDocuments`，统一返回 `generatedAt`；`AccessContext` 使用显式 actor/input/result 类型，保持 HTTP 无关。

### 27.2 施工履约真实调用者迁移

新增：

```text
GET /construction/orders/:orderId/fulfillment
GET /construction/fulfillments
```

`ConstructionFulfillment.getFulfillmentView` 负责订单上下文、施工记录、照片、日期序列化、权限检查和 `OrderLifecycle` 派生阶段；`listFulfillments` 负责返回同一口径的履约列表摘要。Web 施工任务详情、施工订单详情和现场任务列表改为消费这两个稳定视图，不再在页面内查询全量 assignment 后拼装详情。

### 27.3 本轮验收证据

- API 类型检查通过。
- API 全量测试 424 通过、0 失败、2 个 opt-in 真实数据库测试跳过。
- Web 全量类型检查通过；Web production build 通过，75 个 App Router 页面生成成功。
- API 履约契约测试 10 通过、0 失败；Web feature tests 613 通过、0 失败。
- 履约视图契约测试覆盖日期、照片、施工状态、执行门店回退和派生阶段。

### 27.4 未完成门槛

- 旧兼容实现仍保留在内部适配层，尚未执行删除文件后的全量回归；施工管理端点中的容量、人员、排班、请假等非订单履约能力暂不迁移到履约视图。
- 1440、1024、390 三档浏览器验收证据尚未补齐。
- 工作台当前只显示待派工数量，不拼装施工阶段；若后续增加订单级履约明细，必须直接接入 `ConstructionFulfillment`。

## 28. 权限缓存与结算投影实施跟进（2026-08-10）

本节记录本轮对评审建议的实现，不改变已确认的业务规则、权限结果、结算金额事实或历史数据含义。

### 28.1 AccessContext/权限缓存

- `PermissionsService` 的用户级缓存失效同时清理对应 `PermissionPolicy` 运行时快照；全量缓存失效同时清理全部快照。
- 绑定创建、绑定停用、角色停用、权限策略发布和权限策略回滚继续使用既有失效入口；没有新增调用者可见的缓存 API。
- 兼容 policy 仍只作为迁移期回退桥，不改变 `AccessContext` 的 public interface。

### 28.2 SettlementView 语义投影

`SettlementView.getSettlementView` 返回：

```text
{
  items: SettlementStatement[],
  semantics: {
    dateBasis: ORDER_CREATED_AT,
    includedOrderKinds: [COMPLETED, WARRANTIED],
    amountTypes: {
      receivable: ORDER_TOTAL,
      collected: ORDER_PAID,
      outstanding: ORDER_OUTSTANDING
    },
    allocationType: CUSTOMER_STATEMENT_ITEM
  },
  generatedAt: string
}
```

每个 `SettlementStatement` 额外包含 `settlement`：

```text
settlementPeriod + includedOrderIds + receivableCents
  + collectedCents + outstandingCents + allocationIds
```

`allocationIds` 明确指向对账单明细，而不是现金收款分摊；现金收款仍由 `SettlementWorkflow` 编排并由 Finance 写入。Web 结算页面只消费 `items`，口径提示读取服务端 `semantics/generatedAt`，不自行重算金额。

### 28.3 SettlementView 三类读查询

候选订单、对账单和收款列表均使用统一的 `{ items, semantics, generatedAt }` 外层结果：

- 候选订单：`dateBasis=ORDER_CREATED_AT`，纳入 `COMPLETED/WARRANTIED`，金额分类为订单总额、订单已收、订单未收。
- 对账单：在每个单据上提供 `settlementPeriod`、`includedOrderIds`、`receivableCents`、`collectedCents`、`outstandingCents` 和 `allocationIds`；`allocationIds` 明确指向对账单明细。
- 收款列表：`dateBasis=RECEIVED_AT`，金额分类为收款金额、订单收款分摊、红冲金额，`allocationType=ORDER_PAYMENT`；红冲和逐单分摊保持可追溯。

Web 结算页面只消费三类结果的 `items`，不再假设接口返回裸数组。

### 28.4 AccessContext 权限生命周期回归

- 绑定停用清理指定用户快照；角色停用清理全部快照。
- 策略发布和回滚在事务成功后清理全部结果缓存和兼容运行时快照。
- 权限服务测试覆盖用户级、全局、发布、回滚四类场景，验证旧快照不会继续授权。

### 28.5 本轮验证与未完成项

- API 全量测试 425 通过、0 失败、2 个 opt-in 真实数据库测试跳过。
- API 深模块契约测试 10 通过、0 失败；Web feature tests 614 通过、0 失败。
- API/Web 类型检查通过。
- 旧兼容实现删除回归及三档浏览器验收仍需继续；五阶段不标记完成。

## 29. Finance 写入边界实施跟进（2026-08-10）

### 29.1 FinancialDocumentQuery 权限边界

`FinancialDocumentQuery` 是对外只读 seam，权限判断现在强制通过 `AccessContext`；它不再直接依赖 `PermissionPolicy`。内部 `FinanceQueryService` 同样强制依赖 `AccessContext`，不再保留授权 fallback。

### 29.2 返利现金事实

返利支付在现有事务内调用：

```text
RebatesService.pay
  -> FinanceService.recordRebatePayout(tx, sourceId=rebateId,
       idempotencyKey="rebate:{rebateId}:paid")
  -> PaymentRecord(REBATE)
```

返利状态、返利日志和现金事实同事务提交；返利支付必须通过 Finance writer，未注入 writer 时显式失败，不再保留直接写表 fallback。报销、发票和提成的其他现金事实 workflow 仍按同一原则继续迁移。

### 29.3 本轮验证与未完成项

- API 类型检查通过。
- 返利服务测试 10/10 通过。
- API 深模块契约测试 10/10 通过。
- FIN-003、ACC-003、ACC-005 尚未全部完成；旧兼容 implementation 删除回归和三档浏览器验收仍需继续。

### 29.4 当前全量验证记录（2026-08-10）

- API 全量测试 429 通过、0 失败、2 个 opt-in 真实数据库测试跳过。
- API 类型检查和 Nest build 通过。
- Web feature tests 616 通过、0 失败；Web 类型检查和生产构建通过，75 个 App Router 页面生成成功。
- 1440/1024/390 浏览器证据及旧兼容 implementation 删除后回归仍未完成，不能将五候选总体标记为完成。

## 30. ConstructionFulfillment 访问边界补充（2026-08-10）

`ConstructionFulfillment` 的公开履约查询不再保留 `PermissionPolicy` fallback。订单级履约视图在读取前必须通过 `AccessContext` 校验执行门店或订单归属门店；访问实现缺失时显式报配置错误，不能静默放行。

这一收口只改变权限实现边界，不改变现有 HTTP 路径、订单状态、施工阶段、照片、人员和跨店验收返回语义。施工管理端点的旧 service 兼容实现仍属于迁移期内部实现，待调用者迁移完成后单独删除并执行删除后全量回归。

验证：API 深模块契约测试 10/10 通过；API 全量测试 429/429 通过，Web feature tests 616/616 通过，Web 类型检查通过。本轮没有新增 S0/S1。ACC-003、ACC-005、FIN-003 及三档浏览器验收仍未完成。

## 31. Finance cash-fact writer 继续收口（2026-08-10）

- 报销支付由 `ReimbursementWorkflowService` 编排，调用 `FinanceService.recordReimbursementPayout` 写入 `PaymentRecord(REIMBURSEMENT)`；状态更新、审批日志和现金事实共用一个事务。
- 报销幂等键固定为 `reimbursement:{id}:paid`；旧 `FinanceService.approveReimbursement` 入口不再直接写现金事实，付款状态必须通过专用支付 workflow。
- 返利支付删除无 Finance 注入时的直接写表 fallback，生产路径强制通过 `FinanceService.recordRebatePayout`。
- 本轮不改变 HTTP 路径、审批状态枚举、支付账户校验或已存在的重复支付返回语义。
- 提成服务已强制使用 `AccessContext`，删除其 `PermissionPolicy` fallback。

定向验证：Finance/Reimbursement/Rebate 17/17 通过，Commissions 2/2 通过，API 类型检查通过。FIN-003、ACC-003、ACC-005 尚未全部完成，三档浏览器验收和旧实现删除后回归仍是阶段门。

## 32. ReportsService public authorization 继续收口（2026-08-10）

- `ReportsService` public authorization 强制使用 `AccessContext`；缺少访问上下文时不再回退到 `PermissionPolicy`。
- 报表现有 HTTP 路径、指标计算、筛选参数、导出行为和返回结构保持不变。
- ReportsService 内部仍使用 `PermissionPolicy` 派生销售人员可见范围；这属于隐藏 implementation，待权限能力矩阵固化后再迁移，不得被新的跨模块调用者依赖。
- ReportsService 定向测试 9/9 通过；API 全量测试 429 通过、0 失败、2 个 opt-in 真实数据库测试跳过；API 类型检查和 build 通过。
- 本次不提前宣告 ACC-003/ACC-005 完成；其余 legacy caller 删除回归和三档浏览器验收仍是阶段门。

## 33. FinanceQueryService authorization fallback 删除（2026-08-10）

- `FinanceQueryService` 强制注入 `AccessContext`，删除无上下文时的 `PermissionPolicy` 兼容分支。
- `FinancialDocumentQuery` 的公共只读接口、财务 HTTP 路径、查询筛选、本人/全量范围和跨门店拒绝语义保持不变。
- 财务查询定向测试与 workflow 测试 8/8 通过；API 类型检查通过。
- 后续仍需处理发票/提成的业务 workflow 场景矩阵、销售范围派生规则和其他旧实现删除后的全量回归。

## 34. 全量验证与浏览器验收状态（2026-08-10）

- API 全量测试 431 个：429 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过。
- API 类型检查、Nest build、Web 616/616 feature tests、Web 类型检查和 Web production build 均通过；Web build 成功生成 75 个 App Router 页面。
- 受控页面只能到达 `/auth`，Chrome 已登录会话连接不可用，本轮未取得 1440/1024/390 浏览器证据。
- 旧实现删除后的全量回归尚未完成；五候选总体不标记完成。

## 36. FinanceService 与财务附件授权收口（2026-08-10）

- `FinanceService` legacy 方法不再回退 `PermissionPolicy`；需要授权的调用若缺少 `AccessContext` 会显式失败。现金事实 writer 继续只接受已打开的事务，不依赖授权上下文。
- `FinanceAttachmentService` 通过 `AccessContext` 支持申请人 owner 范围和财务门店范围上传，其他主体拒绝。
- 报销审批与付款的店长/财务差异暂不使用粗粒度 `finance/write` 替换，必须先固化 capability matrix，避免权限扩大。
- 财务附件、财务查询、FinanceService、workflow 定向测试 14/14 通过；API 全量测试 434 个中 432 通过、0 失败、2 个真实数据库并发测试跳过。
- 本轮仍不标记 FIN-003、ACC-003、ACC-005 完成；剩余权限矩阵、旧实现删除回归和三档浏览器验收继续作为阶段门。

## 37. 财务 workflow capability matrix（2026-08-10）

为迁移报销审批、付款和附件入口，财务权限不再把所有动作压缩成 `finance/write`。目标 capability/action/scope 如下：

| 业务动作 | capability | action | scope | 允许角色/条件 |
|---|---|---|---|---|
| 发起费用/报销 | `finance.application` | `submit` | `OWN` | 当前有效门店成员，仅能以本人为 owner |
| 查看本人单据 | `finance.document` | `read` | `OWN` | 当前有效门店成员，仅能查看本人申请 |
| 查看门店全部财务单据/流水 | `finance.document` | `read` | `STORE` | 店长、财务；总部审核员为 `GLOBAL` |
| 审批费用申请 | `finance.expense` | `review` | `STORE` | 店长；总部审核员为 `GLOBAL` |
| 审批报销申请 | `finance.reimbursement` | `review` | `STORE` | 财务；总部审核员为 `GLOBAL` |
| 支付报销申请 | `finance.reimbursement` | `pay` | `STORE` | 财务；总部审核员为 `GLOBAL` |
| 上传本人财务附件 | `finance.document` | `attach` | `OWN` | 申请人本人 |
| 上传门店财务附件 | `finance.document` | `attach` | `STORE` | 店长、财务；总部审核员为 `GLOBAL` |

迁移约束：

1. 现有 `finance/read`、`finance/write` 只作为旧调用者过渡兼容，不得被新 workflow 继续扩展使用。
2. 新 capability 必须进入权限目录、legacy role 映射和可发布权限矩阵；绑定了自定义角色但未配置新 capability 的用户按默认拒绝处理，不能静默回退到更宽的旧权限。
3. 迁移前后必须分别覆盖店长、财务、销售、采购、施工、客服和总部审核员的允许/拒绝矩阵；尤其不能让店长获得报销付款权限，也不能让销售查看全店财务单据。
4. capability 生效后，workflow implementation 不再直接引用 `PermissionPolicy`；旧实现删除前只允许在模块内部 adapter 保留兼容读取。

## 38. 财务 capability matrix 实施结果（2026-08-10）

本节记录第 37 节确认项的落地结果：

- `ExpenseWorkflowService` 使用 `finance.application/submit/OWN` 发起费用，使用 `finance.expense/review/STORE` 审批费用，申请人撤回/重提使用 `finance.document/read` 的 owner 范围。
- `ReimbursementWorkflowService` 使用 `finance.application/submit/OWN` 发起报销，使用 `finance.reimbursement/review/STORE` 审批，使用 `finance.reimbursement/pay/STORE` 支付；撤回/重提和附件读取保持 owner 范围。
- `FinanceQueryService` 使用 `finance.document/read` 区分本人和门店范围；`FinanceAttachmentService` 使用 `finance.document/attach` 区分本人和门店范围；`FinanceService` 的 legacy 授权入口统一使用 `AccessContext`。
- 新增 migration `20260810120000_finance_capability_matrix`，权限目录和角色 grant 已部署到本地数据库；`migrate-permissions.ts` 同步支持新 capability 的定义和角色初始化。
- 财务生产代码不再引用 `PermissionPolicy`；自定义角色未配置新 capability 时不通过旧 `finance/write` 自动放权。

### 本节验收

- 财务 workflow、查询、附件、FinanceService、权限矩阵和闭环定向测试 31/31 通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API 类型检查和 Nest build 通过。
- FIN-003 的报销现金事实、审批/支付权限边界和附件授权迁移完成；ACC-003/ACC-005 的其他 caller、删除后全量回归及浏览器三档验收继续按阶段门执行。

## 39. ReportsService 销售范围迁移结果（2026-08-10）

- ReportsService 不再通过 `PermissionPolicy` 判断运行时销售角色，改为通过 `AccessContext.resolve()` 读取角色和门店范围。
- `reports/read` 继续作为报表入口能力；销售角色补齐门店入口授权，但报表订单、收款、发票、返利和提成查询继续按 `salesPersonId = actor.id` 限制，管理员/店长/财务的门店范围不变。
- 新增并部署 migration `20260810130000_sales_report_access`，保留无显式权限绑定的 legacy 销售用户进入报表的既有行为。
- ReportsService public interface、指标口径、筛选参数和导出行为保持不变；本次只替换隐藏的角色派生 implementation。

### 本节验收

- ReportsService 与权限矩阵定向测试 18/18 通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API 类型检查和 Nest build 通过。
- `apps/api/src/reports` 与 `apps/api/src/finance` 不再引用 `PermissionPolicy`。ACC-003 的 Reports 子项完成，ACC-005 其他调用者和浏览器三档验收继续进行。

## 40. CustomerSettlementsService 授权收口结果（2026-08-10）

- `CustomerSettlementsService` 构造函数强制注入 `AccessContext`，删除缺少访问上下文时的 `PermissionPolicy` fallback。
- 客户读取继续使用 `customers/read`，结算读写继续使用既有 `finance/write` 能力；仅替换授权实现，不改变企业结算的订单完工条件、对账金额、收款/红冲状态和审计行为。
- `CustomerSettlementsModule` 显式依赖 `PermissionsModule`，确保生产注入图满足新的强制依赖。

### 本节验收

- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过。
- API typecheck、Nest build 和 `git diff --check` 通过；客户结算目录不再引用 `PermissionPolicy`。
- CST-004 权限 fallback 子项完成；ACC-003/ACC-005 其他核心 callers、删除后回归和浏览器三档验收继续执行。

## 41. 发票、返利与产品目录 AccessContext 迁移结果（2026-08-10）

- 发票申请按 `finance/write` 的门店/owner scope 校验；发票列表使用 `finance.document/read`，销售角色通过 `AccessContext.resolve()` 得到本人订单 scope。
- 返利申请、审核、支付和列表均不再直接调用 `PermissionPolicy`；销售本人、客服申请、店长业务审核、财务审批/支付边界保持不变。
- 产品读取使用 `products/read`，产品和库存主数据管理使用 `products/write`；建议价写入通过 `AccessContext.resolve()` 限制为店长，标准成本继续由 `finance/write` 限制为店长/财务。
- 新增并部署 `20260810140000_products_access` migration；`migrate-permissions.ts` 和 legacy role map 同步包含产品权限。

### 本节验收

- 发票与财务查询定向测试 19/19，返利测试 10/10，产品测试 5/5 全部通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；类型检查通过。
- FIN-003 的发票/返利权限子项和产品目录权限子项完成；订单、库存、施工、售后、定价 caller 及删除后回归、浏览器验收继续执行。

## 42. InventoryService AccessContext 迁移结果（2026-08-10）

- `InventoryService` 构造函数强制接收 `AccessContext`，删除缺少访问上下文时的隐式 legacy 授权路径。
- 库存事实使用 `inventory/read|write`，采购需求、采购单、供应商和入库事实使用 `purchase/read|write`，门店仓库维护继续使用 `store/write`；门店 scope 在服务入口统一校验。
- 保持店长/采购可写、客服按门店只读、销售拒绝采购后台数据、财务读取边界、批次单位换算、成本记录、幂等入库和出库状态语义不变。
- 所有库存专项测试构造器都显式注入访问上下文，后续删除 `PermissionPolicy` 后不需要重新修改业务测试才能启动。

### 本节验收

- InventoryService 定向测试 42/42 通过。
- API 全量测试 435 个：433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API typecheck 通过。
- 库存模块已从 caller 迁移清单中移除；订单、施工、售后、定价以及 legacy implementation 删除后回归和浏览器三档验收继续执行。

## 43. WarrantiesService AccessContext 迁移结果（2026-08-10）

- `WarrantiesService` 强制接收 `AccessContext`；质保创建使用 `warranties/write`，列表与详情使用 `warranties/read`，门店 scope 在服务入口校验。
- 销售质保列表和详情仍按本人订单过滤；店长、排班员、客服的质保创建边界保持不变；质检通过、幂等创建、审计事件和公开质保号查询行为不变。
- 新增并部署 `20260810150000_warranties_access` migration，角色 grant 和 `migrate-permissions.ts` 同步更新。

### 本节验收

- WarrantiesService 定向测试 7/7 通过；API typecheck 和 Nest build 通过。
- 质保 caller 迁移完成；售后、订单生命周期、施工、定价、legacy implementation 删除后回归和浏览器三档验收继续执行。

## 44. AfterSalesService AccessContext 迁移结果（2026-08-10）

- `AfterSalesService` 强制接收 `AccessContext`；售后读写使用 `after-sales/read|write`，施工员/学徒本人证据提交使用 OWN scope，管理动作使用 STORE scope。
- 销售本人订单过滤、施工人员已派单过滤、证据阶段与状态流转、照片审计保持不变；售后成本仍按类别区分店长运营成本与财务退款/追偿成本，红冲继续为追加事实而非覆盖原记录。
- 新增并部署 `20260810160000_after_sales_access` migration，同步更新权限目录、角色 grant 和权限初始化脚本。

### 本节验收

- AfterSalesService 定向测试 10/10 通过；API 全量测试 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过；API typecheck 通过。
- 售后 caller 迁移完成；订单履约、施工、定价、客户、legacy implementation 删除后回归和浏览器三档验收继续执行。

## 45. CreateOrderUseCase AccessContext 迁移结果（2026-08-10）

- 订单创建使用 `orders/write`，指定其他销售人员使用 `store/write`；读取客户时使用 `customers/read` 搭配客户 owner scope。
- 销售本人客户、店长指定销售、客服创建订单和现场岗位读取订单的边界通过权限矩阵与测试保持；正式订单车辆、联系人、容量、价格和支付事实行为不变。
- 新增并部署 `20260810170000_orders_access` migration；`OrdersModule` 显式依赖 `PermissionsModule`，订单创建测试全部显式注入 `AccessContext`。

### 本节验收

- CreateOrderUseCase 与车辆联系人专项测试 16/16 通过；API 全量测试 435 个中 433 通过、0 失败、2 个 opt-in 并发测试跳过；API typecheck 通过。
- 订单创建 caller 迁移完成；订单列表、支付、改单、生命周期、施工和定价 caller 仍需继续处理。

## 46. OrdersService 与 OrderLifecycle AccessContext 迁移结果（2026-08-10）

- `OrdersService` 的订单列表/导出、详情、复制草稿、支付、收款账户、改单审核和历史核验统一使用 `AccessContext`；订单读取和写入使用 owner/store scope，财务动作继续保持 `finance/write` 语义。
- `OrderLifecycle` 的完工、取消和退回草稿等状态转换统一使用 `AccessContext`；状态机前置条件、施工/库存校验、审计与幂等行为保持不变。
- `OrderPolicy` 不再被生产 caller 引用；状态推导路径不依赖授权上下文，真实状态变更缺少上下文时明确失败，避免新增或保留隐式授权 fallback。

### 本节验收

- `OrdersService` 定向测试 23/23、`OrderLifecycle` 定向测试 9/9 通过。
- API 全量测试 435 个中 433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API typecheck 和 Nest build 通过。
- 订单履约核心 caller 迁移完成；`OrderPolicy` 兼容文件待所有核心 caller 完成后统一删除，随后执行删除后回归。施工、客户、定价和浏览器三档验收继续进行。

## 47. Construction 履约 AccessContext 迁移结果（2026-08-10）

- `ConstructionService` 的容量、派工、施工记录、物料、照片、质检、请假、排班和离线同步入口统一使用 `AccessContext`；销售本人、施工员/学徒本人任务以及管理岗位的门店范围保持。
- `CrossStoreConstructionService` 的跨店任务读取、执行/来源门店操作和产品映射维护统一使用 `construction/read|write` 的门店 scope，不再依赖 runtime snapshot 或旧成员字段 fallback。
- `ConstructionCostSettlementService` 的成本读取、店长确认、财务审批/结算和人员成本脱敏统一使用 `AccessContext`；店长确认仍不返回个人成本，财务审批/结算仍要求财务或审核员角色。
- 容量对账 controller 使用 `store/write` 判断；施工模块已显式依赖 `PermissionsModule`，缺少访问上下文时明确失败。

### 本节验收

- 施工域专项测试 33/33 通过。
- API 全量测试 435 个中 433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API typecheck 通过。
- 施工目录不再引用 `PermissionPolicy`；施工履约 caller 迁移完成。客户、定价、legacy implementation 删除后回归和浏览器三档验收继续执行。

## 48. 客户、定价与报价 AccessContext 迁移结果（2026-08-10）

- `CustomersService` 的客户创建、列表、搜索、详情、编辑、人工标签、企业用户和车辆生命周期统一使用 `AccessContext`；销售本人 owner scope、门店读写范围和车辆店长操作边界保持不变。
- 定价核心 caller 统一使用 `AccessContext`：产品/规则读取使用 `products/read`，配置写入使用 `products/write` 或 `store/write`，财务成本查看/维护和迁移预检使用 `finance/write`，管理员模板维护通过角色解析；成本估算内部调用沿用真实 actor，不再使用虚拟管理员身份。
- `SalesQuotesService` 的报价创建、列表、导出、详情、提交审批、店长审核、撤回、重算和转订单使用订单/门店/财务 capability，销售本人过滤和成本脱敏规则保持。
- 客户域 `CustomerPolicy`、订单域 `OrderPolicy` 已删除；权限基础设施的旧运行时缓存桥暂保留至删除后回归阶段。

### 本节验收

- 客户专项测试 17/17、定价专项测试 20/20、报价专项测试 7/7 通过。
- API 全量测试 435 个中 433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过；API typecheck 通过。
- 客户、定价和报价生产目录不再引用 `PermissionPolicy`；下一步仅剩旧权限桥清理、删除后回归和浏览器三档验收。

## 49. 权限运行时缓存拆分结果（2026-08-10）

- 新增 `RuntimeAccessSnapshotStore` 作为权限服务内部缓存组件，`PermissionsService` 的缓存生命周期不再需要由业务 caller 访问。
- 客户、定价、报价、施工、订单、库存、质保、售后、财务和报表生产 caller 均已不再直接依赖 `PermissionPolicy`。
- 兼容阶段暂保留 `PermissionsService` 向旧 `PermissionPolicy` 写入/清理运行时快照的桥接，以保证现有兼容测试和历史外部调用不发生未验证变化；该桥不属于新的业务 public interface。

### 本节验收

- API 全量测试 435 个中 433 通过、0 失败、2 个 opt-in 真实数据库并发测试跳过。
- API typecheck 和 Nest build 通过。
- 旧权限桥删除尚未完成；下一步必须先把桥测试迁移到 `AccessContext/PermissionsService`，再删除旧实现并执行删除后全量回归。

## 50. 兼容桥删除门的安全收口（2026-08-10）

- `RuntimeAccessSnapshotStore` 已成为权限服务内部缓存生命周期的独立组件，并补充 set、has、clear、clearAll 回归测试。
- 已迁移业务 caller 不再直接依赖 `PermissionPolicy`；但 `PermissionsService` 到旧策略的运行时桥暂不删除，避免在未完成拆分的全局授权基础设施上引入未经验证的行为变化。
- 本节不新增业务接口、权限规则或数据语义；仅记录删除门的安全边界和后续验收条件。

### 验收与未完成项

- API 全量 435 个测试：433 通过、0 失败、2 个 opt-in 并发测试跳过；API typecheck、Nest build 通过。
- P1 未完成项：迁移旧桥测试、删除旧策略行为/无用测试、删除后全量回归、Web 三档浏览器验收。

## 51. 浏览器验收环境门（2026-08-10）

- Chrome 连接已恢复，Web 服务可监听 3000；API 路由注册成功，但后台报价过期任务连接 PostgreSQL 时 `ECONNREFUSED`，API 进程退出。
- 本轮不启动项目 compose 的持久化数据库卷，因此没有把未登录或无 API 的页面结果当作业务验收证据。
- 旧权限桥删除、删除后全量回归和 1440/1024/390 浏览器验收仍未完成；恢复数据库依赖后再继续。

## 52. 五候选实施最终收口（2026-08-10）

- 权限类型契约已迁移到 `permissions/domain/access-types.ts`；业务 caller 不再从旧策略文件读取类型。
- `PermissionsService` 已完全改用 `RuntimeAccessSnapshotStore`，旧 `PermissionPolicy` 实现及旧测试已删除，运行时授权行为统一由 `AccessContext/PermissionsService` 提供。
- API 全量 423/423、真实 PostgreSQL 并发阶段门 2/2、Web 全量 616/616、API/Web typecheck、API/Web build 全部通过。
- 使用店长测试账号完成真实浏览器验收；报表、客户、施工任务和财务代表页在 1440/1024/390 下无横向溢出，登录后门店上下文显示为“北京测试 / 店长”。

### 本节结论

五个候选的任务拆分、实现、评审修复、删除后回归和浏览器阶段门均已完成；现有 API、权限、状态流转、业务事实和数据含义保持不变。
