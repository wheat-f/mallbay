# Phase 6 微信小程序需求覆盖矩阵

- 文档类型：需求覆盖与验收记录
- 文档状态：待真机验收
- 适用范围：`apps/mini` 师傅端任务、施工拍照、离线队列、请假、排班、物料、售后任务、微信登录
- 来源依据：
  - [漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)
  - [Phase 6 微信小程序与离线功能说明](./phase-6-mini-offline.md)
  - [Phase 6 微信小程序联调与发布实施计划](./phase-6-mini-program-integration-plan.md)

## 覆盖结论

当前小程序已满足本地开发环境下的师傅端移动作业最小闭环。微信平台合法域名、HTTPS、uploadFile 域名、真实 AppID/AppSecret 和真机断网恢复属于外部验收项，不能仅凭代码视为发布完成。

## 需求矩阵

| 需求 | 当前状态 | 代码入口 | 验收方式 |
| --- | --- | --- | --- |
| 师傅任务列表 | 已实现 | `apps/mini/pages/tasks/index` | 同步后展示订单、客户、车辆、预约时间和施工状态 |
| 任务详情 | 已实现 | `apps/mini/pages/task-detail/index` | 打开任务可看到客户车辆快照、施工信息、状态动作和照片阶段 |
| 施工拍照离线队列 | 已实现 | `apps/mini/pages/task-detail/index` | 断网选择照片后生成 `PHOTO_UPLOAD` |
| 开工/完工离线队列 | 已实现 | `apps/mini/pages/task-detail/index` | 断网点击开工或完工后生成 `TASK_STATUS`，包含本地时间 |
| 请假离线提交 | 已实现 | `apps/mini/pages/leave/index` | 断网提交后生成 `LEAVE_REQUEST` |
| 离线重试 3 次 | 已实现 | `apps/mini/src/offline-queue.ts`、`apps/mini/src/mini-construction-api.ts` | 单测和手动同步失败验证 |
| 100 条缓存上限 | 已实现 | `apps/mini/pages/task-detail/index`、`apps/mini/pages/leave/index` | 队列满后提示“本地缓存已达上限，请联网同步后再继续操作” |
| 自动同步 | 已实现 | `apps/mini/app.js` | 小程序启动或回前台，配置完整且超过 60 秒后同步 |
| 排班同步 | 已实现 | `apps/mini/pages/schedule/index` | 同步并缓存本人排班 |
| 物料同步 | 已实现 | `apps/mini/pages/materials/index` | 选择施工任务后同步订单物料和锁定批次 |
| 售后任务 | 已实现 | `apps/mini/pages/after-sales/index`、`apps/mini/pages/after-sales-detail/index` | 同步分配给自己的售后任务并查看详情 |
| 微信 code 登录 | 代码已实现，待真机验收 | `apps/mini/pages/settings/index`、`apps/mini/src/mini-wechat-login.ts` | 使用真实 AppID 和绑定 openId 账号验收 |
| 合法域名和 HTTPS | 外部待执行 | 微信公众平台配置 | 真机 request/uploadFile 成功 |
| 发布审核 | 外部待执行 | 微信公众平台 | 按发布前检查清单验收 |

## 手工验收记录模板

| 验收项 | 结果 | 证据 | 日期 | 执行人 |
| --- | --- | --- | --- | --- |
| 开发者工具导入 `apps/mini` | 未执行 |  |  |  |
| 配置 API 地址、token、门店 ID 后同步任务 | 未执行 |  |  |  |
| 任务详情断网开工入队 | 未执行 |  |  |  |
| 任务详情断网完工入队 | 未执行 |  |  |  |
| 任务详情断网拍照入队 | 未执行 |  |  |  |
| 请假断网入队 | 未执行 |  |  |  |
| 恢复网络后同步成功项移除 | 未执行 |  |  |  |
| 失败项 3 次后标记同步失败 | 未执行 |  |  |  |
| 微信 code 登录返回 token 和门店上下文 | 未执行 |  |  |  |
| 真机 HTTPS request 域名通过 | 未执行 |  |  |  |
| 真机 uploadFile 域名通过 | 未执行 |  |  |  |
