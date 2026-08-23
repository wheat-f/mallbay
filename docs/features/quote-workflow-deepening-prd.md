# QuoteWorkflow（报价执行）深化 PRD

> 文档版本：v0.2-revised  
> 编写日期：2026-08-23  
> 当前阶段：架构设计草案，待评审  
> 关联术语：`CONTEXT.md`「报价执行」  
> 关联 ADR：ADR-0002（OrderLifecycle）、ADR-0004（PricingDecision 快照）、ADR-0009（采购原子性/幂等性）、ADR-0012（禁止双写迁移）

## 1. 背景与问题

当前 `apps/api/src/sales-quotes/sales-quotes.service.ts` 同时承载报价创建、列表、导出、详情、提交审批、过期、审核、撤回、重算和转订单，文件约 36.6 KB、631 行。它直接协调报价持久化、价格试算快照、容量占位、访问能力、审计和订单生命周期。

这使报价执行的业务规则分散在 HTTP adapter、过期调度和宽大的报价 implementation 之间：

1. 报价状态和审批状态需要与容量占位保持一致，但失败和并发语义分布在多个方法中。
2. 报价转订单必须经过 `OrderLifecycle`，但报价 module 仍承担了转单入口、授权与输入适配的混合职责。
3. 报价查询和报价命令共享同一 interface，导致测试必须直接构造完整 implementation，测试表面随内部依赖变化。
4. 重算会撤回旧报价并创建新的报价版本，旧报价审计、容量释放和新报价创建之间缺少一个清晰的报价执行 locality。

本 PRD 通过 QuoteWorkflow deep module 收拢报价命令执行，保持已有业务事实和跨 module ownership 不变。

## 2. 目标

### 2.1 业务目标

- 保持报价创建、审批、撤回、重算、过期和转订单的现有业务语义。
- 保证报价状态、审批状态、容量占位和转订单结果在重复提交、并发操作和失败重试下可解释。
- 让报价执行规则集中在一个具有足够 depth 的 module 中。

### 2.2 架构目标

- 建立 QuoteWorkflow 命令 interface，作为报价执行的外部 seam。
- 将查询/导出与命令执行分离，减少 interface 的复杂度。
- 保留 `PricingDecision`、`CapacityReservationService`、`OrderLifecycle`、`CashFactWriter` 和 `AccessContext` 的既有 ownership。
- 让 contract tests 成为主要测试 surface；调用者不再依赖报价持久化 implementation 的细节。
- 通过删除测试证明旧的宽报价 service 不是新的第二条执行路径。

## 3. 范围

### 3.1 本期范围

1. 报价命令 interface 与 QuoteWorkflow implementation。
2. 报价创建、提交、审核、撤回、重算、过期、转订单的迁移。
3. 报价 HTTP controller 和过期 scheduler 迁移到新 interface。
4. 报价命令的权限、幂等、并发、错误和审计语义固化为 contract tests。
5. 报价读取/导出独立为 read interface 或 read adapter，但保持现有查询结果和权限脱敏语义。
6. 删除迁移期旧调用路径和无效兼容代码，完成删除后回归。

### 3.2 非目标

- 不修改现有 HTTP 路由、请求字段、响应字段或前端交互。
- 不重新设计定价规则、成本计算、毛利保护或审批阈值。
- 不让报价 module 拥有价格/成本事实、容量事实、库存事实、订单履约事实或现金事实。
- 不新增消息、通知、异步事件总线或跨进程调度机制。
- 不删除历史报价、旧价格字段或数据库兼容字段。
- 不把 `OrderLifecycle` 的订单状态机复制到报价 module。

## 4. 用户与调用者

| 调用者/角色 | 使用场景 | 本期变化 |
|---|---|---|
| 销售 | 创建、提交、撤回、重算本人报价；查看本人报价 | 业务行为不变，仅调用新 interface |
| 店长 | 查看门店报价、审批报价、维护临时成本 | 业务行为不变，审批命令经 QuoteWorkflow |
| 财务 | 查看包含成本和毛利的报价数据 | 查询/导出权限与脱敏保持 |
| 系统调度 | 处理过期待审批报价 | 只调用报价过期命令；容量过期/对账仍由容量 module 自己负责 |
| OrderLifecycle | 将已批准报价转换为订单 | 仍是订单创建和订单事实的唯一 authority |

## 5. 核心对象与 ownership

