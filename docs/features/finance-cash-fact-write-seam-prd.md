# 订单现金事实写入 seam PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | 订单现金事实写入 seam 收拢 |
| 文档版本 | V0.4（P4 落地版） |
| 当前状态 | 已完成 |
| 产品负责人 | 待指定 |
| 创建日期 | 2026-08-22 |
| 适用范围 | MallBay API 的订单、财务与退货领域 |
| 关联领域词汇 | `CONTEXT.md`：现金事实、事实发生日期、企业结算、客户消费概览 |
| 关联决策 | ADR-0012、ADR-0014、ADR-0015 |
| 关联实现 | `CashFactWriter`、`OrdersService`、`CreateOrderUseCase`、`FinanceService`、`ReturnsService` |

> 本需求没有页面视觉改造，不新增用户可见页面。本文把写入边界、事务、幂等、错误和验收规则定义为研发与测试基线。

## 2. 需求背景

### 2.1 业务背景

订单收款同时形成两类事实：

1. `OrderPayment`：订单维度的收款明细，用于订单已收、待收和履约判断；所有权属于订单模块。
2. `PaymentRecord`：实际发生的现金收入、付款、退款或冲销，用于财务流水、来源追溯和现金事实查询；所有权属于 Finance 模块。

当前系统已经存在 Finance 的现金事实写入入口，但订单初始定金和普通订单收款仍需要直接操作 `PaymentRecord`。同一现金事实的来源、幂等和冲突语义因此分散在订单、财务和退货流程中。

### 2.2 当前问题

- 订单调用者需要理解 `PaymentRecord` 的底层字段和写入约束。
- 同一门店同一幂等键的重放与输入冲突缺少统一实现。
- 订单事实与现金事实的事务边界容易被后续调用者破坏。
- 现金事实写入 seam 的 deletion test 不成立，后续无法安全删除直接写表路径。
- 历史上 Returns 曾有销售退款、供应商退款和供应商退款冲销三处直写；P4 已完成迁移，避免不同模块继续分散现金事实语义。

### 2.3 需求依据

- `CONTEXT.md` 已将“现金事实”定义为实际发生的收款、付款、退款、冲销及其来源和反向关系。
- ADR-0012 要求迁移采用“旧入口适配到新 interface”，禁止新旧两套 implementation 双写。
- ADR-0014 已确认 Finance 拥有现金事实写入 seam，首期先迁移订单初始定金和普通订单收款。
- 当前数据库已有 `PaymentRecord` 的 `[storeId, idempotencyKey]` 唯一约束以及来源字段，无需新增数据表才能完成首期收拢。

## 3. 产品目标

1. 建立由 Finance 提供的独立 `CashFactWriter` 写入模块，统一首期现金事实的类型、方向、来源、发生日期和幂等行为。
2. 使订单初始定金、普通订单收款在同一个业务事务中同时写入 `OrderPayment` 和 `PaymentRecord`。
3. 让订单模块只负责订单收款明细、订单金额和履约版本；不直接依赖 `PaymentRecord` 的持久化写入细节。
4. 保留现有 `FinanceService` 写入方法作为兼容 adapter，既有财务 workflow 的调用契约不变。
5. 用模块契约测试和直接写表扫描证明订单与 Finance 生产代码不再直接写 `PaymentRecord`。
6. 收拢 Returns 销售退款、供应商退款和供应商退款冲销的现金事实写入，完成 Finance-only 生产写入边界。

### 3.1 上线验证方向

- 首期订单现金事实的新增、重放、输入冲突和事务回滚均有自动化测试覆盖。
- 订单与 Finance 生产目录中除 `CashFactWriter` 外不出现新的 `paymentRecord.create`。
- 订单初始定金与普通收款的 `PaymentRecord` 都能通过来源字段关联到对应 `OrderPayment`。
- Returns 的三处既有直写纳入 P4 迁移，并由同一 writer 统一处理来源、幂等和冲销关系。

## 4. 本期范围

### 4.1 纳入范围

- 新增 `CashFactWriter` 及其窄事务上下文。
- 统一以下首期现金事实类型及方向：

