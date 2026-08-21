# AccessContext 访问主体与访问范围统一｜需求评审报告

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 评审对象 | `docs/features/access-context-deepening-prd.md` |
| 文档版本 | v1.1 |
| 当前阶段 | 评审修订完成 |
| 评审范围 | 目标、范围、流程、权限、访问范围 facts、迁移、字段、异常、测试、依赖和验收 |
| 评审结论 | 通过；2 项 S0 已关闭，可进入研发 |
| 评审日期 | 2026-08-21 |

## 2. 结论摘要

### 总体结论

PRD v1.1 已经具备研发拆分、测试设计和架构决策依据，核心 ownership、访问范围语义、迁移顺序、删除门和 endpoint 响应契约与已确认设计一致。

本次修订已将两个会直接改变研发工作量和验收结果的事项落到可执行清单：

1. [scope mapping 与 endpoint 契约清单](./access-context-scope-mapping-inventory.md) 覆盖当前 controller route，并固定资源字段、owner、source/execution store 和契约编号。
2. `LIST-SCOPE-01`、`EXPORT-SCOPE-01`、`DETAIL-SCOPE-01`、`WRITE-SCOPE-01`、`CROSS-STORE-01`、`SELF-SCOPE-01` 和 `GLOBAL-SCOPE-01` 已固定无门店、范围解析失败、显式越权和批量原子性行为。

因此，研发可以进入实现；S1 项作为实现前置任务和阶段门维护，不再阻塞本需求启动。

### 问题统计

| 等级 | 数量 | 说明 |
|---|---:|---|
| S0 阻塞 | 0 | 原 2 项已关闭 |
| S1 高风险 | 3 | 直接实现可能产生越权或返工 |
| S2 一般问题 | 3 | 不阻塞，但应在任务拆分时补齐 |
| S3 优化建议 | 1 | 可后续优化 |

### S0 关闭证据

| S0 | 证据 | 结论 |
|---|---|---|
| 资源 scope mapping | inventory 按资源域列出 capability、规范门店来源、owner 来源、列表过滤、详情校验、写入校验和跨店规则；controller route 以可审计 route group 逐项覆盖 | 已关闭 |
| endpoint 响应契约 | inventory 固定 contract ID、HTTP code、error code、空列表/空汇总/空导出行为、解析顺序和批量原子性 | 已关闭 |

研发任务不得绕过 inventory 直接按旧 caller 行为实现；route group 合并必须满足清单中的合并条件。

## 3. 阻塞性问题

### 问题 1：资源范围解析清单未形成可研发输入

- 严重程度：S0
- 所在位置：PRD 第 9.2、12、14、17 节
- 问题描述：PRD 要求业务 module 保留资源关系解释，并要求列表、详情、写入和导出使用一致范围，但没有列出每类资源的实际 `storeId`、`ownerId` 来源和过滤方式。当前代码中订单、客户、施工、财务、跨店施工的归属字段并不相同。
- 影响：研发无法确定每个 caller 应传什么 context；测试无法判断列表过滤和详情校验是否等价；最严重时可能只做 capability 鉴权而遗漏横向数据范围。
- 修改建议：在研发拆分前新增一张资源契约表，至少覆盖 orders、customers、construction、inventory、finance、reports、stores、settings、pricing、after-sales：资源归属字段、owner 字段、列表过滤、详情校验、写入校验、跨店关系和无法解析时的结果。
- 待确认角色：研发、测试、业务负责人
- 是否阻塞研发：否（v1.1 已关闭）
- 关闭证据：已新增 [scope mapping 与 endpoint 契约清单](./access-context-scope-mapping-inventory.md)，覆盖 orders、customers、construction、inventory、finance、reports、stores、settings 及现有 controller route group，并要求每行记录门店/owner/列表/详情/写入/跨店契约。

### 问题 2：无门店查询和范围解析失败的 endpoint 结果未明确

