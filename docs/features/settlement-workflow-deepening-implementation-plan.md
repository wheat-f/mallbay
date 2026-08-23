# SettlementWorkflow 企业结算执行深化｜实施计划

## 1. 实施目标

将企业结算写入从浅 `SettlementWorkflow -> CustomerSettlementsService` 转为真实命令 seam，并将读查询与写执行拆为两个内部实现；不改变既有 HTTP 路径、权限和查询语义。

## 2. 阶段拆分

| 阶段 | 任务 | 产出 | 阶段门 |
|---|---|---|---|
| P0 | `CustomerStatement.idempotencyKey` nullable schema、唯一约束、DTO；Web 对账单/收款/红冲 key 类型与生命周期 | migration、API/Web 契约、payload 测试 | Prisma 生成/迁移可用；API/Web typecheck |
| P1 | 抽出 `SettlementExecutionImplementation` 和 `SettlementQueryImplementation`；Workflow/View 改依赖；module wiring | 两个内部实现、公开 seam contract | controller 只依赖公开 seam；旧 service provider 不再注册 |
| P2 | 写入事务深化：对账单 Serializable + 3 次 serialization retry；状态 CAS；收款/红冲完整 payload 幂等；余额条件更新；CashFactWriter 必需窄依赖 | 命令规则、稳定冲突错误、事务/并发测试 | 定向测试、真实 PostgreSQL 并发测试（环境不可用时明确 skipped） |
| P3 | 删除旧 service 生产路径；direct-write contract；回归和文档证据 | 删除门、全量验证 | API/Web typecheck、全量测试、diff check 通过 |

## 3. 详细任务

### P0：契约与 schema

- 在 `CustomerStatement` 增加 nullable `idempotencyKey`，创建 `[storeId, idempotencyKey]` unique。
- 新建对账单 DTO 增加非空、最大 160 字符校验。
- Web `CreateStatementPayload`、`CreateReceiptPayload`、红冲 payload 增加 `idempotencyKey`。
- 在页面的表单/提交生命周期中生成并复用 UUID，成功、取消或明确失败后清理。
- 增加相同 key 重试和不同 payload 冲突的 API/实现测试夹具。

### P1：模块边界

- 将旧 service 的读方法移动到 `SettlementQueryImplementation`。
- 将旧 service 的写方法和相关私有 helper 移动到 `SettlementExecutionImplementation`。
- `SettlementWorkflow` 只依赖 execution implementation；`SettlementView` 只依赖 query implementation。
- 将旧 `CustomerSettlementsService` 从 module provider 删除；不保留第三个生产 adapter。
- 生产调用只保留 controller → public seam → internal implementation。

### P2：一致性与并发

- 对账单 create 采用 Serializable transaction；仅 serialization failure 重开完整事务，最多 3 次。
- 相同 key 先比较 customer、期间和规范化 order IDs；不同 key 的非作废订单占用返回 `ORDER_ALREADY_SETTLED`。
- confirm/void 使用条件状态更新，更新数不是 1 返回 `SETTLEMENT_STATE_CONFLICT`，审计随后且同事务。
- 收款/红冲完整比较 payload；条件更新订单余额，失败整体回滚。
- execution implementation 直接注入既有 `CashFactWriter`，删除 optional `FinanceService` fallback。

### P3：删除门与验证

- 生产源码不再出现 `CustomerSettlementsService` provider 或 controller 直接注入。
- Settlement 现金事实写入只经过 `CashFactWriter`；无 direct `paymentRecord.create`。
- 公开 Workflow/View contract test、内部事务测试、Web mutation payload 测试齐备。
- API typecheck、Web typecheck、API 全量测试、Web 全量测试、`git diff --check` 通过。
- 真实 PostgreSQL 并发用例若环境不可用，记录 skipped 原因，不作为并发证明。

## 4. 风险控制

| 风险 | 控制 |
|---|---|
| 大 service 拆分引入行为变化 | 先复制/迁移方法，再以 contract 和现有回归固定行为；不同时做无关重构 |
| Prisma transaction 类型不兼容 | 复用现有 `CashFactTransaction` 和 Prisma transaction 类型，定向 typecheck |
| Serializable 失败后复用已失败事务 | retry 只包裹完整 `$transaction` 调用，每次重新创建事务 |
| Web 重试生成新 key | key 存在 mutation/form 生命周期，不在 render 或 retry 回调中重新生成 |
| 历史数据迁移风险 | statement key nullable，不回填历史数据，唯一约束保留 NULL 兼容 |

## 5. 完成定义

- PRD V0.2、评审报告和本实施计划均已提交。
- 生产结构满足 replace-don’t-layer：旧 service adapter 删除，只有两个内部实现和两个公开 seam。
- 对账单/收款/红冲关键规则有可执行 Given/When/Then 测试。
- 所有阶段门通过后才提交并推送 GitHub。

## 6. 实施状态

| 阶段 | 状态 | 证据 |
|---|---|---|
| P0 | 完成 | Prisma schema validate、migration、API/Web typecheck |
| P1 | 完成 | 两个内部实现、public seam contract、旧 service provider 删除 |
| P2 | 完成 | 幂等冲突、订单占用、条件余额、状态 CAS、CashFactWriter 定向测试 |
| P3 | 完成 | API `449 passed / 11 skipped`、Web `621 passed`、diff check |
