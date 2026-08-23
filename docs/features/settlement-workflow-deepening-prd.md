# SettlementWorkflow 企业结算执行深化 PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | `SettlementWorkflow` 企业结算执行 seam 深化 |
| 文档版本 | V0.2（评审修订版） |
| 当前状态 | 二次评审 |
| 创建日期 | 2026-08-23 |
| 适用范围 | MallBay API 企业结算与 Web 企业结算页 |
| 关联 ADR | ADR-0007、ADR-0012 |
| 关联术语 | 企业结算、结算执行、现金事实、订单履约版本、访问主体 |

> 本需求聚焦结算写入边界和可验证的一致性规则，不改变企业结算的查询口径和 HTTP 路径。

## 2. 需求背景与问题

当前 `SettlementWorkflow` 只有六个一行转发方法，真正的对账单、收款、红冲、订单金额、订单履约版本、审计和 Finance 调用仍集中在约 900 行的 `CustomerSettlementsService` 中。结算命令 seam 因此只能验证“是否转发”，不能验证企业结算执行的不变量。

当前还存在以下风险：

- 对账单创建在事务外读取候选订单，无法在写入时可靠阻止同一订单同时进入多个非作废对账单。
- 确认、作废依赖事务外状态读取，事务内没有条件状态转换，并发操作可能最后写入覆盖。
- 收款和红冲的幂等重放只比较部分字段，重复 key 携带不同收款时间、付款人、分摊或红冲原因时可能被误判为重放。
- 收款、红冲的订单金额和生命周期版本虽然在事务内，但事务重新读取时缺少足够的余额条件保护，存在并发超收/超额红冲风险。
- Settlement 实现以 optional `FinanceService` 作为现金事实依赖，Finance 未配置时到运行期才失败，且结算 seam 依赖了比现金写入更宽的接口。
- Web 端对账单、收款和红冲请求没有完整生成并传递幂等键。

## 3. 产品目标

1. 使 `SettlementWorkflow` 成为企业结算写入的真实命令 seam，而不是转发 adapter。
2. 将对账单、收款、红冲及其订单事实编排收拢到 `SettlementExecutionImplementation`；将候选、对账单和收款查询收拢到 `SettlementQueryImplementation`。
3. 保持 Finance 对现金事实的所有权；结算只通过必需的窄 `CashFactWriter` seam 写入现金事实。
4. 建立对账单创建、确认/作废、收款、红冲的幂等、条件状态转换和并发保护规则。
5. 保留现有 HTTP 路径、响应结构、访问权限和结算查询语义，并以 contract test 证明旧 service 生产 adapter 可删除。

## 4. 非目标

- 不改变企业结算查询的日期口径：对账单以订单创建时间为主日期，收款以 `receivedAt` 为主日期。
- 不改变订单履约最终状态所有权；订单履约领域仍是最终状态 owner，结算只更新收款金额和生命周期版本账本。
- 不让 Finance 拥有对账单、收款、分摊或订单金额状态。
- 不新增收款草稿保存/发布流程；`CustomerReceiptStatus.DRAFT` 作为历史兼容枚举保留，本期执行语义仅覆盖 `POSTED` 和 `REVERSED`。
- 不新增 confirm/void 的独立命令幂等键；重复确认/作废按状态冲突处理。
- 不改变 HTTP 路径、主要响应字段和现有角色权限。
- 不引入跨服务事件、异步补偿、双写或历史数据自动修复。

## 5. 用户角色与职责

| 角色/模块 | 可执行内容 | 数据范围 | 本期职责边界 |
|---|---|---|---|
| 财务/店长 | 创建、确认、作废对账单；预览、登记企业收款；提交收款红冲 | 现有访问主体允许的门店和企业客户 | 通过既有 controller 调用 `SettlementWorkflow` |
| 客服/业务人员 | 按既有权限读取对账单、候选订单和收款 | 现有访问主体允许范围 | 不新增结算写权限 |
| `SettlementWorkflow` | 对账单和收款写入命令 | 由调用方授权后的门店/客户 | 只暴露命令 seam |
| `SettlementView` | 候选、对账单、收款读取 | 由调用方授权后的门店/客户 | 只暴露查询 seam |
| `SettlementExecutionImplementation` | 结算事务、订单金额、生命周期版本、审计编排 | 内部模块 | 不直接对外导出 |
| `CashFactWriter` | 创建或重放客户收款/红冲现金事实 | 内部事务上下文 | 不负责授权和结算状态 |