- 严重程度：S0
- 所在位置：PRD 第 8.2、第 13、第 14.1 节
- 原问题描述：PRD 曾同时允许“返回空结果或统一拒绝”，但两者会影响接口契约、页面空状态、审计和测试；`storeIds=[]`、`global=false`、`allowed=false` 的组合也没有按 endpoint 明确。
- 影响：不同 module 可能产生一部分返回 200 空列表、一部分返回 403，调用者无法稳定处理；错误配置或范围解析缺失可能被误认为“没有数据”。
- 修改建议：为每个无门店列表 endpoint 明确：`global=true` 时是否全量查询、门店集合为空时返回 200 空列表还是 403、资源归属无法解析时详情/写入是否统一 403；建议列表查询“已知无可见门店”返回 200 空结果，“权限上下文无效或资源范围无法解析”返回稳定 403。
- 待确认角色：产品、研发、测试
- 是否阻塞研发：否（v1.1 已关闭）
- 关闭证据：`LIST-SCOPE-01` 规定已知无可见门店返回 `200` 空结果；`EXPORT-SCOPE-01` 规定返回 `200` 空文件；显式越权门店返回 `403 STORE_OUT_OF_SCOPE`；范围无法解析返回 `403 SCOPE_UNRESOLVED`；详情/写入不产生副作用。

## 4. 高风险问题

### 问题 3：AccessScopeFacts 的多角色并集序列化仍不够明确

- 严重程度：S1
- 所在位置：PRD 第 7.2、11、12 节
- 问题描述：示例字段可以表达全局或门店集合，但没有明确一个用户同时拥有 `STORE(s1)` 与 `OWN(s2)`、多个门店绑定、或同一 capability 多个授权范围时，`global/storeIds/ownerId` 如何合并。
- 影响：不同 implementation 可能覆盖、丢弃或错误合并范围，造成漏权或越权。
- 修改建议：补充并集规则：global 只可由 HQ binding + GLOBAL grant 产生；非 global 的 `storeIds` 取有效绑定与授权范围交集；owner 范围按每个资源请求重新判断，不把一个 ownerId 作为全局可访问 owner；必要时将结果拆为“可见门店集合”和“当前请求 owner 判断”两个结果。
- 待确认角色：研发、测试
- 是否阻塞研发：否，建议在 contract types 落地前完成

### 问题 4：治理入口迁移范围大于当前“核心 caller”清单

- 严重程度：S1
- 所在位置：PRD 第 9.2、17 节
- 问题描述：PRD 纳入 `stores/users/settings/auth`，但现有代码仍有 `stores` use-case、users service、settings service、pricing、returns 等直接读取旧字段或 role code 的路径，文档没有逐文件迁移清单。
- 影响：可能误判“核心 caller 已迁移”，提前删除 bridge，或出现新旧路径同时放行。
- 修改建议：以生产代码扫描结果建立基线清单，按文件记录迁移状态、capability 映射、scope 映射和删除测试；任何未登记 caller 不得进入 Deletion ready。
- 待确认角色：研发负责人、测试负责人
- 是否阻塞研发：否，阻塞 Deletion 阶段

### 问题 5：跨进程权限新鲜度只写了部署假设，缺少升级触发条件

- 严重程度：S1
- 所在位置：PRD 第 8.4、第 13、第 16 节
- 问题描述：本期不做分布式失效是合理范围，但 PRD 没有规定 API 扩容前必须完成什么一致性验收，也没有明确 `policyVersion/bindingVersion` 在多进程场景下的失效检测方式。
- 影响：未来扩容时可能直接复用单进程缓存假设，导致权限变更在部分实例上延迟生效。
- 修改建议：增加部署门：当 API container 数量大于 1、启用滚动发布或引入多副本时，必须先完成分布式失效设计和多实例权限矩阵验收；当前不阻塞单 API 实现。
- 待确认角色：研发、运维、安全
- 是否阻塞研发：否

## 5. 一般问题与优化建议

