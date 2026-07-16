# 销售订单施工收费与成本核算：本地发布演练记录

| 项目 | 记录 |
|---|---|
| 日期 | 2026-07-16 |
| 环境 | 本地 Docker PostgreSQL 17、API `localhost:3001`、Web `localhost:3000` |
| 范围 | 施工收费/成本语义、门店灰度、迁移、回退与订单页面冒烟检查 |
| 结论 | 迁移与回退演练通过；正式门店仍须完成施工标准和岗位费率发布后，才能人工切换到 `ACTIVE`。 |

## 1. 真实浏览器冒烟检查

- 打开 `http://localhost:3000/orders/create`，页面成功渲染且浏览器控制台无 `error` 或 `warn`。
- 产品下拉列表返回两条产品，并在业务名称中显示销售单位“米”。
- 页面同时显示“系统建议施工收费”“本单施工收费”以及仅店长可见的“内部成本与毛利”只读区域；成本缺失时明确提示“待补齐”，没有把施工收费伪装成预计成本。
- 本次检查不提交订单、不创建报价，不产生业务数据。

## 2. 临时数据库迁移

- 临时数据库：`mallbay_cost_qa_rollback_20260716`（演练后已删除）。
- `prisma migrate deploy --config apps/api/prisma.config.ts` 成功应用 34 个 migration。
- 已确认成本相关 migration 包含：
  - `20260716160000_construction_charge_cost_semantics`
  - `20260716170000_construction_cost_foundation`
  - `20260716180000_temporary_cost_approval`
  - `20260716190000_pricing_rollout_safe_default`

## 3. 回退演练

1. 在临时库创建门店、施工项目，并将门店设为 `SHADOW`。
2. 将门店运行模式切换为 `LEGACY`，模拟门店级回退。
3. 查询结果为 `mode = LEGACY`、`preserved_service_items = 1`。
4. 验证回退只改变运行模式，不删除施工标准、报价、订单、成本结算或审计快照。
5. 演练数据库已通过 `DROP DATABASE` 清理；检查结果为数据库数量 `0`。

## 4. 正式库迁移与灰度保护

- 正式本地库 `mallbay` 已应用 `20260716190000_pricing_rollout_safe_default`。
- 迁移前两个门店均为 `ACTIVE`，均有已发布规则集但启用施工标准数和已发布岗位费率数均为 `0`。
- 迁移后两个门店均自动调整为 `SHADOW`。该调整符合“配置未完整时不得启用 ACTIVE”的发布门禁，且不删除任何业务数据。

## 5. 后续放行条件

两个 `SHADOW` 门店均须完成以下配置并通过 `GET /pricing/rollout/precheck` 后，才可由店长切换至 `ACTIVE`：

1. 当前生效的已发布建议价版本。
2. 该版本至少一条启用的施工收费与标准工时规则。
3. 该版本关联的、已发布且含费率明细的岗位小时成本版本。

## 6. 最终代码验收（2026-07-16）

- API 全量测试通过（含施工成本确认、报价导出及权限回归）。
- Web 全量测试：`591/591` 通过。
- API 与 Web 全量 TypeScript 检查通过（TypeScript `6.0.3`）。
- Prisma schema 校验通过：`prisma validate --config apps/api/prisma.config.ts`。
- API 生产构建通过：Nest CLI `build -p apps/api/tsconfig.app.json`。
- Web 生产构建完成：Next.js 已完成编译、类型检查、全部 `56/56` 静态页面生成，并产出 `.next/BUILD_ID`、路由和预渲染清单。
- 验收期间修复两项回归缺口：施工成本确认不能重复提交同一施工人员；店长侧菜单测试已覆盖“施工成本确认”入口。

上述结果证明代码、测试和构建门禁已通过；并不替代目标门店的业务配置、SHADOW 对账、角色验收与正式 `ACTIVE` 放行。

## 7. 北京测试门店配置、SHADOW 对账与 ACTIVE 放行（2026-07-16）

- 验收门店：`北京测试`（`cmr4azrvs0001pkt7v184vodt`）。
- 本地正式库已确认四个施工收费/成本 migration 均有完成记录；数据库表已包含成本结算、成本调整、岗位费率、施工服务项目和施工标准模型。
- 发布建议价版本 `v2` 前，调用 `POST /pricing/rule-sets/:id/validate` 返回 `valid: true`；随后通过 API 发布。该版本已关联岗位小时成本版本 `v1`（已发布，施工师傅 `¥100/小时`、施工学徒 `¥50/小时`），并包含 1 条启用的施工收费/标准工时/班组标准。
- 在 `SHADOW` 模式以漆面保护膜、A 级车型、到店施工进行真实服务端试算，生成影子计算快照 `cmrnon7nx00013wt7nj2h075g`：旧口径总价 `¥1011`，建议总价 `¥1091`，差额 `¥80`（`791 bps`）。产品材料成本缺失被如实标记为 `MISSING`，没有生成虚假预计总成本或毛利。
- `GET /pricing/rollout/migration-precheck` 与 `GET /pricing/rollout/precheck` 均返回 `ready: true`。迁移预检显示该门店有 2 张历史订单，均保留收入语义，未伪造历史施工成本。
- 通过 `POST /pricing/rollout` 将验收门店从 `SHADOW` 切换为 `ACTIVE`。再次调用 `POST /pricing/calculate` 验证返回 `rolloutMode: ACTIVE`、正式 `pricingCalculationId` `cmrnopcf500033wt7pa7yfayr`、施工收费 `¥11`、标准施工成本 `¥150`，并仍对材料缺失返回 `MISSING`。
- 本次放行仅改变北京测试门店的新订单运行模式；历史订单、影子快照和审计记录均予以保留。

