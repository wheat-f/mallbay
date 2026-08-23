# PermissionGovernance / StoreGovernance / InvoiceWorkflow｜实施评审

## 1. 实施范围

本次落地完成三条外部 seam：

- `PERMISSION_GOVERNANCE`：权限治理 controller 依赖；`AccessContext` 继续承载运行时权限解析和范围判定。
- `STORE_GOVERNANCE`：门店治理 controller 依赖；现有门店生命周期 use case 继续作为内部 adapter。
- `INVOICE_WORKFLOW`：发票命令 controller 依赖；`FinancialDocumentQuery` 继续承载列表读取。

## 2. 关键实现结果

### PermissionGovernance

- 权限策略、角色、角色绑定治理通过 token/interface seam 暴露。
- 策略管理员判定改由 `AccessContext.scope` 完成，controller 不再直接调用运行时实现。
- 角色创建、绑定创建、绑定停用的审计与状态写入纳入事务；缓存只在事务提交后失效。
- 保留现有 `PermissionsService` 作为兼容实现导出，避免非本期调用方破坏；controller 已切换到治理 seam。

### StoreGovernance

- 门店 controller 已切换到 `STORE_GOVERNANCE`。
- 公开门店、工作台、施工可执行门店读取仍通过治理读取契约承接，未把施工写入职责带入门店模块。
- 现有送审、审核、冻结和店长 use case 未复制；门店配置仍是施工资格的来源。

### InvoiceWorkflow

- 发票命令 controller 已切换到 `INVOICE_WORKFLOW`，列表仍使用 `FinancialDocumentQuery`。
- 开具、重开和作废使用原状态条件更新，避免并发请求重复推进最终状态。
- 重开成功追加 `REISSUED` 日志；文件生成失败或事务失败不写最终状态日志。
- `InvoicePdfService` 保持为内部实现依赖，没有新增虚假 adapter。

## 3. 验证结果

| 验证项 | 结果 |
|---|---|
| API TypeScript typecheck | 通过 |
| Nest build | 通过 |
| 三条 seam + 相关权限/门店/发票测试 | 38 通过，0 失败 |
| API 全量测试 | 475 总数，464 通过，0 失败，11 跳过 |
| `git diff --check` | 通过；仅有 CRLF 转换警告 |
| 数据库迁移 | 未新增 |
| 双写路径 | 未新增 |

## 4. 保留事项

- 真实 PostgreSQL 并发测试仍受本地数据库环境限制，沿用项目现有 11 个跳过项。
- 治理页面的影响快照分页/导出、业务指标基线和目标值不在本期 seam 落地范围。
- `PermissionsService`、`StoresService`、`InvoicesService` 仍保留为兼容实现；后续可在调用方迁移完成后单独执行删除门测试。

## 5. 结论

三条深化方向均已按 PRD v2 和实施计划落地，接口/实现 seam、测试 surface、状态一致性和兼容策略达到本期完成标准。

