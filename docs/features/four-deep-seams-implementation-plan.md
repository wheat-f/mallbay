# 四个业务 seam 深化实施计划

## 1. 实施原则

四个 module 并行实施，写入范围互斥；每个 seam 先建立小而稳定的 interface，再迁移 controller，最后用 contract test 与旧实现扫描证明 locality。保留原 implementation，采用 replace-don't-layer 的测试方式：调用方测试跨 seam，内部实现测试保留业务规则覆盖。

## 2. 任务分解

| ID | Module | 实施任务 | 验证 |
|---|---|---|---|
| P1 | `PricingGovernance` | 新增 domain seam；收口规则集、模板、rollout、施工成本治理调用；保持 `PricingDecision` 独立 | pricing contract、pricing tests、controller dependency scan |
| C1 | `CustomerAccount` | 深化现有 seam；收口客户/车辆账户关系与标签调用；保留订单上下文归属 | customer contract、customer service tests、controller scan |
| G1 | `ProductCatalog` | 新增目录 seam；收口产品 CRUD、单位、建议售价、标准成本 | product contract、products service tests、controller scan |
| I1 | `IdentitySession` | 新增身份会话 seam；收口认证、refresh、logout、session revoke | auth contract、auth service tests、cookie/session regression |
| V1 | 统一验证 | typecheck、build、全量 test、旧实现引用扫描、git diff 检查 | 四个阶段门全部通过 |

## 3. 退出条件

- controller 不再直接注入候选 seam 的旧 implementation（允许同模块内部兼容注入）。
- contract tests 验证 public interface 的业务结果、错误和权限语义。
- 没有数据库 schema、DTO、cookie、金额快照或业务状态变化。
- `npm run typecheck`、`npm run build`、`npm test` 全部通过，或将环境阻塞明确记录。
- 变更集中在四个 module、文档、`CONTEXT.md` 与测试，未覆盖用户现有未提交文件。

## 4. 交付顺序

1. 四个 seam 实现与局部 contract tests。
2. 统一类型检查和构建。
3. 统一全量测试与静态依赖扫描。
4. 依据评审结论补充文档证据。
5. 提交并推送 GitHub。
