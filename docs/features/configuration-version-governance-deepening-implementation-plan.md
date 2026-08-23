# ConfigurationVersionGovernance｜实施计划

## 1. 实施目标

把配置版本创建、更新、预览校验、发布、撤回、过期和提醒收拢到一个 interface；领域校验、访问能力、审计、缓存和通知作为内部 adapter。保持 controller 契约兼容，不保留第二条权威写入路径。

## 2. 实施顺序

1. **建立 contract test**：覆盖创建幂等、expectedVersion 冲突、发布重新校验、重叠拒绝、撤回原因、过期提醒去重、权限拒绝和审计结果。
2. **建立 module seam**：新增 `configuration-version-governance.ts` 或等价 module，controller、定时任务和读取方只依赖其 interface。
3. **收拢内部 adapter**：将 capability 校验、`SettingsAccessService`、审计、缓存、通知和 Prisma 写入置于 module 内部；发布事务内重新读取当前 payload 并校验。
4. **修正缓存语义**：数据库状态与审计同事务；提交后失效缓存，失败记录可观测事件并阻断旧缓存命中。
5. **迁移入口**：`config-versions.controller.ts` 和定时任务单向接入新 seam，保留 DTO、错误协议和响应结构。
6. **删除旧路径**：静态搜索配置写入调用方，确认只有新 seam 后删除旧实现暴露；执行全量测试。

## 3. 预计文件范围

- `apps/api/src/settings/config-versions.service.ts`
- `apps/api/src/settings/config-versions.controller.ts`
- `apps/api/src/settings/settings.module.ts`
- `apps/api/src/settings/dto/config-version.dto.ts`
- `apps/api/src/settings/*config*contract*.test.ts`（新增或迁移）
- `CONTEXT.md`、本 PRD 与评审记录

## 4. 关键实现约束

- 发布不得信任旧的独立校验结果；必须在发布事务内对当前 payload 重新校验。
- 版本冲突使用条件写入；失败不覆盖其他版本。
- 提醒去重键为版本、窗口、动作。
- 不新增配置继承或范围覆盖规则。

## 5. 验证与回滚

- 先运行 settings contract tests，再运行 API typecheck/build，最后运行 API 全量测试。
- 静态检查 `ConfigVersionsService` 外部引用和 Prisma 配置写入路径，确保旧路径归零。
- 失败时回滚到兼容 adapter；不得恢复第二条直接写入路径。