| 编号 | 等级 | 问题 | 影响 | 修改建议 |
|---|---|---|---|---|
| R6 | S2 | `reason` 对 `can`、`scope`、`require` 的返回/异常形式未完全统一 | contract tests 可能出现多种错误读取方式 | 在 interface contract 中规定 `can` 的兼容布尔结果、`require` 的错误结构和 `scope` 的拒绝结果 |
| R7 | S2 | capability/action 目录由 module 拥有，但缺少目录登记、废弃和版本变更规则 | 可能出现未登记 code 或前后端目录漂移 | 增加 capability 目录注册、停用和扫描规则；新 code 必须有 contract test |
| R8 | S2 | 指标目标目前多为“待补充” | 上线后无法判断迁移是否达到质量门 | 在研发阶段补充扫描基线、测试基线和权限拒绝误判采样方案 |
| R9 | S3 | PRD 的“状态流转”描述的是迁移阶段，不是用户可见业务状态 | 产品读者可能误解为权限对象生命周期 | 将章节标题改为“迁移阶段门”，或增加说明“AccessContext 不持有业务状态” |

## 6. 业务流程评审

- 流程起点：HTTP adapter 或内部 module 提供 `{ userId }` 和资源访问上下文。
- 流程终点：业务 module 获得允许结果并执行资源逻辑，或获得拒绝结果并停止访问。
- 关键判断节点：用户有效性、绑定范围、策略和角色状态、capability/action、目标门店、owner 责任范围。
- 已覆盖分支：总部全局、门店范围、本人范围、复合角色、无门店列表、跨店资源、缓存失效、旧 `isAuditor` 无 HQ binding。
- 缺失分支：无；无门店、显式越权、范围解析失败和跨店失败均已在 inventory 固定。
- 流程闭环判断：主流程和 endpoint 失败分支均已闭环；迁移阶段门继续依赖资源契约清单和 deletion scan。

## 7. 状态流转评审

AccessContext 不持有业务状态；PRD 的 `Contract → Governance → Business callers → Deletion ready → Completed` 是迁移阶段门，逻辑闭环。

需要补充：

- 每个阶段的责任人。
- 阶段进入条件与退出证据。
- 失败后的回退动作。
- Deletion ready 禁止新增 legacy caller 的自动检查。

## 8. 权限与数据范围评审

| 访问主体 | 预期范围 | 当前评审结果 |
|---|---|---|
| `HQ_ADMIN/HQ + GLOBAL` | 全部门店 | 已明确 |
| `STORE(s1) + STORE` | 门店 s1 | 已明确 |
| `STORE(s1) + OWN` | s1 内本人责任数据 | 已明确 |
| 复合角色用户 | 各 capability/action 独立判断 | 已明确原则，需补并集样例 |
| 旧 `isAuditor=true` 无 HQ binding | 无总部权限 | 已明确 |
| 跨店资源 | source/execution 分别核验 | 已明确原则，需补资源契约 |

权限设计方向与 ADR-0013 一致，未发现直接冲突；主要风险在资源归属和列表过滤的落地细节。

## 9. 数据与字段评审

### 已明确

- `userId` 是唯一访问主体身份输入。
- `storeId` 和 `ownerId` 是请求上下文，不是页面权限字段。
- `global/storeIds/ownerId` 是 caller 消费的访问范围 facts。
- `policyVersion/bindingVersion/generatedAt` 用于一致性和诊断。

### 研发阶段继续落实

- `storeIds` 空集合与 global 的序列化约束。
- 多角色并集结果的稳定排序和去重规则。
- reason code 的枚举归属与版本兼容方式。
- capability/action 目录登记和最终 TypeScript 命名。
- 资源清单中每个 route group 的代码位置与测试证据。

## 10. 异常与边界评审

| 场景 | 当前覆盖 | 评审意见 |
|---|---|---|
| 无门店列表 | 已覆盖 | `LIST-SCOPE-01` 固定为 200 空结果；显式越权为 403 |
| 资源范围无法解析 | 已覆盖 | `SCOPE_UNRESOLVED`，详情/写入不产生副作用 |
| 重复权限变更 | 已覆盖缓存失效 | 需沿用现有 mutation 事务与版本语义 |
| 多角色、多门店 | 原则覆盖 | 需补 union contract tests |
| 跨店资源 | 原则覆盖 | 需补 source/execution 资源契约 |
| 多 API 进程 | 明确非本期 | 增加扩容前置门 |
| 历史字段存在 | 已覆盖 | 需确保不再作为新放行来源 |

## 11. 验收标准评审

### 已可直接验收

