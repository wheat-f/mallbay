# QuoteWorkflow（报价执行）深化实施计划

> 依据：`docs/features/quote-workflow-deepening-prd.md` v0.2-revised、`docs/features/quote-workflow-deepening-prd-review.md` 复审通过结论  
> 计划日期：2026-08-23  
> 原则：单一报价事实写入路径、保留既有 route/错误兼容、不得越过 PricingDecision / CapacityReservation / OrderLifecycle ownership

## 1. 实施目标

将报价命令和报价查询从同一个调用者 surface 中分离：

- Controller 依赖 `QuoteWorkflow` command interface 和 `QuoteReadModel` read interface。
- scheduler 只依赖报价过期 command interface。
- `SalesQuotesService` 作为迁移期内部 implementation，不再是生产 caller 的依赖类型。
- 报价批准与容量确认在同一个数据库事务内完成。
- 重算使用稳定 commandId，重复重算不会创建第二个版本。
- `CONVERTED` 与 `convertedOrderId` 继续由 `OrderLifecycle` 唯一写入。

## 2. 任务拆分

### M1：建立 interface seam

涉及文件：

- `apps/api/src/sales-quotes/domain/quote-workflow.ts`
- `apps/api/src/sales-quotes/sales-quotes.module.ts`
- `apps/api/src/sales-quotes/sales-quotes.controller.ts`
- `apps/api/src/sales-quotes/sales-quote-expiry.scheduler.ts`

任务：

1. 定义 `QuoteWorkflow` command interface 和 `QuoteReadModel` read interface。
2. 定义 Nest injection tokens，生产 provider 使用 `useExisting: SalesQuotesService`，避免双实例。
3. Controller 的命令 route 只注入 command token，查询 route 只注入 read token。
4. scheduler 只注入 command token。
5. 先加入 interface contract 类型检查，不改变业务结果。

阶段门：生产 caller 不再直接声明 `SalesQuotesService`；不新增第二个报价写入 implementation。

### M2：收拢容量确认与释放的事务协作

涉及文件：

- `apps/api/src/construction/capacity-reservation.service.ts`
- `apps/api/src/construction/capacity-reservation.service.test.ts`
- `apps/api/src/sales-quotes/sales-quotes.service.ts`
- `apps/api/src/sales-quotes/sales-quotes.service.test.ts`

任务：

1. 增加 `confirmQuoteWithin(tx, quoteId)`，只更新 `HELD → CONFIRMED`，状态不匹配时抛出稳定容量错误。
2. 增加 `releaseQuoteWithin(tx, quoteId, reasonCode, status)`，复用现有释放算法。
3. 保留 `confirmQuote`、`releaseQuote` 作为容量 module 对外独立调用的事务包装器。
4. `SalesQuotesService.review` 把审批记录、报价状态和容量确认/释放放入同一 `$transaction`。
5. 补充容量缺失、重复确认、审批并发和审批失败回滚测试。

阶段门：批准成功必然有容量 `CONFIRMED`；容量确认失败时报价不变为 `APPROVED`。

### M3：重算幂等与过期结果语义

涉及文件：

- `apps/api/src/sales-quotes/dto/sales-quote.dto.ts`
- `apps/api/src/sales-quotes/sales-quotes.controller.ts`
- `apps/api/src/sales-quotes/sales-quotes.service.ts`
- `apps/api/src/sales-quotes/sales-quotes.service.test.ts`

任务：

1. `recalculate` 接受可选稳定 commandId；旧 route 通过 `Idempotency-Key` header 传入。
2. 缺少 header 时使用旧报价 id + 请求指纹生成稳定迁移期标识，不使用当前时间。
3. 通过现有 `SalesQuote` 幂等字段绑定旧报价、输入指纹和新报价结果。
4. `expirePending` 返回 `scannedCount`、`expiredCount` 和 `capacityReleasePendingCount`。
5. scheduler 保持现有运行周期和容量对账，但消费新的过期结果。

阶段门：同一重算命令重试只返回同一新报价；过期任务重复运行无重复状态写入和容量释放。

### M4：contract tests 与删除后回归

涉及文件：

- 新增 `apps/api/src/sales-quotes/domain/quote-workflow.contract.test.ts`
- 更新报价专项测试、容量专项测试、模块/Controller 测试
- `apps/api/src/deep-module-contracts.test.ts`（如需登记新 seam）

任务：

1. 使用 fake adapters 验证 command interface 的状态、幂等、错误和 ownership 语义。
2. 保留现有 `SalesQuotesService` implementation tests，逐步把 caller 行为测试迁移到 interface contract tests。
3. 删除生产 caller 对旧类型的依赖后运行 API 全量测试、typecheck、build。
4. 检查生产目录不出现 `SalesQuote.status` 的第二条写入路径，不出现 QuoteWorkflow 直接写容量/订单/现金事实。

阶段门：contract tests、报价专项测试、容量专项测试、API 全量、typecheck、build 全部通过。

## 3. 不在本次实施中做的事项

- 不修改 Web 页面和 HTTP 路由。
- 不新增数据库 migration。
- 不重写 pricing implementation。
- 不迁移 `OrderLifecycle` 内部转单实现。
- 不引入异步消息或分布式调度。

## 4. 验证命令

以仓库既有 package scripts 为准，至少执行：

1. 报价和容量专项测试。
2. API typecheck。
3. API build。
4. API 全量测试。
5. `rg` 删除后检查：Controller、scheduler 不直接依赖 `SalesQuotesService`；报价状态写入仅保留 QuoteWorkflow implementation 与 `OrderLifecycle` 的既有 authority。

## 5. 提交拆分

建议提交为一个可回滚的功能提交，包含 PRD、评审、实施计划、领域词汇和代码/测试变更；提交信息：

`feat: deepen quote workflow command seam`

## 6. 实施结果（2026-08-23）

- 已建立 `QUOTE_WORKFLOW` command seam 与 `QUOTE_READ_MODEL` read seam；Controller 和 expiry scheduler 不再依赖 `SalesQuotesService` 类型。
- 已将容量报价确认/释放及其审计写入收拢到容量 module 的事务内 adapter；报价批准失败会回滚，不产生已批准但未确认容量的结果。
- 已将重算改为稳定幂等标识；缺少 header 时使用旧报价和输入指纹生成确定性标识，不再使用当前时间。
- 已将过期结果拆为扫描数量、实际过期数量和容量释放待重试数量。
- 已新增报价/容量 contract tests、module seam 断言和删除后静态检查。
- 已通过：报价/容量专项 13/13、架构 contract 21/21、API typecheck、Nest build、API 全量 460/460；11 个真实 PostgreSQL 测试按环境跳过。