| 业务动作 | `PaymentRecord.type` | `PaymentRecord.direction` |
|---|---|---|
| 订单初始定金 | `ORDER_PAYMENT` | `INCOME` |
| 普通订单收款 | `ORDER_PAYMENT` | `INCOME` |
| 客户收款 | `CUSTOMER_RECEIPT` | `INCOME` |
| 客户收款冲销 | `CUSTOMER_RECEIPT_REVERSAL` | `EXPENSE` |
| 供应商退款 | `SUPPLIER_REFUND_OUT` | `OUTFLOW` |
| 供应商退款冲销 | `SUPPLIER_REFUND_REVERSAL` | `INFLOW` |
| 返利支付 | `REBATE` | `EXPENSE` |
| 报销支付 | `REIMBURSEMENT` | `EXPENSE` |

- 迁移订单初始定金写入。
- 迁移普通订单收款写入。
- 让 `FinanceService.recordCustomerReceipt`、`recordCustomerReceiptReversal`、`recordRebatePayout`、`recordReimbursementPayout` 委托给 `CashFactWriter`。
- 增加 writer 单元测试、订单回归测试、模块导出契约测试和 direct-write 扫描。

### 4.2 非目标

- V0.2 首期不迁移 Returns；V0.3 追加 P4 设计，V0.4 完成销售退款、供应商退款、供应商退款冲销三处迁移。
- 不改变 `OrderPayment`、`PaymentRecord` 的数据库模型、唯一约束或历史数据。
- 不改变已有 HTTP 路由、DTO、权限角色和页面交互。
- 不改变客户消费、企业结算、发票、报表的读取口径。
- 不把 `OrderPayment` 的所有权移交给 Finance，也不让 Finance 直接修改订单金额或履约版本。
- 不引入跨服务网络调用、事件溯源或异步最终一致性。

## 5. 用户角色与职责边界

本需求不新增角色或权限。角色职责保持如下：

| 角色/模块 | 本期职责 | 不负责的内容 |
|---|---|---|
| 销售、店长、财务操作员 | 通过既有订单/财务流程发起业务动作 | 不直接操作 `PaymentRecord` |
| Orders module | 校验订单、创建/重放 `OrderPayment`、更新订单金额和履约版本 | 不直接创建 `PaymentRecord` |
| Finance module | 通过 `CashFactWriter` 创建或重放现金事实 | 不修改 `OrderPayment`、订单金额或履约状态 |
| Returns module | 拥有退款/结算状态、ReturnAction、Adjustment 与审计；调用 Finance writer 形成现金事实 | 不直接创建 `PaymentRecord` |

`CashFactWriter` 不承担访问授权。授权由调用 workflow 在进入事务前或事务内按既有 `AccessContext` 规则完成。

## 6. 核心业务对象

| 对象 | 定义 | 关键字段 | 所有权/状态 |
|---|---|---|---|
| `OrderPayment` | 一张订单上的收款明细 | `orderId`、`accountId`、`amountCents`、`paidAt`、`createdById`、`idempotencyKey` | Orders；随订单收款创建，不新增状态机 |
| `PaymentRecord` | 实际发生的现金收入、付款、退款或冲销事实 | `storeId`、`type`、`direction`、`amountCents`、`sourceType`、`sourceId`、`occurredAt`、`idempotencyKey` | Finance；追加写入，不由本需求编辑或删除 |
| `CashFactWriter` | 现金事实的唯一应用级写入 seam | 现金事实输入、窄事务上下文、写入结果 | Finance implementation；返回业务结果，不返回完整 Prisma 行 |
| 幂等键 | 标识一次现金事实写入意图的稳定值 | `storeId + idempotencyKey` | 数据库唯一约束保护；同输入重放，异输入冲突 |

## 7. 核心业务流程

### 7.1 普通订单收款

1. 具备既有订单收款能力的用户提交订单收款请求。
2. Orders 在已有事务中校验订单、收款账户、金额和订单收款幂等键。
3. 若相同订单收款幂等键已绑定相同输入，返回原 `OrderPayment` 业务结果，不新增事实；若输入不同，返回既有订单收款冲突错误。
4. Orders 创建 `OrderPayment`。
5. Orders 调用 `CashFactWriter.recordOrderPayment`，以 `OrderPayment.id` 作为 `sourceId`，以 `ORDER_PAYMENT:{orderId}:{idempotencyKey}` 作为现金事实幂等键。
6. 系统重新聚合订单收款，更新 `OrderAmount.paidAmountCents`、`outstandingCents`，并按既有规则推进履约版本与审计事实。
7. 全部动作成功则提交；任一动作失败则整笔事务回滚，不能留下孤立订单收款或现金事实。

### 7.2 订单初始定金