## 8. 导出接口复验（2026-07-16）

- 使用审核员令牌调用 `GET /orders/export-details?exportDimension=product`，返回 3 行服务端销售订单逐产品明细；授权角色响应包含内部成本、实际成本、毛利和成本结算状态字段。
- 调用 `GET /purchases/orders/export-details?exportDimension=product`，返回 1 行服务端采购订单逐产品明细。
- 调用 `GET /construction/cost-settlements/export` 成功返回空列表；验收门店尚无完工结算记录，因此没有伪造成本导出行。
- 报价单导出已改为 `GET /sales-quotes/export-details` 的服务端全量、逐产品行接口；本地验收门店当前无报价记录，接口返回空列表并由页面给出业务提示。销售角色会被服务端限制为本人报价，且响应不含内部成本和毛利字段。

## 9. 个人薪酬字段级权限复核（2026-07-17）

- 店长仍可通过施工成本确认工作台确认人员工时、查看订单级预计/实际成本汇总并导出汇总数据。
- `GET /construction/cost-settlements`、单笔成本对比及施工成本导出对店长移除个人岗位小时成本、基础人工成本、个人提成和补贴字段；字段级处理在服务端执行，前端隐藏不是唯一保护手段。
- 财务/管理员仍可取得上述核算明细，用于调整审批和财务结算。
- 回归验证：API 成本结算服务单测 7/7、Web 施工成本工作台测试 2/2，API/Web TypeScript 检查通过。

## 10. 北京测试四角色隔离验收与清理（2026-07-17）

- 经授权，在本地 Docker 的「北京测试」门店创建临时账号 `qa_sales`、`qa_finance`、`qa_manager`、`qa_worker`，分别绑定销售、财务、店长、施工员岗位；同时创建仅供验收的 `QA-COST-20260717` 订单、已完工施工记录和一条待确认成本结算。所有记录均使用 `qa_` 前缀，未修改原有业务用户或单据。
- 四个账号登录后均由 `GET /auth/me` 验证到正确岗位。销售读取本人的测试订单时，订单金额对象不含材料成本、利润、预计成本或价格计算快照；读取施工成本结算被服务端拒绝（HTTP 403）。
- 施工员仅能读取并提交本人任务的工时偏差；读取和提交响应均不含小时成本、基础成本、提成或补贴。该验收发现申报接口原会回传完整成本行，现已改为只返回申报字段并重新构建验证。
- 店长可读取并确认异常成本工时，但其响应中的施工人员行不含个人薪酬字段；店长尝试财务结算被拒绝（HTTP 403）。财务可读取完整个人成本明细，并成功将已确认测试成本结算为 `SETTLED`。
- 相关代码验证：API TypeScript 检查通过；API 全量测试 330/330 通过（其中 `construction-cost-settlement.service.test.ts` 8/8）；最新 API 生产构建成功，随后用其启动的本地服务完成上述 HTTP 验收。Web TypeScript 检查、Web 全量测试 593/593 及 `git diff --check` 同步通过。
- 验收结束后已按 `qa_` 前缀删除账号、成员关系、施工员档案、施工任务、成本结算、订单金额、订单和客户，并停止临时本地 API 进程。数据库核对中 users、members、profiles、orders、records、settlements、customers 和关联 audit_events 均为 `0`。

## 11. 缺失施工标准/材料成本展示回归（2026-07-17）

- 针对北京测试门店现有产品“隔热膜品牌1 / 隔热膜名称1 / 隔热膜型号1”（产品分类 `HEAT_FILM`、销售单位“卷”、数量 2）进行真实 `POST /pricing/calculate` 验收。该门店已发布的施工标准仅覆盖漆面保护膜，且此产品没有批次成本或产品标准成本；这是草稿显示“待补齐”的真实配置原因，不是订单金额计算错误。
- 服务端返回 `constructionChargeAvailable: false`、`suggestedLaborCostCents: null`、`hasMissingCost: true`、`estimatedConstructionCostCents: null`、`costCompleteness: MISSING`。因此未匹配施工标准时，页面不再把旧客户端分类默认值显示为“系统建议施工收费”；材料成本缺失也显示“待维护材料成本”，而不是误导性的 `¥0.00`。
- Web 只在 `constructionChargeAvailable` 为真时展示和允许采用系统建议施工收费；正式订单仍由服务端以缺失成本规则拦截，草稿可保留并由店长通过临时成本审批补齐。
- 为防止重复结算/调整，新增迁移 `20260717010000_construction_adjustment_idempotency`，对成本调整单的“结算单 + 幂等键”建立唯一约束；确认、结算、调整审批均使用状态条件更新并记录审计事件。
- 本轮最终验证：Prisma migration status/validate 通过；API 全量测试 `330/330`、Web 全量测试 `593/593` 通过；API 生产构建通过；Web 生产构建通过并生成 `60/60` 路由；临时 `qa_manager` 账号及其试算记录已清理，数据库核对剩余账号数为 `0`。
