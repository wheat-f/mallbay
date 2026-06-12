# 订单创建需求对齐实施计划

- 文档类型：功能实施计划
- 状态：进行中
- 适用范围：MallBay Web 管理端订单创建、订单列表、订单详情、客户历史和收款链路
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)、`docs/漆面保护膜施工管理系统-需求规格说明书-V1.7.docx`、当前代码库 `apps/api/src/orders/` 与 `apps/web/app/orders/`

## 文档规范符合性

- 本文作为功能实施计划，存放在 `docs/features/`，符合 [文档规范](../DOCUMENTATION_GUIDELINES.md) 的功能文档分类。
- 本文只记录需求对齐计划和当前状态，MUST NOT 将尚未验收的能力描述为已交付。

## 1. 当前结论

V1.7 的创建订单要求不是单一表单提交，而是“客户识别 -> 客户/车辆基础信息 -> 产品与施工 -> 容量校验 -> 金额与定金 -> 客户历史提示 -> 后续客服/库存/施工流转”的完整链路。

当前代码库已经具备订单、订单明细、订单金额、收款账户、订单收款和施工容量的后端基础能力；Web 创建订单、订单列表、订单详情、订单金额变更和收款账户审计已经形成初版闭环。本文按小步可回滚原则推进，禁止一次性重写订单模块。

## 2. 需求差距清单

| 优先级 | 需求项 | 当前状态 | 处理策略 |
| --- | --- | --- | --- |
| P0 | 创建订单必须支持金额以元录入，后端仍以分保存 | 已完成 | `apps/web/src/features/orders/create-order-form.ts` 负责元/分转换。 |
| P0 | 创建订单时可录入定金、选择收款账户和收款日期 | 已完成初版 | Web 页面已接入 `orderApi.paymentAccounts` 和 `deposit` payload；无可用收款账户时可在创建订单页就地新增并自动选中；服务端会校验定金收款账户必须属于订单门店且启用。 |
| P0 | 创建订单时必须提示施工容量缺失或已满 | 已完成初版 | Web 页面展示容量提示并阻止提交；后端仍在事务内兜底校验。 |
| P0 | 销售创建订单必须遵守客户归属边界 | 已完成 | `CreateOrderUseCase` 复用客户查看权限，销售不能使用同门店其他销售名下客户创建订单。 |
| P0 | 外出施工订单必须填写外出地址 | 已完成 | `CreateOrderUseCase` 在服务端校验外出施工地址并归一化空白，避免写入空地址订单。 |
| P0 | 预约日期和预约时段必须成对提交 | 已完成 | `CreateOrderUseCase` 在服务端校验预约日期/时段一致性，并保存 trim 后的预约时段；Web 提交前会把 DatePicker 值格式化为 `YYYY-MM-DD`，并去除预约时段、外出地址和备注的首尾空白。 |
| P0 | 订单金额需展示产品费用、施工费、总额、已收、待收 | 已完成初版 | 创建页面和订单详情均已展示金额拆分，统一按元展示；服务端创建和商业变更时维护材料成本、销售提成和毛利快照。 |
| P1 | 录入手机号、车牌或 VIN 时自动查询客户历史 | 已完成初版 | 客户搜索支持手机号、车牌和 VIN，选择客户后展示历史卡片；最近施工记录已从 Phase 2 施工记录接入。 |
| P1 | 新客户下单时可同步创建客户和车辆基础信息 | 已完成初版 | 创建订单页已支持新建客户并录入一辆车，成功后自动回填客户并加载车辆。 |
| P1 | 个人/企业客户、来源、推荐人、车辆信息符合需求字段 | 已完成初版 | 创建订单页的新客户弹窗已覆盖个人/企业基础字段、来源、介绍人搜索和一辆车基础信息。 |
| P1 | 产品费用按产品型号自动带出，施工人工费按规则自动计算 | 已完成初版 | 产品单价自动带出；人工费按施工类型、施工地点和车型关键词给建议价，仍允许销售手动覆盖，并保存建议价、最终价和调整原因快照。 |
| P1 | 订单列表支持日期、状态、客户、手机号、车牌、施工类型过滤 | 已完成初版 | 已支持创建日期、订单状态、施工类型、付款状态和关键字搜索；关键字可按订单号、客户、企业、车牌、手机号 hash 和 VIN hash 定位订单；筛选条件已同步到 URL。 |
| P1 | 订单详情展示客户、产品、施工、金额、付款和定金扣减 | 已完成初版 | 详情页已按中文业务标签展示客户、车辆、施工、产品、金额拆分和收款记录。 |
| P2 | 客服可修改产品、数量和金额并留痕 | 已完成初版 | 已提供 `PATCH /orders/:id/commercials`、变更原因校验和 `GET /orders/:id/audit-events`。 |
| P2 | 支付账户修改必须填写原因 | 已完成初版 | 已提供 `PATCH /payment-accounts/:id`、`GET /payment-accounts/:id/audit-events`，修改与停用均写入审计事件。 |

