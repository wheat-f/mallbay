# SettlementWorkflow 企业结算执行深化｜需求评审报告

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 评审对象 | `settlement-workflow-deepening-prd.md` V0.2 |
| 当前阶段 | 二次评审 |
| 评审范围 | 目标、范围、流程、对象、状态、权限、字段、事务、幂等、异常和验收 |
| 评审结论 | 可以进入研发 |

## 2. 结论摘要

PRD V0.2 已关闭首轮发现的两个 S1：明确复用现有 `CashFactWriter`/`CashFactTransaction`，并明确 Serializable 只对 PostgreSQL serialization failure 做最多 3 次完整事务重试。历史 nullable 幂等字段、Web key 生命周期和历史 DRAFT 兼容规则也已补齐。文档现在可以拆分为实施任务并进入研发。

| 等级 | 数量 | 结论 |
|---|---:|---|
| S0 阻塞 | 0 | 主流程和范围明确 |
| S1 高风险 | 0 | R1/R2 已关闭 |
| S2 一般问题 | 0 | R3/R4/R5 已补齐 |
| S3 优化建议 | 1 | 指标目标值后续补充 |

## 3. 首轮 S1 问题与修订结果

### R1：CashFactWriter 的实际调用契约未在 PRD 中落到返回与事务类型

- 所在位置：第 8.1 节、第 12 节。
- 问题：文档要求 Settlement 直接依赖 `CashFactWriter`，但没有规定结算实现使用的最小 writer 方法、返回值和 transaction context；现有 `CashFactWriter` 已存在，若实现另造一套窄 adapter，可能形成第三条现金写入路径。
- 影响：研发可能重复定义 Finance seam，违反单写和 ADR-0012；测试无法判断是否真的经过现有 writer。
- 修改建议：明确沿用现有 `CashFactWriter.recordCustomerReceipt`/`recordCustomerReceiptReversal` 和 `CashFactTransaction`，Settlement 仅注入该 provider，不新增同义 writer。
- 负责人：研发。
- 修订结果：已关闭。PRD 明确沿用现有 `CashFactWriter.recordCustomerReceipt`、`recordCustomerReceiptReversal` 和 `CashFactTransaction`，不新增同义 writer。
- 是否阻塞：否。

### R2：对账单重复占用规则与 PostgreSQL 保护方式需要落到可执行的重试边界

- 所在位置：第 7.1、8.2、12 节。
- 问题：文档说使用 Serializable 和有限重试，但没有定义重试次数、哪些错误可重试，以及“相同幂等 key”与“不同 key 同订单”冲突的优先级。
- 影响：不同实现可能重试业务冲突、在失败事务上继续执行，或把订单占用冲突误报为幂等冲突。
- 修改建议：约定最多 3 次，仅重试 PostgreSQL serialization failure；相同 key 先做完整 payload 比较；不同 key 的非作废订单占用直接返回 `ORDER_ALREADY_SETTLED`；任何失败事务都必须重新开启事务。
- 负责人：研发/测试。
- 修订结果：已关闭。PRD 明确只对 PostgreSQL serialization failure 重开完整事务，最多 3 次；订单已占用属于业务冲突，不重试。相同 key 先做完整 payload 比较，不同 key 的占用返回 `ORDER_ALREADY_SETTLED`。
- 是否阻塞：否。

## 4. S2 问题与优化建议

| 编号 | 问题 | 影响 | 修改建议 |
|---|---|---|---|
| R3 | 对账单 idempotencyKey 的 schema 迁移未说明历史 nullable 行与唯一约束兼容性 | 迁移可能误以为需要回填历史数据 | 明确字段 nullable、历史值不回填，数据库唯一约束允许多个 NULL，新命令由 DTO 强制非空 |
| R4 | 收款/红冲 Web key 的生成生命周期未绑定表单提交 | 可能每次点击生成新 key，无法实现网络重试重放 | 明确在一次打开/提交事务的 ref 中生成并在成功或取消后清理 |
| R5 | `DRAFT` 收款枚举保留但查询和写入允许性未明确 | 页面可能显示不可执行草稿或误开放红冲 | 明确本期只新增 POSTED；DRAFT 只读兼容，不可被本期 confirm/reverse 命令写入 |
| R6 | 指标未设置基线 | 无法判断线上收益 | 标记为非阻塞待补，不虚构目标值 |

## 5. 流程与状态评审

- 流程起点：访问主体从企业客户结算页选择订单或登记收款。
- 流程终点：对账单成为 `DRAFT/CONFIRMED/VOIDED`，或收款成为 `POSTED/REVERSED`，相关订单金额、现金事实和审计同事务提交。
- 状态闭环：对账单闭环；收款部分红冲保持 `POSTED`、全部红冲进入 `REVERSED`。
- 已覆盖异常：重复提交、完整 payload 冲突、订单重复占用、状态竞争、超额收款、超额红冲和现金写入失败回滚。
- 需修订：明确 `DRAFT` 收款不能成为本期新写入目标，明确状态查询不应把历史 DRAFT 当作可红冲对象。

## 6. 权限与数据评审

