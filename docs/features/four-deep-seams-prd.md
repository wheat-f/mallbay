# 四个业务 seam 深化 PRD

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | 报价规则治理、客户账户、商品目录、身份会话 seam 深化 |
| 文档版本 | V1.0 |
| 当前状态 | 已确认，实施中 |
| 创建日期 | 2026-08-23 |
| 关联材料 | `CONTEXT.md`、`docs/architecture-review-mallbay-20260807.md`、现有模块 contract tests |

## 2. 背景与目标

当前四类能力的调用方直接认识多个实现，或存在只转发少量方法的浅 seam。目标是将以下业务语义分别放入有 depth 的 module interface，集中不变量、权限入口和测试面：

- 报价规则治理：规则版本、模板、施工成本标准与门店 rollout readiness。
- 客户账户：客户/车辆关系、归属、生命周期、历史、摘要和标签。
- 商品目录：商品主数据、销售/替代单位、建议售价、标准成本和生命周期。
- 身份会话：认证凭证、令牌、会话查询与撤销。

本期不改变数据库 schema、既有 DTO、错误语义、权限结果、金额快照、订单状态、客户消费口径或用户资料模型。

## 3. 设计原则与范围

每个 module 只有一个 external seam；controller 和跨模块调用者只依赖 seam。现有 `Service` 保留为内部 implementation 或兼容 adapter，直到调用者迁移和删除测试通过。内部 adapter 不公开给业务调用者；不新增没有真实变化来源的 repository seam。

| Module | external seam 拥有的语义 | 明确不拥有 |
|---|---|---|
| `PricingGovernance` | 规则集/模板/成本标准生命周期、发布与 rollout readiness | 单次 `PricingDecision`、报价/订单价格成本快照 |
| `CustomerAccount` | 客户与车辆关系、账户摘要、车辆生命周期/历史、标签 | 订单履约、定价、现金事实 |
| `ProductCatalog` | 商品、单位、建议售价、标准成本、目录生命周期 | 定价规则发布、报价执行 |
| `IdentitySession` | 注册登录、第三方凭证认证、refresh、logout、session revoke | 用户 profile、权限策略、业务对象授权 |

## 4. 业务规则与验收标准

### 4.1 报价规则治理

- Given 规则集或模板处于草稿状态，When 调用校验/发布，Then 仍执行现有完整校验并保持原错误结果。
- Given 门店 rollout readiness 不满足，When 设置 rollout，Then 仍拒绝写入并返回现有 readiness 结果。
- Given 调用报价计算或订单创建，When 规则发生变化，Then 仍由 `PricingDecision` 产生本次价格/成本快照，治理 seam 不回算历史快照。

### 4.2 客户账户

- Given 访问主体无客户/车辆数据范围，When 查询或维护账户，Then 结果与现有 `CustomersService` 权限语义一致。
- Given 车辆身份或转移条件不满足，When 创建、更新、转移或变更状态，Then 保持现有校验、事务和错误结果。
- Given 查询客户摘要/车辆摘要/标签，When 通过 `CustomerAccount` 调用，Then 不要求调用方读取 `CustomersService` 实现细节。

### 4.3 商品目录

- Given 用户具有原有商品维护能力，When 新增、更新、删除、修改标准成本或建议售价，Then 保持原有权限、审计和单位校验。
- Given 用户缺少成本或建议售价能力，When 修改对应字段，Then 仍拒绝，不因 seam 迁移扩大数据范围。
- Given 读取商品详情/列表，When 通过 `ProductCatalog` 调用，Then 返回既有字段和脱敏/展示语义。

### 4.4 身份会话

- Given 密码、微信凭证或 refresh token 合法，When 通过 `IdentitySession` 认证或刷新，Then cookie、token、session 和用户结果保持不变。
- Given 凭证、会话或安全策略校验失败，When 调用认证操作，Then 保持现有错误、失败计数和锁定策略。
- Given 用户撤销当前或指定会话，When 调用 logout/revoke，Then 保持原撤销范围与 refresh 失效语义。

## 5. 阶段门

1. **设计门**：四个术语写入 `CONTEXT.md`；每个 seam 的 ownership 与非目标明确。
2. **契约门**：新增 contract tests；controller 不再直接依赖对应实现模块。
3. **行为门**：原模块测试、全量 typecheck/build/test 通过，且无 DTO/数据库变更。
4. **删除门**：静态扫描确认跨模块调用者不再依赖旧实现；旧 service 仅保留为内部 implementation/兼容 adapter。
5. **交付门**：提交、推送并记录 commit；若测试环境缺少外部依赖，只允许以明确证据标记阻塞。

## 6. 非目标与待确认事项

- 本期不拆微服务、不迁移数据库、不改变用户可见业务流程。
- 是否在后续阶段删除旧 service 的 public export，取决于跨模块调用者扫描和兼容窗口；本期只完成可验证的 seam 收口。
- 身份会话的进一步 credential adapter 替换需另行完成安全 threat model，本期只收口调用 seam。