## 3. 本轮已完成任务

MUST 保持行为可回滚，本轮只补齐已有接口可支撑的 Web 缺口：

- [x] 产品明细显示明确属性标签：品牌、名称、型号。
- [x] 创建订单金额输入由“分”改为“元”，提交前转换为整数分。
- [x] 创建订单容量检查显示缺失/满额原因，并提供进入施工容量页面的入口。
- [x] 施工容量新增页使用 DatePicker，并在提交前转换为 `YYYY-MM-DD` 字符串。
- [x] 创建订单支持录入定金、收款账户、收款类型和收款日期。
- [x] 创建订单提交定金时，服务端校验收款账户必须属于同一门店且处于启用状态。
- [x] 创建订单提交时，服务端校验当前销售只能使用自己名下客户。
- [x] 创建订单提交外出施工时，服务端校验外出地址不能为空。
- [x] 创建订单提交预约信息时，服务端校验预约日期和预约时段必须成对出现。
- [x] 创建订单提交前格式化预约日期 DatePicker 值为 `YYYY-MM-DD`，并去除预约时段、外出地址和备注首尾空白；空白备注不会提交给 API。
- [x] 创建订单录入定金但无可用收款账户时，展示财务管理维护入口。
- [x] 创建订单页支持就地新增收款账户，创建成功后刷新账户列表并自动选中。
- [x] 创建订单展示产品费用、施工人工费、订单总额、已收定金和待收金额。
- [x] 创建订单和商业字段变更时，服务端按 `总额 - 材料成本 - 销售提成` 维护毛利快照。
- [x] 创建订单选择客户后展示客户历史卡片，包括历史订单、车辆数、累计消费、未结金额、有效质保、待处理售后、系统标签和最近订单；最近订单状态统一使用中文业务标签。
- [x] 创建订单客户历史卡片展示最近施工记录，包括订单号、车辆、施工类型、状态、质检结果和实际用时。
- [x] 创建订单页支持新建客户并录入一辆车，创建成功后自动回填新客户并由客户详情加载车辆。
- [x] 新建客户成功但车辆创建失败时，仍回填已创建客户并提示去客户详情继续补车辆。
- [x] 创建订单页新客户弹窗支持个人/企业基础字段、性别、生日、来源、介绍人搜索和车辆基础信息。
- [x] 创建订单页新客户弹窗支持车辆照片 URL，随车辆基础信息写入客户车辆档案。
- [x] 订单列表支持创建日期、订单状态、施工类型、付款状态和基础关键字筛选。
- [x] 订单列表筛选条件同步到 URL，刷新或分享链接后可保留当前筛选。
- [x] 订单列表分页使用服务端 `page/pageSize`，分页状态同步到 URL。
- [x] 订单详情按中文业务标签展示客户、车辆、施工信息、产品明细、产品费用、施工人工费、订单总额、已收、未收和收款记录。
- [x] 创建订单页按施工类型、施工地点和车型关键词自动给出施工人工费建议价；销售可手动覆盖，最终 `laborCostCents`、建议人工费和调整原因作为订单金额快照保存。
- [x] 客户搜索支持手机号 hash、车牌模糊和 VIN hash 查询，创建订单页客户选择可用同一搜索链路定位历史客户。
- [x] 订单详情支持修改产品、数量、单价和施工人工费，必须填写变更原因，并写入订单审计事件。
- [x] 收款账户修改和停用必须填写原因，并可查询账户级审计事件。
- [x] 订单列表关键字搜索支持手机号 hash 和 VIN hash，避免对敏感明文做模糊查询。

