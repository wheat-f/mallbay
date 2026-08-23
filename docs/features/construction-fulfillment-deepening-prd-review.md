# ConstructionFulfillment 深化 PRD｜需求评审报告

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 评审对象 | `docs/features/construction-fulfillment-deepening-prd.md` |
| 文档版本 | v0.1 → v0.2 |
| 当前阶段 | PRD 评审与修订 |
| 评审范围 | 背景目标、范围、流程、ownership、状态、权限、数据契约、异常、验收和实施阶段门 |
| 评审依据 | 当前代码、CONTEXT.md、ADR-0006、ADR-0011、跨店施工履约子 PRD |
| 初轮结论 | 补充阻塞项后重审 |
| 修订后结论 | 可以进入研发（见第 15 节） |

## 2. 初轮结论摘要

### 问题统计

| 等级 | 数量 | 说明 |
|---|---:|---|
| S0 阻塞 | 1 | 普通施工命令的唯一执行 authority 未写死 |
| S1 高风险 | 3 | 返回契约、事务/观测边界、caller inventory 完成标准不足 |
| S2 一般问题 | 2 | 指标与角色表达需要更可验证 |
| S3 优化建议 | 1 | 内部文件拆分策略可留到技术设计 |

### 初轮结论

初版不能直接进入研发。核心方向已经明确，但执行路径如果不收紧，可能出现 `ConstructionFulfillment` 再包一层 `ConstructionService`，或新实现绕过 `OrderLifecycle.transition` 的风险。

## 3. 阻塞性问题（初轮）

### S0-01：普通施工命令的唯一执行 authority 不明确

- 所在位置：PRD 7.2、8.2。
- 问题描述：文档同时写“交给 `OrderLifecycle`/现有施工 implementation”，没有明确 `ConstructionFulfillment` 是调用 `OrderLifecycle.transition`，还是继续调用 `ConstructionService` 的公开命令方法。
- 影响：研发可能新增第二条状态转换路径；`commandId`、`expectedVersion`、`OrderLifecycleCommandRecord`、履约版本推进和构造事实事务边界可能被绕开，直接破坏订单履约 authority。
- 修改建议：明确普通施工命令和跨店命令都由 `ConstructionFulfillment` 归一化 actor/context 后调用 `OrderLifecycle.transition`；`ConstructionService` 不再作为这些命令的 external adapter。施工 persistence 通过现有 `OrderLifecycle` 注入的 construction implementation 完成。
- 待确认角色：研发 / 架构。
- 是否阻塞研发：是。

## 4. 高风险问题（初轮）

### S1-01：命令返回契约仍有模糊表达

- 所在位置：PRD 7.2、14.1、14.3。
- 问题描述：写成“返回权威履约结果或现有兼容返回”，没有明确成功、幂等重放、被拒绝和异常的响应类型。
- 影响：controller/Web/test 对同一命令形成不同判断，接口兼容无法验收。
- 修改建议：普通和跨店命令成功/幂等重放返回现有 `OrderLifecycle.transition` payload；前置条件被拒绝沿用现有 HTTP 异常/错误码；不得新增另一种包装响应。把该规则加入 Given/When/Then。
- 待确认角色：研发 / 测试。
- 是否阻塞研发：否，但必须在开发前修订。

### S1-02：事务、版本和观测边界不足

- 所在位置：PRD 7.2、8.2、15。
- 问题描述：文档要求“不产生部分状态变化”，但没有明确事务必须由 `OrderLifecycle.transition` 统一持有，也没有明确不得在 seam 中另开外层写事务；观测字段也未列入验收。
- 影响：施工事实、订单版本、命令记录和审计可能不一致；线上无法区分 applied/replayed/rejected。
- 修改建议：明确 Fulfillment 只负责授权、actor/context 归一化和调用；`OrderLifecycle.transition` 是命令事务、幂等记录、版本变化和观测的唯一 owner。新增测试要求验证 applied/replayed/rejected 三类结果和事务回滚。
- 待确认角色：研发 / 测试。
- 是否阻塞研发：否，但属于 P0 实施门。

### S1-03：caller inventory 的完成标准缺少可执行产物