## 6. 核心业务对象与状态

| 对象 | 定义 | 关键字段 | 所有权 |
|---|---|---|---|
| 企业对账单 | 某企业客户在结算期间内选定订单的应收快照 | `storeId`、`customerId`、期间、金额、`status`、`idempotencyKey` | Settlement |
| 对账单明细 | 对账单与订单的结算快照关系 | `statementId`、`orderId`、订单金额、已收、待收 | Settlement |
| 企业收款 | 一次企业统一收款及其付款信息 | `idempotencyKey`、账户、金额、`receivedAt`、状态 | Settlement |
| 收款分摊 | 企业收款对订单的逐单金额分配 | `customerReceiptId`、`orderId`、金额 | Settlement/订单收款事实 |
| 收款红冲 | 对原企业收款的全部或部分反向事实 | `idempotencyKey`、原收款、金额、原因 | Settlement |
| 现金事实 | 由收款/红冲产生的财务现金记录 | 来源、方向、金额、发生时间、幂等键 | Finance |

### 6.1 对账单状态

```text
DRAFT → CONFIRMED → VOIDED
  └──────────────→ VOIDED
```

- `DRAFT`：已创建但未确认，可作废，不可重复创建相同业务事实。
- `CONFIRMED`：已确认结算内容，不可再次确认；可作废。
- `VOIDED`：终态，不可确认或再次作废。
- 同一订单不得同时存在于多个 `DRAFT` 或 `CONFIRMED` 对账单；旧对账单必须先作废再重新生成。

### 6.2 收款状态

```text
POSTED → REVERSED
```

- 首次创建企业收款时直接形成 `POSTED` 语义，并同步写订单收款和现金事实。
- 部分红冲后仍为 `POSTED`；累计红冲金额等于原收款金额时变为 `REVERSED`。
- `DRAFT` 仅为历史兼容状态，本期没有创建或发布草稿的命令；历史 DRAFT 只读展示，不作为本期确认、收款或红冲的新增目标。

## 7. 业务流程

### 7.1 创建对账单

1. 访问主体提交门店、企业客户、结算期间、订单 ID 列表和必填 `idempotencyKey`。
2. `SettlementWorkflow` 在同一事务内校验访问范围、客户类型、期间、订单归属、订单纳入状态和订单金额快照。
3. 事务以 `Serializable` 隔离级别检查订单是否已被其他非作废对账单占用，并对候选订单排序后创建对账单和明细。
4. 首次提交返回新对账单；相同 key 且完整 payload 相同则返回原对账单；相同 key 但 payload 不同返回幂等冲突。

### 7.2 确认/作废对账单

1. `SettlementWorkflow` 在事务内按当前状态执行条件更新。
2. 只有 `DRAFT` 可确认；`DRAFT` 或 `CONFIRMED` 可作废，作废原因非空时写入原因。
3. 条件更新成功后，同一事务写入审计；更新计数不是 1 时返回稳定状态冲突，不能写审计。

### 7.3 企业收款

1. 访问主体提交账户、金额、收款时间、付款信息、幂等键和可选逐单分摊。
2. 结算实现校验客户、账户、订单范围和分摊总额；未提供分摊时沿用当前自动分摊顺序：`completedAt` 较早优先、空值靠后，再按 `createdAt`、`orderNo`、`orderId` 排序。
3. 在一个事务内重新读取订单金额，并对每笔订单执行 `outstandingCents >= allocation` 的条件更新；任一笔失败整体回滚并返回可重试冲突。
4. 同事务创建收款、订单收款明细、生命周期版本变更、CashFactWriter 现金事实和审计。

### 7.4 收款红冲

1. 访问主体提交原收款、红冲金额、原因、幂等键和可选逐单红冲分摊。
2. 事务内重新读取原收款可红冲余额，按 `remaining >= allocation` 条件更新订单收款金额。
3. 同事务创建红冲及其分摊、减少订单已收金额、增加待收金额、写生命周期版本、调用 CashFactWriter 和写审计。
4. 部分红冲保留 `POSTED`，全部红冲后变为 `REVERSED`。