1. 用户创建订单并提交金额大于 0 的定金。
2. CreateOrderUseCase 在创建订单事务中创建 `OrderPayment`，保留既有订单定金业务键。
3. 同一事务调用 `CashFactWriter.recordOrderPayment`，以新建的 `OrderPayment.id` 作为来源，以 `ORDER_INITIAL_DEPOSIT:{orderId}` 作为现金事实幂等键。
4. 订单、订单金额、定金明细、现金事实和容量等既有创建事实全部成功才提交；现金事实写入失败时订单创建整体回滚。

### 7.3 Finance 兼容写入

1. 客户收款、收款冲销、返利支付或报销支付 workflow 打开业务事务。
2. 调用既有 `FinanceService` 写入方法。
3. `FinanceService` 将调用转交给 `CashFactWriter`，不再自行拼装 `PaymentRecord` 写入逻辑。
4. 对外返回既有最小 `{ id }` 结果，调用方不感知 writer 的内部实现。

## 8. 写入规则

### 8.1 输入规则

每次写入必须提供：

- `storeId`、`type`、`direction`、`amountCents`、`createdById`、`occurredAt`、`idempotencyKey`。
- 订单收款、客户收款和供应商/报销等有资金账户的场景按既有流程提供 `accountId`。
- 订单类事实必须提供 `sourceType=ORDER_PAYMENT` 和对应 `OrderPayment.id`。
- `amountCents` 沿用既有金额校验；本 seam 不把负数金额转换为另一种现金事实。

### 8.2 幂等规则

1. 系统按 `storeId + idempotencyKey` 查询已有 `PaymentRecord`。
2. 未找到记录时创建一条 `PaymentRecord`，并返回 `created=true` 的最小业务结果。
3. 找到记录且以下业务字段全部相同：`type`、`direction`、`amountCents`、`accountId`、`sourceType`、`sourceId`、`createdById`、`occurredAt`，系统视为重放，返回原记录标识且不重复创建。
4. 找到记录但任一上述字段不同，返回错误码 `CASH_FACT_IDEMPOTENCY_CONFLICT`，不得覆盖原记录。
5. `note` 只作为说明文本，不改变同一现金事实的业务身份；`reversalOfId` 属于反向关系字段，若本期调用方提供，必须纳入冲突比较。
6. 数据库唯一约束是最终并发保护。若 create 因唯一约束竞争失败，writer 返回错误码 `CASH_FACT_CONCURRENT_WRITE`；当前业务事务必须回滚，调用 workflow 必须使用同一个业务幂等键重新执行整笔事务，不能在已失败事务中继续查询或补写。

### 8.3 事务规则

- `CashFactWriter` 只接受调用方已经打开的同一业务事务，不自行创建嵌套事务。
- 事务上下文必须同时提供 `paymentRecord.findFirst` 和 `paymentRecord.create`；缺少查询能力的 adapter 不符合 seam 契约，禁止退化为只写。
- 订单模块在同一事务中写入自己的 `OrderPayment`、订单金额和履约版本；Finance writer 只写现金事实。
- 任一写入失败，调用方事务整体回滚；不得通过补偿写入掩盖半成功。
- writer 返回 `recordId`、`created`、类型、来源和金额等最小业务结果，不返回完整 Prisma 行。

## 9. 状态与结果

本期不新增 `CashFact` 状态机。现金事实采用“未存在 → 已追加”的事实生命周期；已追加记录不可被本 seam 覆盖或静默删除。

| 结果 | 条件 | 系统动作 | 调用方处理 |
|---|---|---|---|
| `created=true` | 幂等键不存在且写入成功 | 创建一条 `PaymentRecord` | 继续完成所属业务事务 |
| `created=false` | 幂等键存在且输入一致 | 返回原记录标识，不新增 | 返回原业务结果或继续安全重放 |
| `CASH_FACT_IDEMPOTENCY_CONFLICT` | 幂等键存在但输入不一致 | 不修改原记录 | 向调用方返回冲突，不得重试相同错误输入 |
| 事务失败 | 任一业务事实写入失败 | 回滚同一事务内的全部事实 | 按既有错误码和重试策略处理 |

## 10. 权限、数据范围与接口边界

- 不新增 HTTP 接口；本 seam 是应用内部模块 interface。
- `CashFactWriter` 不暴露给 Web controller，不接受前端传入的任意 `sourceType`、`sourceId` 或门店范围而绕过业务 workflow。
- 调用方必须使用当前业务对象推导 `storeId`、来源和操作人；不能信任前端直接传入的跨门店来源。
- 订单收款和客户/财务 workflow 沿用现有角色、门店范围和 `AccessContext` 校验。
- Returns 的既有权限和数据范围不因迁移到 writer 而改变。