| 对象 | QuoteWorkflow 是否拥有 | 说明 |
|---|---|---|
| SalesQuote / SalesQuoteItem | 是 | 报价及报价行的生命周期和快照引用 |
| PricingApproval | 是 | 报价审批记录与审批状态 |
| PricingDecision / PricingCalculation | 否 | 只读取已生成的定价决策和成本快照 |
| CapacityReservation | 否 | 通过容量 adapter hold / confirm / release |
| Order / OrderLifecycle | 否 | 通过 `OrderLifecycle` 发起已批准报价转单 |
| CashFact / PaymentRecord | 否 | 不新增或改写现金事实 |
| AuditEvent | 否 | 通过审计 adapter 记录报价执行事件 |
| AccessContext | 否 | 由权限 module 计算访问主体、能力和范围 |

## 6. 目标 module 结构

### 6.1 外部 interface

QuoteWorkflow 对外暴露报价命令语义。调用者必须知道的 interface 包括：

- 命令必须带访问主体、业务对象标识和必要的幂等命令标识。
- 命令只接受稳定的业务输入，不接受 Prisma 查询对象或 transaction client。
- 命令返回报价执行结果或稳定错误分类，不要求调用者解析中文错误文案。
- 命令的并发失败、重复提交和已处理结果必须可区分。
- 同一命令重试不得产生重复报价、重复审批、重复容量占位或重复订单。

命令集合：

| 命令 | 结果 | 关键约束 |
|---|---|---|
| create | 报价及审批/容量结果 | 校验定价快照、客户、商品、施工条件、幂等指纹 |
| submit | 待审批报价 | 校验保护价、成本完整性、审批类型并创建容量软占位 |
| review | 已批准或已拒绝报价 | 审批记录与报价状态条件更新，批准确认容量，拒绝释放容量 |
| withdraw | 已撤回报价 | 仅草稿/待审批可撤回，并释放相关容量 |
| recalculate | 新报价及旧报价引用 | 旧报价保留为审计记录，新报价使用新的不可变定价快照 |
| expire | 过期处理结果 | 条件更新待审批报价，并释放已过期容量 |
| convertToOrder | OrderLifecycle 结果 | 仅将转单输入交给 `OrderLifecycle`，不直接写订单事实 |

### 6.2 查询 interface

查询/导出使用独立的 QuoteReadModel interface 或 read adapter，负责：

- 列表、详情、逐产品导出。
- 门店范围、销售本人范围和财务成本脱敏。
- 报价状态、审批、容量、客户/车辆和定价快照摘要的组合读取。

查询 interface 不得触发报价状态变更、容量变更、审计写入或订单创建。

### 6.3 内部 adapters

| Adapter | QuoteWorkflow 使用方式 | 不得越过的 ownership |
|---|---|---|
| PricingDecision snapshot adapter | 读取并校验定价输入/输出快照 | 不重新计算或改写价格规则 |
| Capacity reservation adapter | hold、confirm、release 报价容量 | 不直接写容量表，不拥有容量状态机 |
| OrderLifecycle adapter | 发起 `APPROVED_QUOTE` 转订单 | 不直接创建 Order、OrderItem 或支付事实 |
| Access adapter | 解析访问主体、能力和数据范围 | 不按岗位字段或页面字段放权 |
| Audit adapter | 记录报价执行事件 | 不改变报价状态或事实 |
| Quote persistence implementation | 保存报价、报价行和审批记录 | 只在 QuoteWorkflow 内部使用 |

### 6.4 转订单 authority

`QuoteWorkflow.convertToOrder` 只负责访问主体、命令上下文和 `APPROVED_QUOTE` 输入适配；它不得直接更新 `SalesQuote.status` 或 `convertedOrderId`。`OrderLifecycle` 是以下事实的唯一写入 authority：

- 报价从 `APPROVED` claim 为 `CONVERTED`。
- 创建订单及其订单行、金额、库存预留和相关订单事实。
- 写入 `convertedOrderId`。
- 记录报价转订单审计。

这些动作必须继续由 `OrderLifecycle` 在同一事务和同一 commandId 幂等记录中完成，QuoteWorkflow 不得在调用前后补写第二条状态路径。

### 6.5 HTTP route compatibility matrix

本期路由和前端调用不变，只替换 Controller 内部依赖：