## 8. 功能需求与业务规则

### 8.1 Seam 与依赖

- `SettlementWorkflow` 只依赖 `SettlementExecutionImplementation`。
- `SettlementView` 只依赖 `SettlementQueryImplementation`。
- 旧 `CustomerSettlementsService` 不再作为生产 provider，也不作为第三个 adapter 保留。
- `SettlementExecutionImplementation` 必须注入 `CashFactWriter`；删除 optional Finance fallback，Finance 未 wiring 时应用启动即失败而不是请求运行期失败。
- CashFactWriter 接收当前 Prisma transaction context，禁止在结算事务外另开连接或补写现金事实。
- 必须复用现有 `CashFactWriter.recordCustomerReceipt`、`CashFactWriter.recordCustomerReceiptReversal` 和 `CashFactTransaction` 类型，不新增同义 writer 或第三条现金事实写入路径。
- `FinanceService` 保留既有兼容入口，但新的 Settlement seam 不依赖其宽接口。

### 8.2 对账单幂等与占用

- `idempotencyKey` 为新建对账单请求必填，空白值拒绝。
- 唯一身份为 `storeId + idempotencyKey`；数据库字段允许 nullable 以兼容历史数据，新命令不允许缺失。
- 同 key 重放必须比较：`customerId`、`periodStart`、`periodEnd`、规范化升序后的 `orderIds`。
- 完全一致返回原对账单，不新增对账单或明细；任一字段不同返回 `SETTLEMENT_IDEMPOTENCY_CONFLICT`，原数据不变。
- 同一订单若已存在于其他 `DRAFT/CONFIRMED` 对账单，返回 `ORDER_ALREADY_SETTLED`；作废旧对账单后才可重新生成。
- 创建事务使用 `Serializable`；仅遇到 PostgreSQL serialization failure 时重新开启完整事务，最多重试 3 次，超过次数返回 `SETTLEMENT_CONCURRENCY_CONFLICT`。订单已被其他非作废对账单占用属于业务冲突，不重试。

### 8.3 对账单状态

- 确认仅接受 `DRAFT`；更新必须包含 `where: { id, status: DRAFT }` 语义。
- 作废仅接受 `DRAFT/CONFIRMED`；更新必须包含当前允许状态条件。
- 状态条件更新计数不是 1 时返回 `SETTLEMENT_STATE_CONFLICT`，不创建审计。
- 确认/作废不新增幂等键；客户端重复点击依靠状态冲突而不是重复写入。

### 8.4 收款幂等

- `idempotencyKey` 必填，唯一身份为 `storeId + idempotencyKey`。
- 同 key 重放必须比较客户、金额、账户、`receivedAt`、付款人、银行流水号、备注及规范化分摊列表。
- 完全一致返回原收款及其既有结果；不同返回 `RECEIPT_IDEMPOTENCY_CONFLICT`，不得更新原收款。
- 数据库唯一键竞争时当前事务回滚；调用方可按同一业务 key 重试整笔 workflow，不能在失败事务上继续执行。

### 8.5 红冲幂等与余额

- `idempotencyKey` 必填，唯一身份为 `receiptId + idempotencyKey`。
- 同 key 重放必须比较红冲金额、原因和规范化分摊列表；一致返回原结果，不一致返回 `REVERSAL_IDEMPOTENCY_CONFLICT`。
- 写入 Finance 时使用包含原收款 ID 的派生现金事实幂等键，避免两个不同收款复用同一红冲 key 造成跨收款冲突。
- 红冲总额不得超过原收款未红冲余额；订单逐笔红冲不得超过该订单可红冲金额。
- 条件更新失败返回 `SETTLEMENT_CONCURRENCY_CONFLICT`，整个红冲事务回滚。

### 8.6 分摊

- 手工分摊每个订单最多出现一次，金额必须为正整数，合计必须等于收款/红冲金额。
- 自动分摊固定按 `completedAt ASC NULLS LAST, createdAt ASC, orderNo ASC, orderId ASC`。
- 分摊规则由 Settlement 拥有；CashFactWriter 只写现金事实，不接受或计算订单分摊。

