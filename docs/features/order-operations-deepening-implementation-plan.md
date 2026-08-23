# 订单运营 seam 深化实施计划

## 1. 实施目标

将 `OrdersService` 的订单运营读取与命令迁移到两个窄 seam，保持现有 HTTP 行为、权限、金额裁剪、幂等、审计、履约和现金事实语义不变。

## 2. 任务拆分

| 阶段 | 任务 | 验证 |
|---|---|---|
| O1 | 提取订单读取投影与订单命令编排，显式区分 read/command 输入输出 | contract tests |
| O2 | 让 controller 通过新 seam；订单详情内部继续读取 `OrderLifecycle`，付款继续调用 `CashFactWriter` | orders/finance/lifecycle tests |
| O3 | 迁移 web 订单列表、详情、导出、付款和 payment account 调用 | web contract tests |
| O4 | 删除 `OrdersModule` 对 `OrdersService` 的 public export，增加生产引用扫描和 deletion test | deep-module contract |
| O5 | API typecheck、Nest build、全量 API tests、代表页面验收 | 阶段门 |

## 3. 不变量

- 不新增订单履约状态写入路径。
- 不直接创建 `PaymentRecord`。
- 不改变订单金额口径、内部成本裁剪、付款幂等键和修订状态规则。
- 旧 service 只允许作为 module 内部 implementation。

## 4. 交付物

- 新 read/command seam 与 contract tests。
- controller/web 调用者迁移。
- module export deletion regression。
- PRD 评审结论和验证记录。

## 5. 首轮实施结果

- controller 已通过 `ORDER_OPERATIONS` / `ORDER_READ_MODEL` token 访问实现。
- `OrdersModule` 已停止 exports `OrdersService`，保留 `OrderLifecycle` 与两个窄 seam。
- API typecheck、Nest build、订单/财务/履约定向测试通过；全量 API 回归 473 项中 462 通过、0 失败、11 项真实 PostgreSQL 场景跳过。