## 11. 异常与边界

| 场景 | 系统处理 | 可验收结果 |
|---|---|---|
| 现金事实幂等键重放且输入一致 | 返回原记录，不再 create | `created=false`，数据库仅一条记录 |
| 同键复用但金额、账户、来源或发生日期不同 | 抛出 `CASH_FACT_IDEMPOTENCY_CONFLICT` | 原记录字段不变 |
| 订单收款已存在但现金事实缺失 | 由同一业务事务/历史核验发现；本期不静默补写历史记录 | 不新增隐式修复路径 |
| 订单收款写成功、现金事实写失败 | 回滚事务 | `OrderPayment`、`PaymentRecord`、订单金额均不落库 |
| 现金事实写成功、订单金额更新失败 | 回滚事务 | 不留下孤立 `PaymentRecord` |
| 两个请求并发使用同一现金事实键 | 一个事务成功；竞争事务由 writer 返回 `CASH_FACT_CONCURRENT_WRITE` 并整体回滚，调用 workflow 使用同键重试整笔事务 | 不产生两条相同门店/幂等键记录，重试后返回同一业务结果 |
| `amountCents` 不合法 | 沿用调用方金额校验并拒绝 | 不创建现金事实 |
| Returns 退款现金事实 | 由 Returns 保留业务状态所有权并调用 Finance writer | 不直接创建 `PaymentRecord` |

## 12. 数据与字段

| 字段 | 含义 | 类型 | 必填 | 来源与规则 |
|---|---|---|---:|---|
| `storeId` | 现金事实所属门店 | String | 是 | 由业务对象/事务上下文推导 |
| `accountId` | 资金账户 | String? | 按既有场景 | 订单/客户收款等资金账户场景必须提供 |
| `type` | 现金事实类型 | 枚举 | 是 | 由 writer 专用方法固定，不由前端指定 |
| `direction` | 收入/支出方向 | 枚举 | 是 | 与 `type` 由 writer 固定映射 |
| `amountCents` | 金额，单位分 | Int | 是 | 沿用现有非负与订单金额校验 |
| `sourceType` | 来源对象类型 | String? | 订单类必填 | 订单收款固定为 `ORDER_PAYMENT` |
| `sourceId` | 来源对象标识 | String? | 订单类必填 | 订单收款使用 `OrderPayment.id` |
| `note` | 业务说明 | String? | 否 | 只读说明，不作为幂等身份 |
| `createdById` | 业务操作人 | String | 是 | 来自当前访问主体 |
| `occurredAt` | 事实发生日期 | DateTime | 是 | 订单收款使用 `paidAt`，不得用写入时间替代 |
| `idempotencyKey` | 稳定写入意图标识 | String | 是 | 与 `storeId` 组成唯一键 |
| `reversalOfId` | 被冲销事实 | String? | 仅反向事实 | 提供时参与幂等冲突比较 |

## 13. 页面、消息与埋点

### 13.1 页面与交互

本期无页面变更。现有订单收款、订单创建和财务 workflow 的成功、冲突、无权限和失败反馈保持原有入口与错误语义；如现有页面展示现金事实详情，继续读取已有查询 seam。

### 13.2 消息通知

本期不新增消息，不改变既有通知触发条件、接收对象、频率或去重规则。

### 13.3 埋点

本期不新增用户行为埋点。研发验证使用自动化测试、日志和数据库不变量扫描；若后续需要线上指标，另行确认指标名称、基线、目标值和采集来源。

## 14. 验收标准

### AC-01：普通订单收款写入两类事实

```text
Given：订单、收款账户和操作人均在同一门店范围内，收款金额不超过订单待收金额
When：用户提交普通订单收款
Then：同一事务新增一条 OrderPayment 和一条 type=ORDER_PAYMENT、direction=INCOME 的 PaymentRecord；PaymentRecord.sourceId 等于 OrderPayment.id，订单已收与待收被更新
```

### AC-02：初始定金与订单创建原子提交

```text
Given：创建订单请求包含金额大于 0 的合法初始定金
When：订单创建事务完成
Then：订单、OrderPayment、PaymentRecord 和订单金额事实一并提交；PaymentRecord.occurredAt 等于定金 paidAt
```

### AC-03：现金事实重放