## 9. API 与 Web 契约

### 9.1 保持不变

- `POST /customer-statements`
- `POST /customer-statements/:id/confirm`
- `POST /customer-statements/:id/void`
- `POST /customer-receipts/preview-allocation`
- `POST /customer-receipts`
- `POST /customer-receipts/:id/reverse`
- 现有查询路径、响应结构和语义对象保持兼容。

### 9.2 新增/补齐字段

| 请求 | 字段 | 规则 |
|---|---|---|
| 创建对账单 | `idempotencyKey` | body 必填，长度不超过 160，前端一次提交生命周期内复用 |
| 创建收款 | `idempotencyKey` | 已由 API DTO 要求；Web 类型和页面补齐 |
| 收款红冲 | `idempotencyKey` | 已由 API DTO 要求；Web 类型和页面补齐 |

Web 端在一次表单打开/提交生命周期内生成并保存 UUID；网络重试复用同一 key，成功、取消或明确业务失败后清理，不在每次 render 或每次点击时重新生成。收款和红冲同样遵循此规则。

### 9.3 错误结果

| 错误码 | 触发条件 | 客户端处理 |
|---|---|---|
| `SETTLEMENT_IDEMPOTENCY_CONFLICT` | 对账单同 key 不同 payload | 提示请求已被占用，刷新原记录 |
| `ORDER_ALREADY_SETTLED` | 订单已在非作废对账单中 | 提示先查看或作废原对账单 |
| `SETTLEMENT_STATE_CONFLICT` | 确认/作废时状态已被改变 | 刷新列表，不自动重复写 |
| `RECEIPT_IDEMPOTENCY_CONFLICT` | 收款同 key 不同 payload | 提示幂等键冲突，不修改原收款 |
| `REVERSAL_IDEMPOTENCY_CONFLICT` | 红冲同 key 不同 payload | 提示幂等键冲突，不修改原红冲 |
| `SETTLEMENT_CONCURRENCY_CONFLICT` | 序列化、余额或唯一键并发冲突 | 提示刷新后重试整笔命令 |

## 10. 页面与交互

- 企业结算页继续使用现有候选订单、对账单、收款和红冲入口。
- 创建对账单按钮在无选中订单、提交中或期间无效时不可用；成功提示“对账单草稿已生成”。
- 创建收款必须先完成分摊预览，分摊合计等于收款金额后可提交；成功提示保持现有文案。
- 红冲提交必须填写原因、金额不超过可红冲金额；冲突时保留表单内容并提示刷新/重试。
- 页面不展示内部实现名称，不新增独立 Finance 操作入口。

## 11. 数据变更

| 变更 | 规则 |
|---|---|
| `CustomerStatement.idempotencyKey` | nullable 历史兼容字段；新增唯一约束 `[storeId, idempotencyKey]`；不回填历史值，数据库允许多个 NULL |
| statement create DTO | 新增必填 `idempotencyKey` |
| Web payload | 对账单、收款、红冲 payload 补齐 `idempotencyKey` |
| 生产 provider | 删除 `CustomerSettlementsService` provider，新增两个内部实现 provider |

不回填历史对账单幂等键，不改变历史状态或现金事实。

## 12. 验收标准

```text
Given：新建对账单请求携带合法 key，订单均满足纳入条件且未被非作废对账单占用
When：提交创建
Then：事务创建一张 DRAFT 对账单及明细；相同请求重试返回原对账单，不新增记录
```

```text
Given：同 storeId + key 已存在对账单
When：使用不同客户、期间或规范化后的订单列表重试
Then：返回 SETTLEMENT_IDEMPOTENCY_CONFLICT，原对账单和明细不变
```

```text
Given：两个并发事务尝试把同一订单放入不同非作废对账单
When：两个事务同时创建
Then：最多一笔成功；另一笔因序列化/占用冲突回滚，不留下部分明细或审计
```

```text
Given：对账单为 DRAFT
When：两个请求并发确认或一个确认与一个作废并发
Then：最多一个状态转换成功；失败请求返回 SETTLEMENT_STATE_CONFLICT，失败请求不写审计
```