- HQ 全局、门店范围、本人范围和旧 `isAuditor` 无 HQ binding 的基础矩阵。
- 绑定变化后无需重新登录使用新结果。
- 无法解析范围默认拒绝。
- 业务 module 使用 fake AccessContext，不依赖 Prisma 权限查询。
- legacy caller 删除扫描和 contract tests。

### 已改为可直接验收

| 原描述 | v1.1 验收契约 |
|---|---|
| “无可见门店” | Given endpoint 为 X 且访问主体无可见门店；When 请求 X；Then 列表/汇总为 200 空结果，导出为 200 空文件 |
| “各 module 使用一致的访问范围规则” | Given 资源类型为 X；When 列表/详情/写入分别请求；Then 使用 inventory 中同一 store/owner 解析契约 |
| “范围无法解析” | Given 资源缺少规范范围字段；When 请求详情或写入；Then 403 `SCOPE_UNRESOLVED` 且无副作用 |
| “显式门店越权” | Given 请求指定不在 facts 中的 `storeId`；When 请求列表或写入；Then 403 `STORE_OUT_OF_SCOPE`，不得返回空结果 |
| “多角色权限取并集” | Given 角色 A/B 组合；When 解析范围；Then 返回去重、稳定、可验证的 typed facts；具体并集 contract test 为 P1 |

## 12. 风险与依赖

- 研发依赖：需要各 module 的资源归属字段和查询过滤实现者确认。
- 测试依赖：需要权限矩阵账号、复合角色账号、跨门店样本和旧 `isAuditor` 样本。
- 部署依赖：当前单 API container 假设必须保持；扩容前补分布式失效方案。
- 兼容风险：旧接口可能仍携带 `isAuditor/storeMember`；adapter 必须只取 userId，且不能出现新旧同时放行。
- 数据风险：无法解析资源范围时若回退全量，会造成横向越权；PRD 已规定默认拒绝，但 endpoint 结果仍需明确。
- 测试风险：只测 `can=true/false` 不足以验证列表范围；必须覆盖 facts 到资源过滤的 module contract tests。

## 13. 待确认事项

| 编号 | 待确认问题 | 影响范围 | 建议确认角色 | 优先级 |
|---|---|---|---|---|
| 1 | `AccessScopeFacts` 最终字段名、并集和排序 | public interface、contract tests | 研发 | P1 |
| 2 | capability/action 的目录登记与停用规则 | 迁移完整性 | 产品/研发 | P1 |
| 3 | 多 API container 扩容前置门 | 部署一致性 | 研发/运维 | P1 |

## 14. 修改任务清单

| 编号 | 修改任务 | 负责人角色 | 优先级 | 是否阻塞 |
|---|---|---|---|---|
| T1 | 依据 inventory 建立 endpoint 研发任务、字段映射和测试证据 | 研发/测试/业务 | P0 | 否（S0 已关闭） |
| T2 | 固定 AccessScopeFacts union、排序、去重和 reason contract | 研发 | P1 | 否 |
| T3 | 建立 capability/action 注册和缺失映射扫描 | 研发 | P1 | 否 |
| T4 | 增加 Deletion ready 与多 API 扩容前置门 | 研发/运维 | P1 | 否 |
| T5 | 补充多角色、多门店、跨店和无范围的 Given/When/Then 用例 | 测试 | P1 | 否 |

## 15. 最终结论

### 是否可以进入研发

通过，可进入研发。

### 进入研发前必须完成的非阻塞前置任务

- 将 inventory route group 拆解为研发任务并补充具体代码位置。
- 在 contract types 落地前完成多角色、多门店并集和 reason code 测试。

### 可以后续优化

- 多 API container 的分布式权限失效。
- 更细的 reason code 对外可观测性。
- capability 目录的自动生成和可视化。

## 16. 复评记录

| 版本 | 日期 | 结论 |
|---|---|---|
| v1.0 | 2026-08-21 | 初次评审：识别 2 项 S0、3 项 S1、3 项 S2 和 1 项 S3 |
| v1.1 | 2026-08-21 | 复评：资源 scope mapping 与 endpoint 响应契约已补齐，2 项 S0 关闭，结论通过 |
