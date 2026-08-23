# PermissionGovernance / StoreGovernance / InvoiceWorkflow｜PRD 评审报告 v2

## 1. 评审结论

| 等级 | 数量 | 结果 |
|---|---:|---|
| S0 阻塞 | 0 | 无 |
| S1 高风险 | 0 | v1 的 P1-P3 已修订 |
| S2 一般问题 | 2 | 指标基线与统一迁移清单留作实施/上线后事项 |
| S3 优化建议 | 0 | 无 |

## 2. 修订验证

- PermissionGovernance：治理状态与审计同事务，缓存只在提交后失效；运行时拒绝仍保持默认拒绝。
- StoreGovernance：拒绝后按历史批准提交回到 `PUBLISHED` 或 `DRAFTED`；通知失败不回滚权威门店状态；冻结/解冻前置状态明确。
- InvoiceWorkflow：状态推进带原状态条件；并发请求最多一个推进成功；重开成功追加 `REISSUED` 日志，文件/事务失败不写最终日志。
- 三个模块均明确了无迁移、无双写、路由兼容、现有 adapter 保留和 seam contract tests。

## 3. 研发进入结论

### 可以进入研发

三份 PRD 已达到研发、测试和业务确认所需的可执行程度。指标基线和治理页面展示细节不阻塞本期 seam 落地，进入实施计划跟踪。

## 4. 评审后的实施门槛

1. 不新增数据库迁移和事实写入路径。
2. 不修改现有路由语义；controller 通过 seam token/interface 依赖。
3. 现有内部 use case、`AccessContext`、`FinancialDocumentQuery` 和 PDF/通知 adapter 的职责保持不越界。
4. 以 seam contract tests 作为新测试 surface，同时保留既有模块回归。