## 4. 下一步实施顺序

### Task 1：客户历史查询卡片

目标：销售在创建订单时能看到客户历史，减少重复客户和未结订单风险。

MUST：

- 已扩展前端订单创建页，在客户选择后展示客户基础信息、车辆摘要、最近订单、最近订单状态和未结金额提示。
- 已优先复用 `customerApi.detail` 返回的 `orders`、`vehicles` 和 `archiveSummary`。
- 不改变创建订单 API 契约。

RECOMMENDED 后续增强：

- 将创建订单页客户搜索框文案明确为“姓名/企业/手机号/车牌/VIN”，便于销售知道可直接按车辆查找。
- 最近 3 条施工记录已从客户详情的 `archiveSummary.construction.recentRecords` 接入创建订单历史卡片。

验证：

```bash
corepack pnpm --filter @mallbay/web test -- src/features/orders/create-order-form.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

### Task 2：新客户下单入口

目标：满足需求文档“不是老客户则创建新客户并同步到客户档案”的流程。

MUST：

- 已在创建订单页提供“新建客户”入口，通过弹窗创建客户和一辆车辆。
- 已在创建成功后自动回填 `customerId`，车辆只有一辆时由订单页现有逻辑自动回填 `vehicleId`。
- 已复用客户模块 DTO 和 `customerApi.create`、`customerApi.createVehicle`，不在订单模块新增客户写接口。

RECOMMENDED 后续增强：

- 新客户弹窗已增加生日、介绍人搜索和车辆照片 URL；后续如需图片直传，可复用客户车辆档案的上传能力增强。
- 新客户创建链路已处理车辆创建失败恢复；如果车辆失败，页面会回填客户并提示去客户详情继续补车辆。

验证：

```bash
corepack pnpm --filter @mallbay/web test -- src/features/customers/create-customer-form.test.ts
corepack pnpm --filter @mallbay/web test -- src/features/orders/create-order-form.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

### Task 3：订单列表和详情需求对齐

目标：列表和详情能承接创建订单后的经营查看要求。

MUST：

- 已扩展订单列表 query：创建日期范围、施工类型、付款状态。
- 已在订单详情按客户、车辆、施工、产品、金额、收款记录分区展示。
- 已保证金额全部以元展示，后端字段继续使用 `amountCents`。

RECOMMENDED 后续增强：

- 订单列表的关键字搜索已覆盖订单号、客户、企业名、车牌、手机号 hash 和 VIN hash；不得对手机号或 VIN 做明文模糊查询。
- 分页控件和筛选条件 URL 同步已完成，方便销售分享或刷新后保留筛选。
- 客服修改产品、数量和金额必须通过独立变更 API 留痕，不直接复用创建接口；当前初版已通过 `PATCH /orders/:id/commercials` 落地。

验证：

```bash
corepack pnpm --filter @mallbay/api test
corepack pnpm --filter @mallbay/web test
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web typecheck
```

### Task 4：施工人工费规则快照

目标：产品费用和施工人工费不再完全依赖销售手填。

MUST：

