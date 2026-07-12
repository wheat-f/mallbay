# Phase 6 微信小程序与离线实施计划

- 文档类型：功能实施计划
- 文档状态：初版
- 适用范围：师傅端任务、施工拍照、本地缓存、离线照片队列、离线请假同步
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)

## 目标

Phase 6 MUST 为施工人员提供移动作业的最小闭环：

- 师傅可在移动端查看已派施工任务。
- 断网时可查看已缓存任务、客户、车辆和施工状态。
- 断网时施工照片进入本地上传队列。
- 断网时请假申请进入本地同步队列。
- 联网后离线队列自动同步，每条记录最多重试 3 次。

## 交付范围

MUST：

- 新增 `apps/mini/` 小程序骨架。
- 新增可测试的 `OfflineQueue`，控制缓存上限和重试次数。
- 后端新增 `POST /construction/offline-sync`，统一接收照片、施工状态和请假离线操作。
- 同步接口逐条处理，单条失败不阻断后续操作。
- 文档说明离线缓存上限、重试和当前非目标。

MUST NOT：

- 不实现完整微信登录和真机发布流程。
- 不实现离线冲突合并策略。
- 不实现视频离线压缩和大文件分片上传。
- 不改变现有 Web 管理端施工主流程。

## API

- `POST /construction/offline-sync`

请求体：

```json
{
  "operations": [
    {
      "clientOperationId": "offline_1",
      "type": "PHOTO_UPLOAD",
      "payload": {
        "recordId": "record_1",
        "stage": "BEFORE",
        "url": "https://oss.example/photo.jpg"
      }
    }
  ]
}
```

返回体：

```json
{
  "items": [
    {
      "clientOperationId": "offline_1",
      "status": "SYNCED"
    }
  ]
}
```

## 验收

- 断网时可把施工照片、状态和请假申请写入本地队列。
- 超过本地缓存上限时给出明确中文提示。
- 联网后队列逐条同步，成功项移除，失败项保留并累计重试次数。
- 单条操作失败不会阻断后续离线操作同步。
- 失败达到 3 次后标记为 `FAILED`。

## 测试计划

- `ConstructionService` 离线同步单元测试。
- `OfflineQueue` 缓存上限测试。
- `OfflineQueue` 三次重试失败测试。
- `OfflineQueue` 同步成功后移除测试。