| Route | 现有动作 | 目标 interface | 兼容要求 |
|---|---|---|---|
| `POST /sales-quotes` | create | QuoteWorkflow.create | 保留 `Idempotency-Key`、报价审批自动分流和 `QUOTE_APPROVAL_REQUIRED` |
| `GET /sales-quotes` | list | QuoteReadModel.list | 保留销售本人/门店范围和成本脱敏 |
| `GET /sales-quotes/export-details` | exportDetails | QuoteReadModel.exportDetails | 保留逐产品行、排序和财务成本字段 |
| `GET /sales-quotes/:id` | get | QuoteReadModel.get | 保留详情关联和非财务脱敏 |
| `POST /sales-quotes/:id/submit` | submit | QuoteWorkflow.submit | 保留待审批、容量 HOLD 和审批类型 |
| `POST /sales-quotes/:id/approve` | review(true) | QuoteWorkflow.review | 保留审批成功结果和容量 CONFIRMED |
| `POST /sales-quotes/:id/reject` | review(false) | QuoteWorkflow.review | 保留拒绝结果和容量释放 |
| `POST /sales-quotes/:id/withdraw` | withdraw | QuoteWorkflow.withdraw | 保留撤回原因和容量释放 |
| `POST /sales-quotes/:id/recalculate` | recalculate | QuoteWorkflow.recalculate | 增加稳定 commandId；旧请求由 adapter 生成迁移期标识 |
| `POST /sales-quotes/:id/convert-to-order` | convertToOrder | QuoteWorkflow.convertToOrder | 保留 OrderLifecycle 的 `commandId`、重复转单 replay 和错误映射 |

`QUOTE_APPROVAL_REQUIRED` 是现有 Web 自动进入报价审批的稳定分流 code，必须继续保留；不得被通用的 `PRICING_SNAPSHOT_INVALID` 或其他新分类覆盖。

## 7. 状态与流程

### 7.1 报价状态

| 状态 | 含义 | 可执行动作 |
|---|---|---|
| DRAFT | 报价已创建但尚未进入审批流程 | submit、withdraw |
| PENDING_APPROVAL | 已提交审批且可能持有容量软占位 | review、withdraw、expire |
| APPROVED | 审批通过，可转正式订单 | convertToOrder |
| REJECTED | 审批拒绝，可重算 | recalculate |
| EXPIRED | 审批有效期结束，可重算 | recalculate |
| WITHDRAWN | 报价主动撤回，可重算 | recalculate |
| CONVERTED | 已完成转订单 | 只读 |

终态规则：`APPROVED`、`REJECTED`、`EXPIRED`、`WITHDRAWN`、`CONVERTED` 不允许通过旧命令隐式回退；重算创建新的报价记录，旧报价保留审计关联。

### 7.2 主流程

1. 调用者提交创建命令和 `Idempotency-Key`。
2. QuoteWorkflow 校验访问能力、来源/执行门店关系、客户/车辆、商品、施工条件、价格试算快照和成本条件。
3. QuoteWorkflow 保存报价和报价行；需要审批时创建待审批记录并请求容量软占位。
4. 销售提交审批；系统根据价格保护和成本完整性决定审批类型。
5. 店长审批；批准时确认容量，拒绝时释放容量。
6. 过期调度调用 expire；报价条件更新成功后释放容量并写审计。
7. 报价需要调整时，释放旧报价占位并创建新的报价版本；旧报价不被静默覆盖。
8. 已批准报价转订单时，QuoteWorkflow 只调用 `OrderLifecycle.createOrder(source=APPROVED_QUOTE)`。

### 7.3 并发与失败

| 场景 | 规则 |
|---|---|
| 创建命令重复且输入指纹相同 | 返回原报价及其关联结果 |
| 创建命令重复但输入指纹不同 | 返回稳定 `COMMAND_ID_CONFLICT` |
| 审批/撤回/过期同时发生 | 条件更新只允许一个动作成功；其他动作返回已处理/状态冲突 |
| 容量占位失败 | 报价提交事务失败，不能留下待审批报价；释放动作可幂等重试 |
| 审批成功但容量确认失败 | 事务回滚，不返回批准成功；记录可诊断错误并允许用同一命令重试 |
| 转订单重复 | 使用 `commandId` 和 `OrderLifecycle` 的幂等记录返回同一订单结果 |
| 转订单失败 | QuoteWorkflow 不修改报价状态；由 OrderLifecycle 的事务结果决定是否保持 APPROVED 或返回既有 replay |
| 调度重复运行 | expire 对已处理报价无副作用，容量释放和审计具备幂等语义 |

批准与容量确认的具体一致性规则：`review(approve=true)` 必须调用容量 adapter 的事务内确认能力；报价状态、审批记录和容量确认共同成功才返回批准成功。容量记录缺失、状态不为 `HELD` 或确认失败时，整个批准事务回滚，报价不能返回 `APPROVED`。容量 module 仍拥有容量表与容量状态事实，QuoteWorkflow 不直接写容量表。

