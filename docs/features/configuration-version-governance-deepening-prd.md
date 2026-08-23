# ConfigurationVersionGovernance（配置版本治理）深化 PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 目标 | 将配置版本生命周期收拢为一个有 depth 的 module 和稳定 interface |
| 适用范围 | HQ、STORE、FINANCE、OWN 配置版本及其 capability 校验 |
| 目标角色 | 总部管理员、配置维护人、配置审核/发布人、系统定时任务 |
| 设计依据 | `apps/api/src/settings/config-versions.service.ts`、`config-versions.controller.ts`、ADR-0012 |
| 本期原则 | 保持外部契约兼容；单写新 seam；不新增配置继承规则 |

## 2. 背景与目标

当前配置版本实现同时承担草稿创建、乐观并发、领域校验、发布、撤回、过期、提醒、审计和缓存。配置能力横跨安全、容量、门店运营、权限、财务结算和客户标签，若继续由调用方理解这些规则，变化会穿透多个 seam。

本期目标是让 `ConfigurationVersionGovernance` 成为配置生命周期的唯一 interface：调用方只表达配置生命周期意图；领域校验、持久化、审计、缓存和通知由 module 内部 implementation 及 adapter 完成。

非目标：不重新定义配置 payload；不新增总部/门店继承；不改变现有 capability 授权矩阵；不建设配置物化缓存或新的发布审批制度。

## 3. 核心对象与状态

配置版本由 domain、capabilityCode、scopeId、version、payload、effectiveAt、expiresAt、status、validationErrors、requestId、创建/更新人组成。

状态集合保持现状：`DRAFT`、`VALIDATING`、`VALIDATION_FAILED`、`PUBLISHED`、`EXPIRED`、`WITHDRAWN`。

状态规则：

1. 创建产生 `DRAFT`；同一 capability 与 scope 的版本号递增。
2. 更新必须满足 `expectedVersion`（如调用方提供），成功后回到 `DRAFT` 并清除旧校验结果。
3. 校验成功进入可发布状态；失败进入 `VALIDATION_FAILED` 并保存字段级错误。
4. 独立校验接口只用于预览和记录结果；发布时必须在同一业务事务内针对当前 payload 重新执行校验，并完成版本匹配、状态变更和审计，不能复用旧校验结果。
5. 撤回必须提供原因并形成审计；过期由定时任务处理，不能静默删除历史。
6. 重复 `requestId` 不重复创建或重复产生生命周期事实。

## 4. 业务流程

### 正常流程

配置维护人创建/更新草稿 → module 解析访问能力 → 内部领域校验 adapter 执行校验 → 校验通过后发布 → 写入审计并清理受影响缓存 → 读取方只读取有效版本。

### 定时流程

系统扫描已过期发布版本和长期未处理草稿 → 变更状态或生成提醒 → 写入审计/通知 → 仅在产生变化时清理列表缓存。

## 5. 权限与数据范围

- 访问能力和总部/门店范围继续由 `SettingsAccessService` adapter 解析。
- module 不根据页面岗位字段自行推断权限。
- 创建、更新、校验、发布、撤回分别校验对应 capability action。
- 不允许通过传入其他 `scopeId` 绕过访问范围。

## 6. 异常与边界

| 场景 | 结果 |
|---|---|
| 配置不存在 | 返回明确 not-found 错误，不产生审计 |
| `expectedVersion` 冲突 | 返回并发冲突，不覆盖新版本 |
| 生效时间晚于结束时间 | 校验失败，保留字段错误 |
| capability 专属规则失败 | 进入 `VALIDATION_FAILED`，不允许发布 |
| 已发布版本重叠 | 拒绝发布，不改变已有有效版本 |
| 重复发布请求 | 以版本状态/`requestId` 幂等处理 |
| 审计 adapter 失败 | 配置事务回滚；不产生未审计的生命周期事实 |
| 缓存失效失败 | 已提交配置事实不回滚；记录可观测错误并禁止旧缓存继续命中，按提交后重试路径处理 |
| 通知失败 | 配置状态不回滚，通知进入可重试路径 |

## 7. interface 与 seam 约束

- 外部 interface 只暴露配置生命周期意图和稳定结果，不暴露 Prisma 类型、缓存 Map 或领域校验 switch。
- 安全、容量、运营、权限、结算、客户标签校验作为内部策略 adapter。
- `SettingsAccessService`、审计、缓存和通知是内部 adapter；调用方不直接访问它们完成配置写入。
- controller、定时任务和配置读取方均通过同一 seam 进入。
- 提醒去重键为“配置版本 + 提醒窗口 + 提醒动作”；同一窗口重复运行不得重复通知。

## 8. 验收标准

- Given 两个并发更新使用同一版本号，When 后提交者写入，Then 后提交者收到版本冲突且前一结果不被覆盖。
- Given 配置校验失败，When 调用发布，Then 发布被拒绝、状态不变、没有发布审计。
- Given 校验通过且版本未变化，When 调用发布，Then 状态、审计和缓存失效在同一业务事务内完成。
- Given 同一 `requestId` 重复创建，When 重复提交，Then 只产生一个配置版本。
- Given 访问主体无目标 scope 的 capability，When 读取或写入配置，Then 被拒绝且不泄露配置内容。
- Given 草稿满足提醒条件，When 定时任务重复运行，Then 每个提醒窗口只生成一次提醒审计。
- contract test 只通过 module interface 验证状态、并发、权限、审计、缓存和 adapter 失败。

## 9. 迁移与删除顺序

1. 先锁定配置生命周期 contract test，覆盖独立校验与发布重新校验的差异。
2. controller 和定时任务单向切换到新 seam，保留输入输出兼容 adapter。
3. 静态搜索确认没有其他配置写入路径后，删除旧的直接写入路径。
4. 迁移失败时只回滚到兼容 adapter，不恢复第二条权威写入路径。

## 10. 依赖与风险

- 依赖现有配置 DTO、访问能力矩阵、审计模型和通知模型。
- 迁移过程中不得保留旧写入路径形成 dual-write。
- 风险：不同 capability 的校验规则可能继续膨胀；通过内部策略 adapter 和 contract test 控制 locality。

## 11. 待确认与默认决策

已确认采用推荐方案：配置发布原子化；保留现有 7 天/1 天提醒和过期语义；不新增继承规则；保持外部契约兼容。
