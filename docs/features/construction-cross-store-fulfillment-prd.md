# 跨店施工履约子 PRD

## 1. 范围

本子 PRD 只覆盖跨店施工任务在 `Construction Fulfillment` 中的状态、接收、派工、施工、源门店确认和证据追溯；不改变订单最终交付由 `OrderLifecycle` 拥有的规则。

## 2. 业务对象

| 对象 | 定义 | 事实所有者 |
|---|---|---|
| 跨店施工任务 | 源门店订单交由执行门店施工的履约任务 | Cross-store construction implementation |
| 源门店 | 订单和客户关系所属门店 | Order/Customer module |
| 执行门店 | 实际派工、施工和质检门店 | Construction Fulfillment |
| 源门店接收 | 源门店对执行门店施工结果的确认事实 | Cross-store construction implementation |
| 施工证据 | 跨店施工产生的照片、材料、质检和现场记录 | Construction Fulfillment |

## 3. 状态流转

```text
PENDING_ACCEPTANCE
  ├─→ ACCEPTED
  └─→ REJECTED

ACCEPTED
  └─→ READY_TO_DISPATCH

READY_TO_DISPATCH
  └─→ DISPATCHED

DISPATCHED
  └─→ IN_CONSTRUCTION

IN_CONSTRUCTION
  └─→ PENDING_SOURCE_ACCEPTANCE

PENDING_SOURCE_ACCEPTANCE
  ├─→ COMPLETED
  └─→ IN_CONSTRUCTION

任意非终态
  └─→ CANCELLED（仅在现有取消条件满足时）
```

状态必须使用现有 `CrossStoreTaskStatus` 枚举。页面不得把执行门店 `COMPLETED` 直接展示为源门店订单最终交付。

## 4. 业务规则

1. 执行门店接受任务后才能进入 `ACCEPTED`。
2. 执行门店只有在任务进入 `READY_TO_DISPATCH` 后才能派工。
3. 执行门店施工完成后进入 `PENDING_SOURCE_ACCEPTANCE`，不直接完成源门店订单。
4. 源门店确认前，源门店订单不得进入最终交付完成。
5. 源门店拒绝接收或质检不通过时，任务回到可重施工状态，并记录原因。
6. 跨店照片、材料、质检和接收记录采用追加式保存。
7. 通知失败不回滚跨店任务状态；通知任务使用任务 ID 和状态变更版本去重。
8. 跨店任务权限按源门店和执行门店分别裁剪：源门店查看订单和接收结果，执行门店执行施工动作。

## 5. Public interface 补充

```text
acceptCrossStoreTask(taskId, actor) -> CrossStoreTaskView
rejectCrossStoreTask(taskId, reason, actor) -> CrossStoreTaskView
getCrossStoreFulfillmentView(taskId, actor) -> CrossStoreFulfillmentView
confirmSourceAcceptance(taskId, input, actor) -> CrossStoreTaskResult
```

以上 interface 不直接暴露 Prisma 类型，不允许页面直接修改 `CrossStoreTaskStatus`。

## 6. 验收标准

- Given 跨店任务为 `PENDING_ACCEPTANCE`，When 执行门店接受，Then 任务进入 `ACCEPTED` 并记录接收人和时间。
- Given 任务未进入 `READY_TO_DISPATCH`，When 执行派工，Then 返回 `INVALID_LIFECYCLE_TRANSITION` 且不创建施工记录。
- Given 执行门店完成施工，When 查询源门店订单，Then 订单不显示最终交付完成，跨店任务显示 `PENDING_SOURCE_ACCEPTANCE`。
- Given 源门店拒绝接收，When 提交拒绝原因，Then 任务返回 `IN_CONSTRUCTION` 或现有返工状态，并新增接收记录。
- Given 跨店任务通知失败，When 核心事务成功，Then 状态保持成功且通知进入重试记录。
- Given 用户只拥有执行门店权限，When 查看源门店客户敏感信息，Then 返回裁剪后的任务视图。

## 7. 相关文件

- `apps/api/src/construction/cross-store-construction.service.ts`
- `apps/api/src/construction/construction.service.ts`
- `apps/api/src/orders/domain/order-lifecycle.ts`
- `apps/api/prisma/schema.prisma`
- `apps/web/app/construction/cross-store/page.tsx`
- `apps/web/app/orders/[id]/page.tsx`
