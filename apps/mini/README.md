# MallBay 师傅端小程序

Phase 6 的小程序目录用于师傅端移动作业：

- 任务列表：查看已缓存派单任务。
- 任务详情：查看客户、车辆、施工状态，离线记录开工/完工并拍照。
- 离线队列：暂存照片、状态和请假提交，联网后同步到 API。

当前阶段交付师傅端最小产品化初版：

- 任务列表页从 `mallbay_construction_tasks` 本地缓存读取派单任务，展示客户、车辆、预约时间、施工状态和照片进度。
- 任务详情页展示客户车辆快照、施工信息、开工/完工按钮和施工前/中/后拍照入口；开工/完工会写入 `TASK_STATUS` 离线队列，开工携带本地 `startedAt` 时间，完工携带本地 `completedAt` 时间，拍照通过 `wx.chooseMedia` 获取本地文件路径并携带本地 `takenAt` 拍摄时间写入 `mallbay_offline_queue`，离线队列达到 100 条时会提示先联网同步。
- 任务列表页可从 `/construction/assignments` 手动同步师傅任务并写入本地缓存，兼容数组响应和 `{ items: [...] }` 包装响应。
- 离线队列页展示待同步、重试中和失败数量，并可手动同步照片、施工状态和请假记录；失败记录在 3 次以内继续保留为待同步，第 3 次失败后标记为同步失败。
- 请假页支持选择开始日期、结束日期和请假原因，提交后写入 `LEAVE_REQUEST` 离线队列，联网后通过 `/construction/offline-sync` 同步。
- 连接配置页支持在小程序内保存 API 地址、JWT access token 和门店 ID，用于开发与真机调试注入登录态。
- 连接配置页提供微信一键登录按钮，调用 `wx.login` 后请求 `POST /auth/wechat-login`，并自动保存 access token 和当前门店 ID。
- 小程序启动和回到前台时会自动尝试同步离线队列，同步间隔至少 60 秒，避免频繁请求；自动同步和手动同步使用相同的 3 次重试规则。

运行态约定：

- `mallbay_api_base_url`：API 地址，例如 `http://localhost:3001`。
- `mallbay_access_token`：JWT access token。
- `mallbay_store_id`：当前门店 ID。
- API 侧需要配置 `WECHAT_MINI_APP_ID` 和 `WECHAT_MINI_APP_SECRET`；微信 openId 必须先通过账号绑定接口写入用户档案。

本地开发、微信开发者工具和真机联调配置见 [README.local.md](./README.local.md)。本地 AppID、token、测试账号、OSS 密钥、局域网 IP 和内网穿透地址不得提交到 Git。

后续仍需按 [Phase 6 微信小程序联调与发布实施计划](../../docs/features/phase-6-mini-program-integration-plan.md) 补齐真机调试、微信平台联调验收和发布前检查。