```text
Given：同一 storeId 和 idempotencyKey 已存在且输入业务字段一致的 PaymentRecord
When：同一业务请求再次提交
Then：返回原 recordId，created=false，数据库不新增 PaymentRecord
```

### AC-04：现金事实输入冲突

```text
Given：同一 storeId 和 idempotencyKey 已绑定一条 PaymentRecord
When：请求使用不同金额、账户、来源、操作人、发生日期或反向关系再次写入
Then：返回 CASH_FACT_IDEMPOTENCY_CONFLICT，原记录不被修改
```

### AC-05：业务事务回滚

```text
Given：订单收款或订单金额更新的后续步骤失败
When：事务结束
Then：本次 OrderPayment、PaymentRecord、订单金额和履约版本变化全部回滚，不能留下孤立现金事实
```

### AC-06：Finance 兼容入口

```text
Given：客户收款、冲销、返利或报销 workflow 调用既有 FinanceService writer 方法
When：写入成功或幂等重放
Then：FinanceService 委托 CashFactWriter，调用方继续得到兼容的最小 id 结果，且业务幂等键保持不变
```

### AC-07：直接写入边界

```text
Given：检查 orders、finance 和 returns 生产源码
When：执行 direct-write contract test
Then：除 CashFactWriter 外不存在 paymentRecord.create，三类 Returns 现金事实也必须通过 writer
```

### AC-08：类型与全量回归

```text
Given：本期代码、测试和文档已合并到工作区
When：执行 API typecheck、API 全量测试和 git diff --check
Then：类型检查通过，API 测试无失败，空白检查无错误
```

### AC-09：并发唯一冲突与反向关系

```text
Given：两个事务同时使用同一 storeId 和 idempotencyKey 写入现金事实
When：两个事务竞争唯一约束
Then：数据库最多保留一条 PaymentRecord；竞争事务返回 CASH_FACT_CONCURRENT_WRITE 并回滚，使用相同业务幂等键重试整笔 workflow 后返回原业务结果

Given：已有现金冲销事实的 reversalOfId=A
When：同一幂等键以 reversalOfId=B 再次写入
Then：返回 CASH_FACT_IDEMPOTENCY_CONFLICT，原记录及其反向关系不变
```

## 15. 风险与依赖

| 风险/依赖 | 影响 | 控制措施 |
|---|---|---|
| 订单事实与现金事实事务不一致 | 产生孤立流水或订单金额错误 | 只允许传入同一已打开事务；补充回滚测试 |
| 幂等键输入冲突未被识别 | 重放覆盖或重复记账 | 比较业务字段并返回稳定错误码 |
| 并发唯一冲突 | 请求失败或重复业务处理 | 依赖数据库唯一约束；调用 workflow 整体回滚后重试 |
| 旧调用方仍直接写表 | seam 无法删除，可能双写 | direct-write contract test 与 ADR-0012 门禁 |
| Returns 边界被误解为已完成 | 上线验收过度承诺 | PRD 明确后续阶段和完成口径 |
| 测试 mock 缺少 writer 查询能力或返回值 | 回归误报或隐藏契约变化 | 所有 writer fake 提供 `findFirst` 与 `create`，并返回最小 `PaymentRecord` 结果 |

## 16. 待确认事项

| 编号 | 事项 | 影响 | 确认角色 | 状态 |
|---|---|---|---|---|
| 1 | 产品负责人和业务确认人 | 只影响文档责任归属，不改变实现边界 | 产品/业务 | 待指定，不阻塞本轮技术实施 |
| 2 | Returns 迁移后的线上现金事实指标 | 影响 Finance-only 边界的持续观测 | 产品/研发 | 后续优化，不阻塞本次落地 |
| 3 | 线上现金事实新增/冲突指标的目标值 | 影响运营监控，不影响首期写入逻辑 | 数据/产品 | 待确认，不阻塞首期 |

## 17. 变更记录

| 版本 | 日期 | 变更内容 | 原因 |
|---|---|---|---|
| V0.1 | 2026-08-22 | 根据 ADR-0014 和已确认架构方案形成评审草案 | 收拢订单现金事实写入边界 |
| V0.2 | 2026-08-22 | 补充强制事务查询契约、反向关系比较、并发竞争错误和整事务重试验收 | 关闭首轮评审 S1 问题 |
| V0.3 | 2026-08-22 | 增加 P4 Returns 销售退款、供应商退款和退款冲销的设计与验收 | 完成后续现金事实迁移 |
| V0.4 | 2026-08-22 | 完成 P4 Returns 现金事实迁移并补充全量验证证据 | 收口 Finance-only 生产写入边界 |

