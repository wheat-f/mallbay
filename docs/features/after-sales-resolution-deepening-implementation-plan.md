# 售后处置 seam 深化实施计划

## 1. 实施目标

将售后查询与处置动作集中到稳定 seam，保持当前售后状态、证据追加、OSS 回滚、成本类别权限、红冲和审计行为不变。

## 2. 任务拆分

| 阶段 | 任务 | 验证 |
|---|---|---|
| A1 | 提取售后读取投影和处置 command 编排，显式保留四状态模型 | contract tests |
| A2 | 迁移 controller 的创建、派单、责任、证据、照片、关闭、成本和红冲调用 | after-sales tests |
| A3 | 固化证据追加、施工后照片前置、成本一次红冲和指派人范围 | state/permission tests |
| A4 | 增加 Finance/Inventory/Returns ownership 静态扫描，删除旧 service public export | deep-module contract |
| A5 | API typecheck、Nest build、全量 API tests、售后代表页面验收 | 阶段门 |

## 3. 不变量

- 售后不写 `PaymentRecord`、库存流水或订单最终交付状态。
- 证据只追加，不覆盖；OSS 与数据库失败需保持可追踪性。
- `OPEN → ASSIGNED → RESOLVED → CLOSED` 不新增未确认状态。
- 已关闭售后和已红冲成本不能重复产生新事实。

## 4. 交付物

- 读取/处置 seam 与 contract tests。
- controller/web 调用者迁移。
- ownership 与旧入口 deletion regression。
- 验证结果记录。

## 5. 首轮实施结果

- controller 已通过 `AFTER_SALES_RESOLUTION` / `AFTER_SALES_READ_MODEL` token 访问实现。
- `AfterSalesModule` 已停止 exports `AfterSalesService`。
- 售后状态、证据、成本和 ownership 定向回归通过；全量 API 回归无失败。