- 已新增前端最小施工人工费建议规则，按施工类型、施工地点和车型关键词返回建议价。
- 已在创建订单时通过 `laborCostCents` 保留最终人工费快照，避免后续规则调整影响历史订单。
- 已允许销售手动调整，并提供“使用建议价”按钮恢复建议金额。
- 已通过 `OrderAmount.suggestedLaborCostCents` 和 `OrderAmount.laborCostAdjustmentReason` 记录建议人工费、最终人工费和调整原因；创建订单页在最终人工费不同于建议价时 MUST 要求填写原因，订单详情展示建议价、最终价和原因。

RECOMMENDED 后续增强：

- 将人工费规则从前端 helper 升级为后端配置模型，支持门店自定义、车型级别、外出距离和生效时间。

验证：

```bash
corepack pnpm --filter @mallbay/api test
corepack pnpm --filter @mallbay/web test
corepack pnpm lint
```

### Task 5：订单变更和收款账户审计

目标：订单关键商业字段和收款账户变更必须可追溯。

MUST：

- 已通过 `PATCH /orders/:id/commercials` 修改订单产品、数量、单价和施工人工费。
- 已要求订单商业变更填写 `changeReason`，空原因必须拒绝。
- 已通过 `GET /orders/:id/audit-events` 查询订单变更审计。
- 已通过 `PATCH /payment-accounts/:id` 修改或停用收款账户，必须填写 `changeReason`。
- 已通过 `GET /payment-accounts/:id/audit-events` 查询账户级审计。

RECOMMENDED 后续增强：

- 把订单变更权限从当前策略函数细化到独立客服岗位或 RBAC 权限项。
- 在订单详情中按字段级差异高亮展示审计记录，减少人工比对成本。

验证：

```bash
corepack pnpm --filter @mallbay/api test -- src/orders/orders.service.test.ts
corepack pnpm --filter @mallbay/web test -- src/features/orders/api.test.ts src/features/orders/order-display.test.ts
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web typecheck
```

## 5. 回滚原则

MUST：

- 每个 Task 单独提交，失败时只回滚该 Task。
- 任何新增字段必须有 migration 和数据库不变量测试。
- 前端页面改动必须保持旧订单 API 可用，不要求一次性迁移历史数据。
- 若后端校验失败，前端必须显示后端错误信息，不吞掉 `requestId`。

## 6. 当前剩余风险

- 客户历史和订单列表筛选需要确认当前 API 返回字段是否足够；如果不足，需补查询 DTO 和 service 测试。
- 支付账户为空时，创建订单页面已提示先去财务管理维护收款账户，并支持就地新增收款账户后自动选中。
- 创建订单带定金时，`CreateOrderUseCase` 已在事务内校验收款账户门店和启用状态，拒绝跨店或停用账户，避免写入不可用收款记录。
- 创建订单客户归属：`CreateOrderUseCase` 已复用 `PermissionPolicy.canViewCustomer`，销售使用同门店其他销售名下客户时会被服务端拒绝。
- 外出施工地址：`CreateOrderUseCase` 已在服务端校验外出施工必须填写地址，并在保存前去除首尾空白。
- 预约时间一致性：`CreateOrderUseCase` 已在服务端校验预约日期和预约时段必须成对提交，并在保存前去除预约时段首尾空白；Web 提交 payload 时也会先把预约 DatePicker 值转换为 `YYYY-MM-DD` 字符串，避免把组件对象传给 API。
- 创建订单文本字段：Web 提交前会去除预约时段、外出地址和备注首尾空白，空白备注不进入 API payload；服务端继续兜底校验外出施工地址非空。
- 订单金额快照：创建订单初始写入材料成本、销售提成和毛利快照；订单商业字段变更时保留已有材料成本和销售提成，重新计算毛利。
- 客服角色已通过 `StorePosition.CUSTOMER_SERVICE` 独立建模；客服可维护本店客户、创建/协同订单、匹配库存、生成质保、处理售后和申请返利，订单商业变更继续通过 `PATCH /orders/:id/commercials` 留痕；后续如需更细分审批，再迁移到 RBAC 权限项。