```text
Given：同一收款 key 已成功提交
When：以相同完整 payload 重试
Then：返回原收款结果，不新增订单收款、现金事实或生命周期版本
```

```text
Given：同一收款 key 已成功提交
When：仅改变 receivedAt、付款人、备注、账户或分摊列表后重试
Then：返回 RECEIPT_IDEMPOTENCY_CONFLICT，原收款及现金事实不变
```

```text
Given：并发收款会使某订单待收金额不足
When：同时提交收款
Then：最多一笔成功，失败事务回滚订单金额、OrderPayment、现金事实、生命周期版本和审计
```

```text
Given：同一红冲 key 已成功提交
When：以不同金额、原因或分摊列表重试
Then：返回 REVERSAL_IDEMPOTENCY_CONFLICT，原红冲及订单金额不变
```

```text
Given：扫描 Settlement 生产代码
When：执行 direct-write contract test
Then：不存在 CustomerSettlementsService 生产 provider；Settlement 不直接写 PaymentRecord；现金事实调用只经过必需 CashFactWriter
```

```text
Given：代码和迁移完成
When：执行 API/Web typecheck、API/Web 全量测试和 git diff --check
Then：无类型错误、无失败测试、无空白错误；真实 PostgreSQL 并发用例若环境不可用只能标记 skipped，不得伪装为通过
```

## 13. 指标与观测

本期不设业务增长目标。上线验证关注：

- 对账单/收款/红冲幂等冲突数与成功重放数。
- `SETTLEMENT_CONCURRENCY_CONFLICT` 次数及重试成功率。
- 现金事实与结算收款的孤立记录数，目标为 0。
- direct-write contract test 和全量回归通过率。

指标具体目标值由产品/数据角色后续补充，不阻塞技术实施。

## 14. 实施阶段门

| 阶段 | 内容 | 通过条件 |
|---|---|---|
| P0 | schema、DTO、Web 幂等键契约 | migration 可应用；Web/API 类型检查通过 |
| P1 | 拆分两个内部实现并改 module/controller 依赖 | 生产代码不再由旧 service provider 承载；公开 seam contract test 通过 |
| P2 | 事务、幂等、状态 CAS、Serializable 重试、CashFactWriter 必需依赖 | 关键 Given/When/Then 测试和真实 PostgreSQL 并发测试通过或明确环境跳过 |
| P3 | 删除旧 service、补齐 direct-write gate、全量回归 | API/Web typecheck、全量测试、diff check 通过 |

## 15. 待确认事项

| 事项 | 默认方案 | 是否阻塞 |
|---|---|---|
| 线上指标目标值 | 上线后补充，先观测成功/冲突/孤立事实 | 否 |
| 历史对账单幂等键 | 不回填，只有新命令强制要求 | 否 |
| `CustomerReceiptStatus.DRAFT` | 保留枚举，不新增草稿执行命令 | 否 |
| 真实 PostgreSQL 并发环境 | 可用则执行，不可用明确 skipped | 否；但不得把 skipped 当作并发证明 |

## 16. 实施结果

- 已拆分 `SettlementExecutionImplementation` 与 `SettlementQueryImplementation`；`SettlementWorkflow` 只承载写命令，`SettlementView` 承载查询与分摊预览。
- 已删除旧 `CustomerSettlementsService` 生产文件、测试文件和 module provider；未保留第三个生产 adapter。
- 已接入 `CustomerStatement.idempotencyKey`、对账单占用检查、Serializable 三次重试、状态条件更新、收款/红冲完整 payload 幂等与订单余额条件更新。
- 已将结算现金事实改为必需的现有 `CashFactWriter` 依赖；Finance 仍拥有现金事实，结算不直接写 `PaymentRecord`。
- 已补齐 Web 对账单、收款和红冲幂等键的类型与提交生命周期。
- API typecheck 通过；API 全量测试 `449 passed / 11 skipped / 0 failed`；Web typecheck 通过；Web 全量测试 `621 passed / 0 failed`；定向结算与 deep-module contract `19 passed`；Prisma schema validate 和 `git diff --check` 通过。