重算幂等规则：重算命令必须接收稳定 `commandId` 或等价稳定幂等标识，并将旧报价 id、输入指纹和新报价 id 绑定在 QuoteWorkflow 的命令记录中。同一旧报价、同一 commandId 和同一输入重试返回同一新报价；同一 commandId 对应不同输入返回 `COMMAND_ID_CONFLICT`。迁移期若旧 HTTP 请求没有该字段，HTTP adapter 可基于请求幂等头生成兼容标识，但不得使用当前时间作为每次重试的新标识。

过期命令结果至少区分 `scannedCount`（扫描到的待审批报价数量）、`expiredCount`（条件更新成功的数量）和 `capacityReleasePendingCount`（报价已过期但容量释放待重试的数量）；重复运行不得重复释放容量或写重复审计。

## 8. 权限与数据范围

| 能力 | 销售本人 | 店长 | 财务 | 系统调度 |
|---|---:|---:|---:|---:|
| 报价读取 | 本人 | 门店 | 门店 | 否 |
| 报价创建 | 门店/本人规则 | 门店 | 按现有权限 | 否 |
| 提交、撤回、重算 | 本人 | 门店 | 按现有权限 | 否 |
| 审批 | 否 | 门店 | 否 | 否 |
| 成本/毛利查看 | 否 | 按现有脱敏规则 | 是 | 否 |
| 过期处理 | 否 | 否 | 否 | 是 |
| 转订单 | 按现有报价权限 | 按现有报价权限 | 按现有权限 | 否 |

权限计算统一经 `AccessContext`；QuoteWorkflow 不读取 `isAuditor`、岗位字段或页面传入字段作为放权依据。来源门店与执行门店的跨店规则保持现有校验。

## 9. 错误与结果

本期将内部异常归一为可测试的稳定错误分类，保留现有 HTTP 状态映射：

| 分类 | 适用场景 | 调用者行为 |
|---|---|---|
| COMMAND_ID_REQUIRED | 创建或转订单缺少必要命令标识 | 补充标识后重试 |
| COMMAND_ID_CONFLICT | 相同幂等标识对应不同输入 | 不自动重试，提示重新发起 |
| QUOTE_NOT_FOUND | 报价不存在或不在访问范围 | 不泄漏对象存在性 |
| QUOTE_STATE_CONFLICT | 当前状态不允许该命令或已被其他操作处理 | 重新读取报价后决定下一步 |
| PRICING_SNAPSHOT_INVALID | 价格/成本快照缺失、不完整或与报价行不一致 | 重新试算后重试 |
| CAPACITY_EXECUTION_FAILED | 容量占位、确认或释放失败 | 按命令幂等语义重试并记录诊断 |
| ORDER_CONVERSION_FAILED | OrderLifecycle 未完成转单 | 按 commandId 重试，不直接写订单 |

兼容映射规则固定如下：已有 `QUOTE_APPROVAL_REQUIRED` 保持原 code、HTTP 状态和 Web 自动进入报价审批的语义；新 QuoteWorkflow 内部分类只在没有现有兼容 code 时映射到 HTTP adapter。不得要求 Web 解析中文 `message`。

## 10. 数据与兼容

- 不新增业务表，不改变既有 `SalesQuoteStatus`、`PricingApprovalStatus`、`CapacityReservationStatus` 枚举。
- 保留 `SalesQuote` 的历史兼容金额字段和已有 idempotency 字段。
- 不迁移、不重算历史报价，不删除旧报价版本。
- 不建立 QuoteWorkflow 与旧 `SalesQuotesService` 的双写路径；迁移期只能有一个报价事实写入 implementation。
- 迁移完成后删除旧调用者依赖、旧 facade 和仅为迁移存在的桥接代码。

## 11. 验收标准

### 11.1 Contract tests