- 所在位置：PRD 7.4、17。
- 问题描述：要求“清空 caller inventory”，但没有规定清单内容和静态检索范围。
- 影响：旧 service 可能被错误删除，或新 caller 继续绕过 seam，无法证明 deletion test。
- 修改建议：实施计划必须产出 route/consumer 清单，至少检索 controller、module exports、API tests、offline sync 和跨模块 imports；每个 caller 标记 fulfillment/non-fulfillment、迁移动作和保留原因。
- 待确认角色：研发 / 架构。
- 是否阻塞研发：否，但属于 G2 阶段门。

## 5. 一般问题与优化建议

| 编号 | 等级 | 问题 | 影响 | 修改建议 |
|---|---|---|---|---|
| S2-01 | S2 | 指标“履约解释重复实现”在当前基线中缺少精确统计方法 | 上线后难以客观判断收口程度 | 以 `ConstructionController` 及仓内 import 的静态检索结果作为基线和目标 |
| S2-02 | S2 | 角色表使用“施工人员/管理者”业务称谓，但代码主要使用 capability | 测试可能误以为要新增角色映射 | 明确不新增角色，验收按 `AccessContext` capability 和 assigned worker 规则执行 |
| S3-01 | S3 | 内部采用私有协作者还是独立文件未决定 | 不影响 external seam | 留给技术设计，不写成 PRD 约束 |

## 6. 修订动作

已将以下规则加入 PRD v0.2：

1. 普通施工命令与跨店命令统一调用 `OrderLifecycle.transition`，不允许 Fulfillment 直接写订单/施工状态，也不允许通过 `ConstructionService` 形成第二条命令路径。
2. `OrderLifecycle.transition` 唯一拥有命令事务、幂等记录、履约版本变化、命令观测和错误持久化；Fulfillment 不开启第二个写事务。
3. 命令成功与幂等重放返回现有 transition payload；被拒绝沿用既有异常/错误码，不新增包装层。
4. 增加 applied/replayed/rejected、事务回滚和观测结果的测试验收。
5. 将 caller inventory 明确为可提交产物，并列出静态检索范围和 G2 阶段门。
6. 将 capability、assigned worker、source/execution scope 写成测试判定依据，避免虚构新角色。

## 7. 修订后完整性检查

| 评审维度 | 结果 | 说明 |
|---|---|---|
| 背景与目标 | 已明确 | 明确 caller 泄漏、seam depth 和 ownership 目标 |
| 范围与非目标 | 已明确 | 普通/跨店纳入，成本/容量/排班/物料等排除 |
| 核心对象 | 已明确 | 订单履约结果、施工记录、跨店任务、施工证据、命令上下文 |
| 主流程与分支 | 已明确 | 读取、普通命令、跨店命令、迁移流程均有起止和失败处理 |
| 状态与 ownership | 已明确 | OrderLifecycle、CrossStoreTaskStatus、append-only 证据边界明确 |
| 权限与数据范围 | 已明确 | AccessContext capability、assigned worker、source/execution scope |
| API/DTO 契约 | 已明确 | route/header/DTO/返回 payload 兼容规则明确 |
| 异常与并发 | 已明确 | commandId、expectedVersion、taskVersion、lifecycleError、状态冲突 |
| 验收标准 | 已明确 | Given/When/Then 覆盖正常、异常、权限、兼容和 deletion test |
| 依赖与阶段门 | 已明确 | G1–G5 具备产物和通过条件 |

## 8. 最终结论

### 是否可以进入研发

可以进入研发。

### 进入研发前必须完成

- 以 PRD v0.2 为基准生成实施计划。
- G2 产出 caller inventory，确认普通/跨店履约 route 全部收口范围。
- 技术实现必须调用 `OrderLifecycle.transition`，不得新增第二条命令事务路径。
- contract test 和集成测试覆盖 applied/replayed/rejected、版本冲突、权限裁剪和事务回滚。

### 可以后续优化

- 内部协作者的文件拆分方式。
- 静态架构检查自动化。
- 更细的履约指标看板和运行时观测维度。

## 9. 变更记录

| 版本 | 日期 | 变更内容 | 变更原因 | 修改人 |
|---|---|---|---|---|
| v0.1 | 2026-08-23 | 初轮评审，发现 1 个 S0、3 个 S1 | 检查 PRD 是否可研发/可验收 | Codex |
| v0.2 | 2026-08-23 | 明确唯一命令 authority、事务边界、返回契约和 caller inventory | 关闭初轮阻塞与高风险问题 | Codex |
