# 四个业务 seam 深化 PRD｜需求评审报告

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 评审对象 | `docs/features/four-deep-seams-prd.md` |
| 文档版本 | V1.0 |
| 评审范围 | ownership、interface、迁移、测试、异常与删除门 |
| 评审结论 | 有条件通过，允许进入并行实施 |

## 2. 结论摘要

四个方向的目标均是收口调用方对实现的知识，而不是改变业务规则。PRD 已明确 module、interface、seam、implementation、adapter、非目标和阶段门，且已将 `PricingDecision`、客户消费、商品定价和用户资料排除在相邻 seam 之外。

| 等级 | 数量 | 处理结论 |
|---|---:|---|
| S0 阻塞 | 0 | 无 |
| S1 高风险 | 1 | 身份会话保持安全策略不变，contract 与原测试必须同时通过 |
| S2 一般 | 2 | 补充删除扫描与旧实现保留说明，纳入实施阶段门 |
| S3 优化 | 0 | 无 |

## 3. 高风险问题

### S1-1：身份会话迁移可能改变 cookie/session 安全语义

- 所在位置：身份会话实施与验收。
- 影响：认证错误、refresh、撤销或 cookie 差异会造成登录中断或安全回归。
- 修改建议：`IdentitySession` 仅作为 external seam；`AuthService` 原逻辑保留为 implementation。迁移前后运行 `auth.service.test.ts` 与新增 contract tests，不改变 controller 的 DTO、cookie options 和错误处理。
- 待确认角色：研发、测试。
- 是否阻塞研发：否，已转为强制实施阶段门。

## 4. 一般问题

| 编号 | 等级 | 问题 | 影响 | 修改建议 |
|---|---|---|---|---|
| R2 | S2 | 四个 seam 并行会增加跨文件迁移冲突 | 合并时可能漏迁移或重复导出 | 四个 agent 使用互不重叠目录；主分支统一做 typecheck、静态扫描和集成回归 |
| R3 | S2 | 旧 service 暂不删除会留下兼容路径 | 可能被新调用者绕过 seam | 增加 controller 依赖扫描与删除门；旧 service 仅允许留在 module 内部或兼容测试 |

## 5. 评审结论

**有条件通过，允许进入并行实施。** 进入交付门前必须满足：四个 seam contract tests 通过、controller 依赖收口、全量 typecheck/build/test 通过、无 schema/DTO/业务语义变化，并完成旧实现引用扫描。