1. Given 相同创建命令和相同幂等标识，When 重复执行，Then 返回同一报价且不新增报价行、审批记录或容量占位。
2. Given 相同创建命令标识但输入指纹不同，When 执行，Then 返回 `COMMAND_ID_CONFLICT`。
3. Given 待审批报价，When 并发执行审核、撤回和过期，Then 只有一个状态动作成功，其他动作得到稳定状态冲突结果。
4. Given 需要审批的报价，When 提交成功，Then 报价为 `PENDING_APPROVAL`、审批记录为 `PENDING`、容量为 `HELD`。
5. Given 店长批准报价且容量记录为 `HELD`，When 审批成功，Then 审批记录为 `APPROVED`、报价为 `APPROVED`、容量确认在同一事务内由容量 adapter 完成；Given 容量确认失败，Then 报价和审批事务回滚且不返回批准成功。
6. Given 店长拒绝报价，When 审批成功，Then 报价为 `REJECTED` 且容量释放。
7. Given 已批准报价，When 转订单，Then 只通过 `OrderLifecycle` 创建订单，QuoteWorkflow 不直接写订单表。
8. Given 转订单命令重复，When 使用同一 `commandId` 重试，Then 返回同一订单结果。
9. Given 报价重算命令带稳定 commandId，When 创建新版本，Then 旧报价保留为审计记录并与新报价关联；同一 commandId 重试返回同一新报价，不静默创建第二个版本。
10. Given 非财务访问主体，When 查询或导出报价，Then 内部成本和毛利字段继续脱敏。
11. Given `POST /sales-quotes` 触发报价审批分流，When PricingDecision 返回需要审批，Then HTTP adapter 仍返回 `QUOTE_APPROVAL_REQUIRED`，Web 不需要解析中文 message。
12. Given 过期任务重复执行，When部分报价已被其他任务处理，Then 结果区分扫描数量与实际过期数量，且不重复释放容量或写重复审计。

### 11.2 删除后回归

- `SalesQuotesController` 和 `SalesQuoteExpiryScheduler` 不再直接依赖旧宽 implementation 的命令细节。
- 生产代码不出现第二条报价状态写入路径。
- QuoteWorkflow 删除后，报价状态、审批、容量和转订单复杂度会重新散落到多个 caller；因此必须以 contract tests 和现有专项测试证明新 seam 正在承载真实 depth。
- API 全量测试、API typecheck、Nest build 和报价专项测试通过。
- 报价命令结果至少可观测到 command type、replay、result code、失败分类和耗时；现有审计事件继续保留。

## 12. 实施阶段门

| 阶段 | 进入条件 | 完成条件 | 阻塞条件 |
|---|---|---|---|
| M1 interface 与 contract tests | 本 PRD 评审通过 | interface、结果分类、fake adapters 和核心状态矩阵完成 | interface 暴露 Prisma/transaction 细节 |
| M2 命令迁移 | M1 通过 | Controller、scheduler、命令测试切换到 QuoteWorkflow | 出现双写或第二条状态路径 |
| M3 查询分离 | M2 通过 | list/detail/export 只依赖 read interface，脱敏回归通过 | 查询触发状态/容量/审计副作用 |
| M4 删除与回归 | M2/M3 通过 | 删除旧 facade/桥接后 API 全量、typecheck、build 通过 | 任一事实语义或权限回归 |
| M5 运行验收 | M4 通过 | 重复命令、并发审批、过期、重算、转单场景验收通过 | 数据库依赖或环境阶段门失败 |

## 13. 风险与依赖

- `OrderLifecycle` 的转单幂等和报价状态更新顺序必须保持 ADR-0002 约束。
- 容量确认/释放失败的补偿语义需要实现阶段用真实数据库并发测试确认，不得用文档假设替代。
- 错误分类新增或映射必须兼容现有 Web 的 `QUOTE_APPROVAL_REQUIRED` 分流。
- 读取分离可能暴露历史金额字段和成本脱敏差异，需要保留现有导出专项测试。
- 不启动新的异步基础设施；过期 scheduler 仍可调用 QuoteWorkflow 的 expire 命令。

## 14. 追踪关系

| 需求 | 代码/测试证据 |
|---|---|
| 报价状态与审批 | `apps/api/src/sales-quotes/sales-quotes.service.ts:353-486` |
| 报价重算 | `apps/api/src/sales-quotes/sales-quotes.service.ts:489-529` |
| 转订单 ownership | `apps/api/src/sales-quotes/sales-quotes.service.ts:532-538`、ADR-0002 |
| 报价/容量调度 | `apps/api/src/sales-quotes/sales-quote-expiry.scheduler.ts` |
| 报价数据模型 | `apps/api/prisma/schema.prisma:1503-1604` |
| 现有专项测试 | `apps/api/src/sales-quotes/sales-quotes.service.test.ts` |

## 15. 版本记录

| 版本 | 日期 | 说明 |
|---|---|---|
| v0.1-draft | 2026-08-23 | 根据确认的 QuoteWorkflow 设计方向形成初稿，待需求评审 |
| v0.2-revised | 2026-08-23 | 根据评审补齐批准/容量原子性、重算幂等、OrderLifecycle 唯一 authority、route/error 兼容和过期结果语义 |
