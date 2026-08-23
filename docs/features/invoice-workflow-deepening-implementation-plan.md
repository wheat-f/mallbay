# InvoiceWorkflow 深化实施计划

## 1. 目标

把发票申请、开具、作废、重开、发送的命令状态机收拢到 `InvoiceWorkflow` seam；读取继续由 `FinancialDocumentQuery` 负责。

## 2. 实施步骤

1. 新增发票 workflow token 与命令契约，不把 Prisma 查询细节暴露给 controller。
2. 以 `useExisting` 绑定现有 `InvoicesService`，保持 `InvoicePdfService` 为内部实现依赖。
3. 迁移 `InvoicesController` 的命令入口到 workflow seam，列表继续注入 `FinancialDocumentQuery`。
4. 统一状态转移、订单额度/分摊校验、权限判定和日志写入；状态更新使用原状态条件，重开追加 `REISSUED` 日志。
5. 增加申请分摊、非法状态、并发推进、文件失败、事务失败、发送重试和日志一致性 contract tests。
6. 运行 API typecheck、Nest build、发票/财务/权限相关测试和全量 API 测试。

## 3. 文件范围

- 新增：`apps/api/src/invoices/domain/invoice-workflow.ts`
- 修改：`invoices.controller.ts`、`invoices.module.ts`、必要的实现/测试文件
- 不修改：Prisma schema、`FinancialDocumentQuery` 读取语义、外部电子发票接入

## 4. 完成标准

- 所有发票命令只能经过 workflow seam，列表读取不回流 workflow。
- 合法状态推进、并发保护、文件失败重试和日志状态一致性可由 contract tests 验证。
- 无数据库迁移、无双写、现有路由兼容，构建与回归测试通过。