## 18. P4 Returns 追加设计

### 18.1 销售退款

- Returns 继续负责退货状态、退款金额、放弃金额、退款凭证和 `ReturnAction`。
- 当实际退款金额大于 0 时，在现有退款事务内调用 `CashFactWriter.recordCustomerReceiptReversal`。
- 固定类型/方向为 `CUSTOMER_RECEIPT_REVERSAL` / `EXPENSE`。
- `storeId` 使用执行门店；`sourceType` 为 `SALES_RETURN`；`sourceId` 使用本次 `ReturnAction.id`。
- 现金事实幂等键使用 `SALES_RETURN_REFUND:{returnId}:{requestIdempotencyKey}`。
- `occurredAt` 与本次退货退款事实的 `refundedAt` 使用同一个动作时间。

### 18.2 供应商退款结算

- Returns 继续创建并确认 `SupplierReturnSettlementAdjustment`，计算现金退款与应付抵扣合计，并更新采购退货状态。
- 当 `refundAmountCents > 0` 时，在同一事务内调用 `CashFactWriter.recordSupplierRefundPayout`。
- 固定类型/方向为 `SUPPLIER_REFUND_OUT` / `OUTFLOW`。
- `storeId`、`accountId` 使用执行门店及其默认启用财务账户；`sourceType` 为 `SUPPLIER_RETURN_SETTLEMENT`；`sourceId` 使用 `adjustment.id`。
- 现金事实幂等键使用 `SUPPLIER_RETURN_SETTLEMENT:{returnId}:{requestIdempotencyKey}`。
- writer 返回的 `recordId` 写入 `SupplierReturnSettlementAdjustment.paymentRecordId`。

### 18.3 供应商退款冲销

- Returns 继续校验调整单为已确认且尚未冲销，并更新调整单状态、采购退货汇总和审计。
- 当原调整单存在 `paymentRecordId` 时，在同一事务内调用 `CashFactWriter.recordSupplierRefundReversal`。
- 固定类型/方向为 `SUPPLIER_REFUND_REVERSAL` / `INFLOW`。
- `reversalOfId` 必须等于原供应商退款 `PaymentRecord.id`；`sourceId` 使用调整单 id。
- 现金事实幂等键使用 `SUPPLIER_RETURN_SETTLEMENT_REVERSAL:{adjustmentId}:{requestIdempotencyKey}`。
- writer 返回的 `recordId` 写入原退款记录的 `reversedById`，不得直接读取新建行的 Prisma 实现细节。

### 18.4 P4 事务与异常规则

1. `ReturnAction` 的既有幂等/状态门禁仍先于业务事务执行。
2. writer 竞争错误或任一后续更新失败时，退货状态、调整单、现金事实、原记录冲销关系和审计全部回滚；`ReturnAction` 按既有 `failAction` 记录失败。
3. 实际退款/供应商现金退款为 0 时不创建 `PaymentRecord`，但退货金额、抵扣和状态规则保持不变。
4. P4 不新增数据库字段或迁移，不改变既有退款金额口径、角色权限、HTTP 路径或页面交互。

### 18.5 P4 验收标准

```text
Given：销售退货处于 WAITING_REFUND 或 PARTIAL_REFUND，实际退款金额大于 0
When：用户完成退款
Then：同一事务通过 CashFactWriter 创建 CUSTOMER_RECEIPT_REVERSAL，退款状态、ReturnAction、财务调整和审计一起提交，生产代码不直接写 PaymentRecord

Given：采购退货处于 WAITING_SETTLEMENT 或 PARTIAL_SETTLEMENT，现金退款金额大于 0
When：财务确认供应商结算
Then：同一事务通过 CashFactWriter 创建 SUPPLIER_REFUND_OUT，并将返回 recordId 写入 adjustment.paymentRecordId

Given：已确认供应商退款调整单存在原 PaymentRecord 且未冲销
When：财务提交冲销
Then：同一事务通过 CashFactWriter 创建 SUPPLIER_REFUND_REVERSAL，reversalOfId 等于原记录 id，并更新原记录 reversedById

Given：P4 任一现金事实写入或后续状态更新失败
When：事务结束
Then：现金事实、退货状态、调整单、ReturnAction 和审计不产生部分提交

Given：扫描 Returns、Orders 和 Finance 生产源码
When：执行 direct-write contract test
Then：除 CashFactWriter 外不存在 paymentRecord.create
```
