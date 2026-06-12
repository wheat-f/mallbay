# Phase 6 微信小程序发布前检查清单

- 文档类型：发布检查清单
- 文档状态：初版
- 适用范围：微信小程序提交审核、体验版发布、正式版发布前检查
- 来源依据：[Phase 6 微信小程序联调与发布实施计划](./phase-6-mini-program-integration-plan.md)、[Phase 6 微信小程序真机验收脚本](./phase-6-mini-program-acceptance.md)

## 使用方式

每次提交体验版或正式版前，发布负责人 MUST 逐项确认本清单。任何 MUST 项不满足时，不允许发布。

## 账号与环境

MUST：

- 微信 AppID 属于当前项目或授权测试主体。
- API 环境变量 `WECHAT_MINI_APP_ID` 与当前小程序 AppID 一致。
- API 环境变量 `WECHAT_MINI_APP_SECRET` 只保存在部署环境或本地私有环境中。
- 测试账号、施工人员账号和门店测试数据不使用生产客户隐私数据。
- 发布包中不包含真实 token、AppSecret、OSS 密钥、内网穿透地址或个人局域网 IP。

MUST NOT：

- 不使用生产账号做破坏性压测。
- 不把微信开发者工具本机私有配置提交到 Git。

## 域名与 HTTPS

MUST：

- request 合法域名包含当前 API HTTPS 域名。
- uploadFile 合法域名包含 OSS 或上传代理 HTTPS 域名。
- API 域名证书有效，真机访问不会出现证书错误。
- 体验版和正式版使用的 API 地址明确区分，不混用生产和测试环境。

MUST NOT：

- 不为正式版启用 HTTP 明文 API。
- 不在正式版使用临时内网穿透域名。

## 登录与鉴权

MUST：

- 微信 code 登录成功后能获取 access token 和门店上下文。
- 微信登录配置缺失时返回“微信小程序登录未配置”，不返回内部服务器错误。
- JWT 过期时，小程序能提示重新登录或重新配置 token。
- API 继续校验施工任务归属，未派工人员不能同步他人任务、照片或状态。

MUST NOT：

- 不在小程序端硬编码管理员 token。
- 不通过前端隐藏按钮替代服务端权限校验。

## 隐私与权限提示

MUST：

- 照片拍摄前的授权提示符合微信平台要求。
- 隐私协议覆盖施工照片、客户车辆信息、账号身份和设备网络请求。
- 验收截图和日志脱敏，不能包含完整手机号、车牌、客户姓名、JWT 或 openId。

MUST NOT：

- 不在控制台输出 token、AppSecret、客户隐私或 OSS 密钥。

## 施工任务与离线队列

MUST：

- 任务列表能展示当前施工人员被派工任务。
- 任务详情能展示订单、客户、车辆、施工状态和照片进度。
- 断网开工记录包含本地 `startedAt`。
- 断网完工记录包含本地 `completedAt`。
- 断网照片记录包含本地 `takenAt`。
- 离线队列达到 100 条时阻止继续写入并显示中文提示。
- 同步失败在 3 次以内保留为待同步，第 3 次失败后标记失败。
- 单条同步失败不阻断后续合法记录同步。

MUST NOT：

- 不在小程序本地缓存中长期保留已同步成功的照片队列项。
- 不让小程序直接写业务数据库。

## OSS 与上传

MUST：

- 上传地址使用 HTTPS。
- 上传失败不会丢弃本地离线队列记录。
- 后端记录照片阶段、上传人、拍摄时间和关联施工记录。
- 本地开发 OSS 配置使用 `.local` 或环境变量，不提交仓库。

MUST NOT：

- 不把 OSS AccessKey 写入小程序代码。
- 不让小程序直接持有长期有效的 OSS 管理密钥。

## 发布前验证命令

发布前至少运行：

```bash
corepack pnpm --filter @mallbay/api test -- src/auth/auth.service.test.ts src/construction/offline-sync.test.ts
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/mini test
corepack pnpm --filter @mallbay/mini typecheck
git diff --check
```

## 手工验收

发布前 MUST 完成 [Phase 6 微信小程序真机验收脚本](./phase-6-mini-program-acceptance.md) 中的：

- A1 连接配置保存。
- A2 任务同步。
- A3 离线状态入队。
- A4 离线拍照入队。
- A5 离线请假入队。
- M1 微信 code 登录。
- M2 真机断网施工记录。
- M3 真机恢复网络同步。
- M4 权限边界。

## 回滚

MUST：

- 保留上一版体验版或正式版回滚路径。
- API 配置变更和小程序发布分开记录。
- 如果发布后出现登录或同步失败，先暂停新版本扩散，再恢复上一版小程序或回滚 API 配置。

RECOMMENDED：

- 体验版至少完成一次完整断网和恢复网络验收后，再提交正式版审核。
- 真机发现的缺陷应优先沉淀为 API 或 mini 自动化测试。
