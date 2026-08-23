# 退货执行（ReturnsWorkflow）深化实施计划

## 1. 实施目标

将 `ReturnsService` 的退货 command 收拢到 `ReturnsWorkflow` execution seam，保持现有路由、DTO、查询结果、权限和业务状态兼容；统一幂等、事务、审计与 Finance/Inventory adapter 编排。

## 2. 实施约束

1. 不启用 `APPROVED` / `CLOSED` 状态。
2. 不新增审核后取消、纯换货零现金结算或成本核验驳回 workflow。
3. 不改变销售退款现金事实 `sourceId` 口径。
4. 不直接写 `PaymentRecord`、库存批次、库存流水或库存分配事实。
5. 退款成功审计必须与退款业务状态和现金事实同事务提交。
6. 不保留第二条可写 command implementation。

## 3. 任务分解

### P0：建立 execution seam

- 将 `ReturnsService` 的 command authority 命名为 `ReturnsWorkflow`，保留读取方法以兼容现有查询入口。
- 增加统一 `execute(command)` dispatch，controller command route 只调用该 interface。
- 将具体动作方法收敛为 workflow 内部 implementation，不改变现有业务规则。
- 更新 module provider/export 和 controller 注入关系。

### P0：统一一致性规则

- 统一 action 幂等键、请求摘要冲突、成功重放、失败重试语义。
- 创建销售/采购退货时，在同一事务提交主单、明细、初始 action 和审计。
- 为状态变化增加事务内状态条件保护，拒绝不同幂等键的旧状态并发写入。
- 保持 CashFactWriter、InventoryLedger 的窄事务上下文。
- 为销售退款补写成功审计，并与现金事实、退款金额状态同事务提交。

### P0：测试

- 新增 command interface dispatch contract tests。
- 新增创建原子性、退款审计和 adapter 调用 contract tests。
- 保留并运行 `return-domain.test.ts`。
- 扩展 architecture contract tests，确保 controller 不再直接调用具体 command 方法，且无直接事实写入。

### P1：验证与文档

- API typecheck、Returns 定向测试、deep-module contract tests、API 全量测试。
- `git diff --check`。
- 更新 ADR-0018 和 `CONTEXT.md` 术语记录。

## 4. 预计变更文件

| 文件 | 变更 |
|---|---|
| `apps/api/src/returns/returns.service.ts` | `ReturnsWorkflow` 命名、统一 command dispatch、原子创建、状态并发保护、退款审计 |
| `apps/api/src/returns/returns.controller.ts` | command route 统一调用 `execute`，query route 保持读取行为 |
| `apps/api/src/returns/returns.module.ts` | provider/export 使用 `ReturnsWorkflow` |
| `apps/api/src/returns/returns-workflow.contract.test.ts` | command interface 与一致性契约测试 |
| `apps/api/src/deep-module-contracts.test.ts` | 更新 Returns execution seam 静态约束 |
| `docs/adr/0018-returns-workflow-command-seam.md` | 记录 ownership、seam 和迁移决策 |
| `CONTEXT.md` | 已在设计阶段加入“退货执行”术语 |

## 5. 验证门

### Gate 1：静态边界

- controller command route 只出现 `workflow.execute`。
- Returns 不出现 `paymentRecord.create`、库存批次/库存流水直接写入。

### Gate 2：行为契约

- 统一 command 能正确 dispatch 所有销售/采购动作。
- 幂等重放/冲突/失败语义不变。
- 退款成功有审计。

### Gate 3：回归

- API 定向测试通过。
- API 全量测试无新增失败。
- Web 与无关模块不受影响。

### Gate 4：提交

- 工作树只包含本需求相关文件和既有文档。
- 提交前复核不包含 `.codegraph/`、`.codex/`、`apps/web/.impeccable/`、`docs/bug/extracted/` 等无关未跟踪目录。
