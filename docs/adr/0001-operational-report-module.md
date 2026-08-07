---
status: accepted
---

# Operational Report module owns analysis semantics

MallBay 的 Operational Report module 统一负责经营分析的筛选范围、主日期口径、摘要、期间对比、趋势、经营洞察和分析明细；对外保留一个完整的 `operational` interface，同时保留轻量 `summary` 以兼容现有消费者。报表结果必须显式区分分析区状态、权限/输入/规模错误和不可比较数据，并使用 `version: 1`、`generatedAt`、366 天查询上限及 2,000 行明细上限。

在途订单计入经营金额、实际收款和待收，但不进入不适用的完工指标；收款按实际发生日期统计，日期口径不得静默回退；成本不完整时毛利保持待补齐。第一阶段采用实时查询，Prisma 仍是 module 内部 implementation，不公开只有一个真实实现的 adapter seam；先通过 interface contract tests 固化语义，再重组 implementation。这样可以让报告页面和导出共享同一解释，保持数据语义诚实，并把权限、日期和指标规则集中在一个 deep module 中。
