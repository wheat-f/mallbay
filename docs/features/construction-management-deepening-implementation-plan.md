# 施工管理能力 seam 深化实施计划

## 1. 实施目标

从 `ConstructionService` 中收拢容量、施工人员、请假和排班管理能力，保持履约、证据、材料、离线和库存事实的既有 owner 与调用路径。

## 2. 任务拆分

| 阶段 | 任务 | 验证 |
|---|---|---|
| C1 | 提取施工管理读取/命令 seam，覆盖容量、人员、请假、排班 | contract tests |
| C2 | 迁移管理端点；履约端点继续使用 `ConstructionFulfillment` | construction/controller tests |
| C3 | 固化门店范围、本人范围、请假 client operation 幂等和排班校验 | permission/idempotency tests |
| C4 | 增加禁止管理 seam 进入履约/证据/库存写入的静态扫描，删除旧 service public export | deep-module contract |
| C5 | API typecheck、Nest build、全量 API tests、施工管理代表页面验收 | 阶段门 |

## 3. 不变量

- 管理 seam 不推进订单履约，不写施工证据，不写库存流水。
- 请假离线同步只作为内部传输适配，不成为新的 public seam。
- 既有 schema 枚举、client operation 幂等和权限范围不改变。
- `ConstructionFulfillment` 仍是订单施工履约的唯一外部入口。

## 4. 交付物

- 施工管理 seam 与 contract tests。
- 容量/人员/请假/排班调用者迁移。
- module export deletion regression。
- 验证结果记录。

## 5. 首轮实施结果

- 容量、人员、请假、排班管理端点已通过 `CONSTRUCTION_MANAGEMENT` token 访问实现。
- 履约、证据、材料、离线端点仍保留在各自既有内部路径，未进入管理 seam。
- 施工定向回归、API typecheck、Nest build 和全量 API 回归通过。
