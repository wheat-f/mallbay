# DictionaryGovernance｜实施计划

## 1. 实施目标

让运行时字典和总部模板成为两个内部 adapter，由一个来源无关的字典治理 interface 统一目录、条目、预览、导入、状态、删除、权限、审计和缓存规则。

## 2. 实施顺序

1. **建立 contract test**：覆盖目录统一结构、`kind` 兼容映射、模板只读、快照导入、code 匹配、版本冲突、门店删除原因和权限拒绝。
2. **定义治理结果事实**：统一返回来源、`readOnly`、`inherited`、可编辑能力和版本事实，保持现有响应兼容。
3. **收拢两个 adapter**：运行时字典 adapter 与总部模板 adapter 只在 module 内部处理来源差异；`kind` 不进入内部治理规则。
4. **收拢导入事务**：预览只读；提交使用稳定 `code` 匹配新增/更新，在同一事务内写条目、递增版本和审计。
5. **迁移 controller**：旧 controller 将 `kind=dictionary/template` 映射到新 interface；禁止 controller 直接调用两个底层写入实现。
6. **删除旧路径**：静态搜索确认没有直接写入 dictionaries/templates 的调用方后删除旧暴露；运行 settings 回归测试。

## 3. 预计文件范围

- `apps/api/src/settings/dictionary-governance.service.ts`
- `apps/api/src/settings/dictionary-governance.controller.ts`
- `apps/api/src/settings/dictionaries.service.ts`
- `apps/api/src/settings/dictionary-templates.service.ts`
- `apps/api/src/settings/settings.module.ts`
- `apps/api/src/settings/*dictionary*contract*.test.ts`

## 4. 关键实现约束

- 总部模板导入形成门店可编辑快照，不做持续继承。
- 总部模板条目不可删除；门店条目删除必须有原因并审计。
- 同批次重复 code、非法父级关系和版本冲突不得写入。
- 缓存失效在提交后处理，不能让旧缓存绕过版本结果。

## 5. 验证与回滚

- 先测试两个 adapter 的共同规则与来源特有规则，再迁移 controller。
- 静态搜索 `dictionaries.*create/update/delete`、`dictionaryTemplates.*create/update` 的外部写入引用。
- 失败时只回滚 `kind` 兼容映射，不恢复第二条权威写入路径。
