# Phase 6 微信小程序联调与发布实施计划

- 文档类型：功能实施计划
- 文档状态：初版
- 适用范围：微信小程序真机联调、微信登录、接口域名、上传配置、发布验收
- 来源依据：[Phase 6 微信小程序与离线实施计划](./phase-6-mini-offline-plan.md)、[Phase 6 微信小程序与离线功能说明](./phase-6-mini-offline.md)、[V1.7 全功能需求差距与验收计划](./v1-7-requirements-gap-plan.md)

## 目标

Phase 6 已完成本地离线任务、拍照、请假、同步和微信 code 登录初版。下一阶段目标是把这些本地能力推进到微信开发者工具和真机可验收状态。

MUST：

- 明确小程序联调需要的微信平台、后端环境和本地配置边界。
- 保持现有 Web 施工主流程不变，小程序只作为师傅端任务执行入口。
- 保持离线队列、三次重试、100 条缓存上限和逐条同步语义不变。
- 任何真机环境配置 MUST 走本地 `.local`、开发者工具配置或环境变量，不写入 Git。

MUST NOT：

- 不把个人 AppID、token、测试账号、OSS 密钥、内网穿透地址提交到仓库。
- 不在小程序端绕过 API 权限校验。
- 不为了真机联调降低 HTTPS、鉴权或门店权限边界。

## 当前状态

已完成：

- `apps/mini/pages/tasks` 可拉取并缓存施工任务。
- `apps/mini/pages/task-detail` 可查看任务详情，离线记录开工、完工和照片。
- `apps/mini/pages/offline` 可手动同步离线队列。
- `apps/mini/pages/leave` 可离线提交请假。
- `apps/mini/pages/settings` 可维护 API 地址、token、门店 ID，并可发起微信 code 登录。
- `POST /construction/offline-sync` 可逐条处理照片、状态和请假操作。
- `POST /auth/wechat-login` 已有初版接口和配置模块。

本计划已完成：

- 微信开发者工具项目配置与真机调试说明。
- 微信登录配置自检：配置缺失时返回“微信小程序登录未配置”，配置完整时继续执行 code 换 openId。
- 合法域名、HTTPS、OSS 上传地址和本地开发代理策略。
- 真机断网、弱网、重新联网的手工验收脚本。
- 小程序发布前检查清单。

待外部执行：

- 微信登录端到端联调：`wx.login` code -> API -> JWT -> 门店上下文。
- 微信公众平台合法域名、uploadFile 域名和真机 HTTPS 验收。
- 使用真实测试 AppID 和测试账号完成真机断网、恢复网络和发布前检查。

## 实施顺序

### Task 1：小程序环境配置规范

状态：已完成

目标：让本地和真机配置不进入 Git，并且开发人员能稳定复现联调环境。

文件：

- 新增：`apps/mini/README.local.md`
- 修改：`apps/mini/README.md`
- 修改：`docs/features/phase-6-mini-offline.md`

步骤：

- [x] 在 `apps/mini/README.local.md` 说明本地开发者工具导入路径、AppID 填写方式、合法域名配置、API 地址配置和 token 调试方式。
- [x] 在 `apps/mini/README.md` 只保留通用说明，并链接本地配置文档；不得写入任何真实 AppID、域名或密钥。
- [x] 在 `phase-6-mini-offline.md` 增加“联调配置不入库”约束。
- [x] 验证：`git diff --check`。

验收：

- 仓库中没有真实 AppID、token、OSS 密钥、内网穿透地址。
- 开发者可按文档在微信开发者工具打开 `apps/mini`。

### Task 2：微信登录配置自检

状态：已完成

目标：启动 API 时能明确提示微信登录配置状态，避免真机联调时只看到 500。

文件：

- 修改：`apps/api/src/auth/wechat-mini-program.service.ts`
- 修改：`apps/api/src/auth/auth.service.test.ts`

步骤：

- [x] 编写失败测试：未配置 `WECHAT_MINI_APP_ID` 或 `WECHAT_MINI_APP_SECRET` 时，微信登录返回统一业务错误，而不是内部错误。
- [x] 实现配置检查，错误码使用现有统一错误结构，消息为“微信小程序登录未配置”。
- [x] 编写成功路径测试：配置存在时继续调用 code 换 session 的逻辑。
- [x] 验证：

```bash
corepack pnpm --filter @mallbay/api test -- src/auth/auth.service.test.ts
corepack pnpm --filter @mallbay/api typecheck
```

验收：

- 配置缺失不会返回 `INTERNAL_SERVER_ERROR`。
- 错误消息能指导开发者补齐本地环境变量。

### Task 3：真机同步手工验收脚本

状态：已完成

目标：把离线任务、照片、请假和自动同步的真机验收固化为可复跑脚本。

文件：

- 新增：`docs/features/phase-6-mini-program-acceptance.md`
- 修改：`docs/README.md`
- 修改：`README.md`

步骤：

- [x] 新增验收文档，包含前置数据、测试账号、施工任务准备、断网操作、联网同步、异常重试和验收截图要求。
- [x] 将验收项拆为“开发者工具可验收”和“真机必须验收”。
- [x] 更新根 README 和 `docs/README.md` 文档索引。
- [x] 验证：`git diff --check`。

验收：

- 不依赖口头说明即可执行完整真机验收。
- 每个验收项都有预期结果和失败排查入口。

### Task 4：发布前检查清单

状态：已完成

目标：发布前确认权限、域名、隐私、错误提示和缓存边界。

文件：

- 新增：`docs/features/phase-6-mini-program-release-checklist.md`
- 修改：`docs/README.md`
- 修改：`README.md`

步骤：

- [x] 写入发布前 MUST 检查项：AppID、合法域名、HTTPS、隐私协议、照片权限提示、OSS 上传策略、JWT 过期处理、离线队列上限。
- [x] 写入 MUST NOT 检查项：不得提交本地配置、不得使用生产账号真机压测、不得跳过 API 权限。
- [x] 更新文档索引。
- [x] 验证：`git diff --check`。

验收：

- 发布前清单能覆盖小程序提交审核前的关键风险。
- 清单不包含任何真实密钥或账号。

## 测试计划

自动化验证：

```bash
corepack pnpm --filter @mallbay/api test -- src/auth/auth.service.test.ts
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/mini test
corepack pnpm --filter @mallbay/mini typecheck
git diff --check
```

手工验收：

- 微信开发者工具导入 `apps/mini` 后能打开任务页。
- 配置本地 API 地址和 token 后，任务页能拉取当前施工人员任务。
- 断网后开工、完工、拍照和请假进入离线队列。
- 恢复网络后同步成功项从队列移除，失败项按三次重试规则处理。
- 微信 code 登录在配置完整时返回 token 和门店上下文，配置缺失时返回明确业务错误。

## 外部依赖

- 微信小程序 AppID 和 AppSecret。
- 微信公众平台合法 request/uploadFile 域名。
- 可被真机访问的 HTTPS API 地址。
- OSS 或本地开发上传服务地址。
- 至少一个绑定施工人员身份的测试账号。

## 回滚原则

MUST：

- 文档、配置自检、验收脚本分开提交。
- API 错误语义变更必须有单元测试覆盖。
- 小程序真机配置只保存在开发者工具或本地 `.local`，回滚代码不得影响本机私有配置。

RECOMMENDED：

- 先完成配置自检和文档验收，再做真机联调。
- 真机发现的问题按“可自动化复现优先补测试”的原则回写到 API 或 mini 测试。
