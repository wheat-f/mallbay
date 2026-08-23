# 四个深化方向｜实施评审

## 1. 实施结论

四个方向已按通过版 PRD 完成第一阶段落地，四个 controller 已通过稳定 token interface 访问对应 module；未创建第二条权威业务写入路径。

## 2. 已落地内容

| Module | 落地结果 |
|---|---|
| `ConfigurationVersionGovernance` | 新增配置版本治理 token；controller/module 穿越 seam；发布事务内重新校验当前 payload；审计与缓存失效顺序修正 |
| `DictionaryGovernance` | 新增字典治理 token；controller/module 穿越 seam；保留运行时字典与总部模板两个内部 adapter |
| `MemberInvitationWorkflow` | 新增成员邀请 token；邀请取消旧待处理记录与新建邀请事务化；接受使用条件状态更新；通知增加幂等去重键 |
| `OperationalReport` | 新增运营报表读取 token；controller 不再重复做门店访问前置判断，范围解析集中在报表 module |

## 3. 测试与验证

- 定向 contract test：13/13 通过。
- API typecheck：通过。
- API build：通过。
- API 全量测试：477 个测试，466 通过，0 失败，11 个 PostgreSQL 条件测试跳过。
- `git diff --check`：通过；仅有仓库既有的换行格式警告。

## 4. 架构验收

- 四个 module 都有明确 interface 和 token seam。
- controller 不直接依赖四个兼容 implementation。
- `ConfigurationVersionGovernance` 的发布重新校验位于同一数据库事务内。
- `MemberInvitationWorkflow` 的并发接受通过条件状态更新避免重复接受，通知通过 dedupe key 避免重复投递。
- `OperationalReport` 的访问范围仍由 module 内部解析，保留现有日期、成本和完整性口径。
- `DictionaryGovernance` 保留两个真实 adapter，符合“two adapters = real”；来源差异未泄露为新的调用方写入路径。

## 5. 后续技术确认（不阻塞本阶段）

1. 如果未来需要“业务事实提交与通知投递意图同事务”，可在现有 notification 记录之上增加专用投递状态/补偿模型。
2. 如果报表数据量继续增长，再单独评估物化读取 adapter；本阶段不改变 ADR-0001。
3. 配置 capability 校验策略可继续拆成内部 adapter，但不得扩大外部 interface。