- `SettlementWorkflow` 不新增授权，继续由 controller/既有 access context 负责门店和客户范围。
- `CashFactWriter` 不自行授权，避免 Finance seam 越权。
- 文档未改变财务、客服和业务人员的既有权限，范围可执行。

## 7. 数据与字段评审

| 字段 | 评审结论 |
|---|---|
| `CustomerStatement.idempotencyKey` | nullable 历史兼容、store scoped unique，新写入 body 必填，需补迁移说明 |
| 收款/红冲 `idempotencyKey` | API 已必填，Web 缺失，需补齐类型、生成和测试 |
| 订单金额 | 收款使用 `outstandingCents >= allocation` 条件更新；红冲使用可红冲余额条件更新 |
| `receivedAt` | 作为收款事实日期参与完整幂等比较，查询语义保持 `RECEIVED_AT` |

## 8. 异常与边界评审

| 场景 | 当前覆盖 | 修订要求 |
|---|---|---|
| 同 key 同 payload | 是 | 确保比较规范化后的订单/分摊列表 |
| 同 key 异 payload | 是 | 错误码与 HTTP 映射需沿用现有异常风格 |
| 不同 key 同订单并发 | 部分 | 明确 Serializable 仅重试 serialization failure，业务占用直接失败 |
| 收款并发超收 | 是 | 条件 update 失败必须整体回滚 |
| 历史 DRAFT 收款 | 部分 | 只读兼容，不开放本期状态命令 |
| Finance 未 wiring | 是 | 由模块依赖启动期暴露，不保留 optional fallback |

## 9. 验收标准评审

### 已可直接验收

- 对账单同 key 重放和 payload 冲突。
- 非作废订单重复占用。
- 确认/作废条件状态转换。
- 收款/红冲完整 payload 幂等冲突。
- 收款并发超收回滚。
- 旧 service provider/direct-write 删除门。

### 需修订后验收

| 原描述 | 问题 | V0.2 改写 |
|---|---|---|
| “遇到可识别的 serialization failure 时最多有限次数重试” | 重试条件和次数不可测 | “最多 3 次，仅对 PostgreSQL serialization failure 重开事务；业务占用冲突不重试” |
| “CashFactWriter 接收当前 transaction context” | 未指定既有方法 | “必须调用现有 writer 的两个客户收款方法，不得新增同义 writer” |

## 10. 修改任务清单

| 编号 | 修改任务 | 优先级 | 是否阻塞 |
|---|---|---|---|
| 1 | 补齐现有 CashFactWriter 方法和事务类型契约 | P0 | 是 |
| 2 | 定义 Serializable 重试 3 次及错误分类 | P0 | 是 |
| 3 | 补充 nullable 历史迁移和重复占用优先级 | P1 | 否 |
| 4 | 补充 Web key 生命周期与 DRAFT 兼容规则 | P1 | 否 |
| 5 | 补充错误码到 HTTP/页面反馈的验证 | P1 | 否 |

## 11. 二次评审结论

### 是否可以进入研发

可以进入研发。

### 进入研发前必须完成

- P0 先完成 `CustomerStatement.idempotencyKey` 迁移、DTO 和 Web 请求契约。
- P2 必须按文档实现 3 次 Serializable 重试、状态 CAS、完整 payload 冲突和条件余额更新。
- P3 必须通过旧 service provider 删除、CashFactWriter direct-write contract、API/Web typecheck 与全量回归。

## 12. 评审通过条件核验

| 核验项 | 结果 |
|---|---|
| 背景、目标、范围与非目标明确 | 通过 |
| Settlement/Finance/Order 所有权边界明确 | 通过 |
| 对账单、收款、红冲状态闭环 | 通过 |
| 幂等 key、完整 payload 比较和冲突结果可测试 | 通过 |
| 不同 key 订单占用和 Serializable 重试边界明确 | 通过 |
| CashFactWriter 复用现有窄 seam，无并行 writer | 通过 |
| Web/API 字段和历史兼容规则明确 | 通过 |
| Given / When / Then 覆盖主流程、并发、回滚和删除门 | 通过 |
| 可拆分为实施计划 | 通过 |

结论：PRD V0.2 通过，可进入实施计划与研发落地。

## 13. 实施复核

| 核验项 | 结果 |
|---|---|
| `SettlementWorkflow` 真实写入 seam、`SettlementView` 独立查询 seam | 通过 |
| 旧 `CustomerSettlementsService` 生产 provider/文件删除 | 通过 |
| `CustomerStatement` 幂等 schema 与 DTO/Web 契约 | 通过 |
| 对账单订单占用、Serializable 三次重试、状态 CAS | 通过 |
| 收款/红冲完整 payload 冲突和条件余额更新 | 通过 |
| Settlement 现金写入仅经过现有 `CashFactWriter` | 通过 |
| API 全量回归 | 449 通过 / 11 skipped / 0 失败 |
| Web 全量回归 | 621 通过 / 0 失败 |
| Prisma validate、API/Web typecheck、diff check | 通过 |

最终结论：实施阶段门通过，可以提交并推送 GitHub。
