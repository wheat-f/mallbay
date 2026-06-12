# Phase 6 微信小程序与离线功能说明

- 文档类型：已交付功能说明
- 文档状态：初版
- 适用范围：师傅端任务、施工拍照、本地缓存、离线照片队列、离线请假同步
- 来源依据：[Phase 6 微信小程序与离线实施计划](./phase-6-mini-offline-plan.md)

本文档说明 Phase 6 已交付的移动端离线基础能力。

## 已交付能力

- 小程序骨架：`apps/mini` 提供任务列表、任务详情、离线队列、请假和连接配置页面。
- 本地离线队列：`OfflineQueue` 可暂存照片、施工状态和请假操作。
- 任务状态离线同步：任务详情页按当前任务状态提供“开工”或“完工”按钮，写入 `TASK_STATUS` 队列；开工操作记录本地 `startedAt`，完工操作记录本地 `completedAt`，联网后通过施工 API 流转状态并保留实际开工和完工时间。
- 施工照片离线同步：任务详情页拍照入队时记录本地 `takenAt` 拍摄时间，手动同步和自动同步都会随照片表单上传给施工照片 API。
- 缓存上限：达到 `maxItems` 后拒绝继续写入，并返回明确中文提示。
- 重试机制：联网同步失败时累计重试次数，达到 3 次后标记为 `FAILED`。
- 同步清理：同步成功的离线项会从本地队列移除。
- 后端同步：`POST /construction/offline-sync` 逐条处理离线照片、状态和请假。

## 角色权限

- 师傅/学徒：只能同步自己有权处理的施工任务、照片和请假。
- 施工主管、店长、管理员：继续通过 Web 管理端处理派单、质检和排班。

## API 范围

- `POST /construction/offline-sync`

支持的离线操作：

- `PHOTO_UPLOAD`：同步施工照片。
- `TASK_STATUS`：同步开工和完工状态。
- `LEAVE_REQUEST`：同步请假申请。

## 小程序页面

- `pages/tasks/index`：施工任务列表。
- `pages/task-detail/index`：任务详情、开工/完工离线状态入口和施工拍照入口。
- `pages/offline/index`：离线队列和同步说明。
- `pages/leave/index`：离线请假提交。
- `pages/settings/index`：开发和真机调试连接配置、微信 code 登录。

## 微信登录配置

- API 侧通过 `WECHAT_MINI_APP_ID` 和 `WECHAT_MINI_APP_SECRET` 调用微信 code 换 session。
- 缺少上述配置时，微信登录返回“微信小程序登录未配置”的业务错误，不返回内部服务器错误。
- 配置完整时，微信 code 登录继续按 `wx.login` code 换取 openId，再匹配已绑定用户并签发 JWT。

## 约束

- MUST 通过施工 API 同步离线操作，不允许小程序直接写业务表。
- MUST 保留服务端权限校验，前端缓存不代表权限通过。
- MUST 对离线失败逐条返回结果，不能让单条失败阻断整批同步。
- MUST 将小程序真机联调配置保存在开发者工具、本地存储、`.local` 或环境变量中；真实 AppID、token、测试账号、OSS 密钥、局域网 IP 和内网穿透地址不得提交到 Git。
- MUST NOT 在 Phase 6 实现微信登录发布、离线冲突合并、视频分片和完整小程序 UI。
