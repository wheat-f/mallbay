# V1.7 全功能需求差距与验收计划

- 文档类型：功能差距分析与实施计划
- 文档状态：进行中
- 适用范围：MallBay Web 管理端、API、Prisma 数据模型与 V1.7 漆面保护膜施工管理需求的全模块对齐
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)、[订单创建需求对齐实施计划](./order-requirements-alignment-plan.md)、`docs/漆面保护膜施工管理系统-需求规格说明书-V1.7.docx`、当前代码库 `apps/api/src/`、`apps/web/app/`、`apps/web/src/features/`
- 本地验收：[V1.7 本地验收审计](./v1-7-local-verification-audit.md)

## 文档规范符合性

MUST：

- 本文作为功能差距分析与实施计划，存放在 `docs/features/`，符合 [文档规范](../DOCUMENTATION_GUIDELINES.md)。
- 本文只记录当前代码证据能够支撑的完成度，MUST NOT 把初版页面或接口描述为完全满足 V1.7。
- 后续每个缺口必须按可提交、可验证、可回滚的小任务推进。

MUST NOT：

- 不允许一次性重写客户、订单、库存、施工或财务模块。
- 不允许只通过隐藏前端入口宣称权限完成；权限必须由 API policy 或 use-case 兜底。
- 不允许用文档替代测试、迁移或运行验证。

## 1. 总体结论

当前代码库已经从原始门店账号系统扩展到 V1.7 的主要业务域，具备客户、订单、施工、库存采购、质保、售后、提成、财务、发票、返利、报表和离线同步的初版模块。

但从 V1.7 需求完整度看，当前仍处于“主链路初版可跑通”阶段，不应视为完全满足需求。主要差距集中在：

- 角色口径已按建设方案收敛：当前系统遗留 `User.isAuditor` 只作为管理员能力的兼容标记，前端管理员入口和成员管理错误提示不再面向业务人员显示“审核员”角色；客服已通过 `StorePosition.CUSTOMER_SERVICE` 独立建模并接入权限策略与门店工作台；后续如果拆分老板、管理员等角色，MUST 先通过权限策略函数演进，不能在页面文案中重新引入独立审核员角色。
- 客户档案已按基础信息、客户画像、车辆、沟通记录、订单、质保和售后分区展示；客户偏好、特殊要求通过结构化记录类型维护，消费趋势由订单金额自动聚合展示。
- 订单创建已经补齐大部分销售录入和金额展示；录入定金时可选择已有收款账户，也可就地新增收款账户后自动选中，服务端会拒绝跨店或停用收款账户；销售创建订单时服务端会校验客户归属，不能使用同门店其他销售名下客户；外出施工订单服务端会校验外出地址；预约日期和预约时段必须成对提交，Web 提交前会把预约 DatePicker 值格式化为 `YYYY-MM-DD`，并去除时段、外出地址和备注首尾空白；订单创建和商业字段变更会维护材料成本、销售提成和毛利快照；创建订单会记录建议人工费、最终人工费和调整原因，人工费不同于建议价时必须填写原因，订单详情可追溯该差异；订单列表关键字搜索支持订单号、客户、企业、车牌、手机号 hash 和 VIN hash，筛选和分页条件已同步到 URL；创建订单客户历史卡片已展示最近订单状态和最近施工记录，状态统一为中文业务标签；订单明细/金额变更与支付账户变更已要求填写原因并写入持久化审计事件，订单详情已可查看订单变更审计，审计操作人展示为姓名/账号业务标签。
- 库存采购已经具备模型/API 和订单匹配 Web 视图；订单批次锁定支持输入/扫描批次号过滤候选批次，批次拆分后会展示原批次剩余、新批次和换算关系；库存批次表已提供“批次追溯”入口，可一键切换到该批次的库存流水；采购需求列表已用订单号、客户、车辆和产品摘要展示来源订单；待匹配订单、已锁批次、采购需求和采购订单状态已改为中文业务标签；采购订单已支持草稿审批通过后再入库，`DRAFT` 采购单禁止到货入库；采购订单可填写取消原因并写入审计事件，`CANCELLED` 采购单禁止继续入库；采购订单明细已展示产品、规格、类别、质保和入库批次追溯，并支持批量扫码入库逐行返回成功/失败；采购订单列表已按预计到货日展示未设置、今日、明日、逾期和已入库提醒；供应商档案已支持新增、编辑、启停、联系人档案和评级历史，并与采购单/批次供应商快照合并展示；供应商档案、采购订单和采购需求列表已收紧为库存管理权限，销售不能直接读取采购后台数据；库存流水已支持按产品、批次、订单、流水类型和操作人筛选，订单和操作人筛选已改为业务选择器，并在筛选结果上展示入库、出库、锁定、释放、调整和流水条数统计。
- 质保、售后、财务、发票、返利和报表已有入口；质保到期提醒、电子质保卡、发票本地 PDF 生成、发票发送记录、报表经营分析、销售月度趋势、施工月度趋势、售后月度趋势、提成月度趋势、库存月度趋势、财务月度趋势、发票月度趋势、返利月度趋势、库存摘要、提成摘要和财务摘要已补齐初版；报表作用域已支持店长和财务默认查看本店、管理员不传 `storeId` 查看全量经营汇总，销售可从工作台进入“我的业绩”并仅查看本人订单、本人订单发票/返利和本人销售提成，财务工作台已提供经营报表入口；费用/报销提交权限已收敛到管理员、店长、财务和采购，销售等其他门店成员不能直接调用费用申请 API；发票申请和发票列表已收紧为销售只能处理/查看自己的订单发票，财务/店长/管理员仍可处理本权限范围内订单；返利申请和返利列表已收紧为销售只能处理/查看自己的订单返利，店长/管理员仍可按门店处理；施工任务和派工列表状态已改为中文业务标签，施工详情顶部优先展示订单号并用中文标签展示施工状态和质检结果，施工记录列表对销售已收紧为只返回本人订单对应施工记录，施工照片表已用施工人员业务标签替代上传人 ID，施工照片阶段已改为中文业务标签，施工派工、售后派工/判责和师傅提成调整的施工人员选择器已统一使用姓名/账号/技能标签展示；质保创建已从手填订单 ID 改为选择已完工订单，质保列表和电子质保卡已用订单号、客户和车牌替代订单技术 ID 展示，销售查看质保列表或详情时已收紧为只能访问本人订单对应质保；售后创建已从手填订单 ID 改为选择当前门店订单，售后派单和判责也已改为选择售后单与施工人员；售后列表已用订单号、客户、车牌、问题和状态替代技术 ID 展示，销售查看售后列表时只返回本人订单对应售后单，师傅/学徒角色查看售后列表时只返回指派给自己的售后单；发票申请已改为选择可开票订单，发票开具、重开、作废和发送已改为选择发票；发票列表已用发票号、订单号、客户和车牌替代技术 ID 展示；返利申请已改为选择返利订单，返利审核和发放已改为选择返利申请；返利列表已用订单号、客户、车牌、原因和状态替代技术 ID 展示；提成生成已从手填订单 ID、施工记录 ID 和人员 ID 改为选择订单、施工记录和施工人员，施工记录选择器状态和提成规则类型已改为中文业务标签；财务报销创建已改为选择关联费用，报销审批已改为选择报销申请，费用/报销申请和财务流水列表已使用标题、金额、状态或备注等业务标签替代申请 ID 与来源 ID 主展示，收款账户审计操作人也已改为姓名/账号业务标签；报销已分离“审批通过”和“已打款”的付款流水生成，返利发放已补充“审批通过后才能发放”的服务端门禁，复杂审批、税控/版式级发票能力和更复杂 BI 图表仍需后续增强。
- 售后责任判定中的处罚金额已按业务端“元”录入，提交 API 前转换为整数分，避免业务人员直接填写 `penaltyAmountCents`。
- 微信小程序已从静态骨架推进到师傅端同步初版，支持从 API 拉取任务到本地缓存、任务详情、离线开工/完工状态入队、开工时记录本地 `startedAt`、完工时记录本地 `completedAt`、`wx.chooseMedia` 拍照入队并记录本地 `takenAt`、离线请假入队、离线队列手动同步、前台自动同步、小程序内连接配置和微信 code 登录初版；离线同步失败会在 3 次以内保持待同步，第 3 次失败后标记失败，离线队列达到 100 条时状态和拍照入队会提示先联网同步；真机调试、微信平台联调和发布前验收已拆入 [Phase 6 微信小程序联调与发布实施计划](./phase-6-mini-program-integration-plan.md)。

## 2. 需求覆盖矩阵

| 模块 | V1.7 目标 | 当前代码证据 | 完成度 | 优先级 |
| --- | --- | --- | --- | --- |
| 账号与组织 | 账号、门店、角色、权限、通知 | `auth/`、`stores/`、`members/`、`notifications/`、`PermissionPolicy` | 基础完成，客服岗位和管理员/遗留高权限标记口径已收敛，RBAC 仍简化 | P1 |
| 客户档案 | 个人/企业、车辆、标签、偏好、沟通、历史消费、售后、质保 | `customers/`、`/customers`、`/customers/[id]` | 初版完成，月度消费趋势已补齐 | P0 |
| 订单创建 | 客户识别、车辆、产品、施工、容量、定金、金额、历史提示 | `orders/`、`/orders/create`、`order-requirements-alignment-plan.md` | 主链路初版完成 | P0 |
| 订单管理 | 查询筛选、状态、详情、收款、变更留痕 | `/orders`、`/orders/[id]`、`ListOrdersDto`、`PATCH /orders/:id/commercials`、`GET /orders/:id/audit-events` | 主链路初版完成，订单变更审计可查 | P0 |
| 施工容量与派单 | 容量、主管派单、师傅任务、照片、完工、质检 | `construction/`、`/construction/*` | 初版完成 | P1 |
| 库存采购 | 库存匹配、锁库、采购需求、采购订单、批次入库、单位转换、拆分、其他出入库、流水筛选与统计 | `inventory/`、`/inventory`、`phase-3-inventory-purchase-improvement-plan.md` | 主链路初版完成，采购审批、取消原因审计、采购入库追溯、批次追溯入口、批量扫码入库、预计到货提醒、库存流水筛选和筛选结果统计已补齐 | P0 |
| 产品管理 | 品牌、名称、型号、类别、规格、价格、质保、库存规格 | `products/`、`/products` | 初版完成 | P0 |
| 质保 | 完工生成质保、编号查询、照片追溯、到期提醒、电子卡 | `warranties/`、`/warranties` | 初版完成，到期提醒和电子卡已补齐 | P1 |
| 售后 | 售后申请、派单、责任判断、处罚、跟踪 | `after-sales/`、`/after-sales` | 初版完成 | P1 |
| 提成 | 销售提成、师傅提成、规则、日志、调整 | `commissions/`、`/commissions` | 初版完成 | P1 |
| 财务 | 费用、报销、审批、打款流水、收款账户 | `finance/`、`/finance`、`orders/payment-accounts` | 初版完成，报销审批和打款流水已分离 | P1 |
| 发票 | 申请、开具、作废、重开、发送 | `invoices/`、`/invoices` | 初版完成，开票可自动生成仅含业务字段的本地 PDF 文件 URL，发送可写入发票日志 | P2 |
| 返利 | 申请、业务审核、财务审批、发放、日志 | `rebates/`、`/rebates` | 初版完成，返利状态已拆为 `APPLIED -> REVIEWED -> APPROVED -> PAID`，发放前强制财务审批通过 | P2 |
| 报表 | 销售、收款、施工、提成、库存、售后、财务、发票、返利 | `reports/`、`/reports` | 摘要、经营分析、销售月度趋势、施工月度趋势、售后月度趋势、提成月度趋势、库存月度趋势、财务月度趋势、发票月度趋势和返利月度趋势初版；店长/财务默认本店，管理员支持全量汇总 | P2 |
| 小程序离线 | 师傅端任务、拍照、离线请假、离线队列、同步、微信登录 | `apps/mini`、`POST /construction/offline-sync`、`POST /auth/wechat-login`、`phase-6-mini-program-integration-plan.md` | 前台自动同步、离线请假、3 次失败重试、100 条缓存上限提示、连接配置和微信 code 登录初版；真机联调、微信平台配置和发布验收已独立排期 | P2 |

完成度定义：

- `基础完成`：当前业务角色可完成主要操作，仍可能缺少高级配置。
- `初版完成`：有 API 和页面闭环，但体验、审计或异常流程不足。
- `部分完成`：只覆盖核心字段或基础操作，距离 V1.7 仍有明确缺口。

## 3. 高优先级缺口清单

### P0-1 客户档案消费趋势初版完成

现状：

- 已有个人/企业客户、车辆、标签、备注和客户详情。
- 客户搜索已支持手机号 hash、车牌和 VIN hash。
- 客户详情已展示基础信息、客户画像摘要、车辆、标签、跟进记录、质保记录、售后记录和最近订单。
- 客户偏好、特殊要求和沟通内容已通过 `CustomerNoteType` 结构化维护，并在客户详情中分开展示。
- 客户消费趋势已由后端按订单创建月份聚合最近 6 个月订单数、消费金额、已收金额和待收金额，并在客户详情页展示趋势条。

差距：

- 更复杂的客户价值趋势、复购周期预测和多维筛选仍可后续增强，但不阻塞客户档案主链路。

MUST：

- 自动生成字段不得在客户基础表中手填覆盖，必须由订单、质保和售后聚合或快照生成。
- 新建客户表单 MUST 至少覆盖基本信息；车辆、偏好、备注可作为后续维护入口。

RECOMMENDED：

- 后续可增加客户价值趋势、复购周期预测和多维筛选，不影响当前客户基础建档链路。

### P0-2 产品与库存业务语言已初步对齐

现状：

- 产品创建类别选择项是中文，但列表曾直接展示 `PPF` 等枚举。
- 本轮已新增 `apps/web/src/features/products/display.ts`，产品列表改为中文类别和单位。
- 产品表单已以元录入基础价，提交前转换为整数分。
- 产品表单已暴露库存单位、销售单位、卷宽、卷长、每卷米数和数量精度。

差距：

- 产品字段已能支撑 V1.7 初版，后续主要是品牌/型号字典化和更好的规格录入体验。

MUST：

- 前端所有面向业务人员的产品类别、施工类型、单位和金额都必须显示中文业务语言。
- 金额输入 MUST 使用元，API payload 仍使用整数分。

### P0-3 库存采购剩余体验缺口

现状：

- API 已具备待匹配订单、订单匹配、批次锁定、采购需求、采购订单、到货入库、拆分和其他出入库。
- `/inventory` 已按标签页提供基础操作。
- 订单匹配详情已按订单明细展示需求、已锁、可用、缺口和已锁批次，并支持缺货生成采购需求。
- 订单批次锁定已支持输入/扫描批次号过滤候选批次，降低长批次列表下的选择成本。
- 批次拆分后页面已展示原批次剩余、新批次生成和卷米换算关系。
- 库存批次表已提供“批次追溯”入口，点击后会切换到“锁库与流水”页签并按当前批次执行服务端流水筛选。
- 采购订单已新增 `POST /inventory/purchase-orders/:id/approve`，草稿采购单审批后进入 `ORDERED`；到货入库会拒绝 `DRAFT` 采购单。
- 采购订单已新增 `POST /inventory/purchase-orders/:id/cancel`，取消必须填写原因，原因写入 `AuditEvent`；到货入库会拒绝 `CANCELLED` 采购单。
- 采购订单明细已展示产品名称、型号、规格、品牌、类别、质保时间、采购数量、已入库数量、供应商、批次号和入库日期，并支持采购明细到货入库。
- 采购明细支持批量扫码入库，每行按“批次号 数量 供应商”解析；`POST /inventory/purchase-orders/items/:id/receive-batches` 逐行返回成功和失败结果，单行失败不阻断后续入库。
- 采购订单列表已展示预计到货日，并通过 `getPurchaseOrderArrivalReminder` 提醒未设置预计到货、今日到货、明日到货、逾期天数和已全部入库状态。
- 供应商档案已新增 `Supplier`、`SupplierContact`、`SupplierRatingHistory` 模型，`GET/POST/PATCH /inventory/suppliers`、`POST /inventory/suppliers/:id/contacts`、`POST /inventory/suppliers/:id/rating-history` API 和 `/inventory` 的“供应商档案”页签；列表会合并主数据与历史采购单/批次上的供应商名称快照，主数据行可维护联系人档案和评级历史。
- 库存流水 API 已支持按 `productId`、`batchId`、`orderId`、`movementType`、`createdById` 查询；`/inventory` 的“锁库与流水”页签已提供对应筛选表单，并按当前筛选结果展示入库合计、出库合计、锁定合计、释放合计、调整合计和流水条数。

差距：

- 更细的采购流程仍可继续优化，例如采购订单多级审批、自动通知采购到货风险和更完整的批次审计详情。

MUST：

- 库存锁库和出库必须继续走 `OrderInventoryAllocation` 和 `InventoryMovement`。
- 前端不得要求业务人员手填产品 ID、订单 ID 作为主路径。

### P0-4 订单变更与收款账户审计

现状：

- 订单创建、列表筛选、详情展示和收款初版已完成。
- 订单明细/金额变更与收款账户变更已写入 `AuditEvent` 持久化审计事件。
- 订单详情已通过 `GET /orders/:id/audit-events` 展示订单变更原因、操作人和时间。

差距：

- 收款账户修改必须填写原因已完成，审计事件已持久化，并已提供 `GET /payment-accounts/:id/audit-events` 账户级审计查询 API；财务管理页已提供收款账户列表和账户审计弹窗。

MUST：

- 订单金额、产品明细、收款账户等关键字段变更必须生成审计记录。
- 前端不得直接复用创建订单 payload 覆盖历史订单。

RECOMMENDED：

- 后续做独立收款账户管理页时，应继续复用 `AuditEvent`，避免重新定义审计模型。

## 4. 渐进式实施路线

### Step 1：业务语言与金额单位统一

目标：先消除业务人员直接看到枚举、分单位或技术字段的问题。

任务：

- [x] 产品类别、产品单位列表显示中文业务标签。
- [x] 产品基础价表单从“分”改为“元”，提交前转分。
- [x] 库存页产品、批次和流水展示统一使用产品 display helper。
- [x] 库存流水类型建立 display helper，避免直接展示枚举。
- [x] 库存流水支持按产品、批次、订单、类型和操作人筛选。
- [x] 库存流水支持按当前筛选结果展示入库、出库、锁定、释放、调整和流水条数统计。
- [x] 施工类型、质保状态、售后责任和财务状态继续收敛到统一 display helper。

验证：

```bash
corepack pnpm --filter @mallbay/web test -- src/features/products/display.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

### Step 2：产品库存规格表单补齐

目标：让产品管理真正支撑 V1.7 的卷米换算和库存拆分。

任务：

- [x] 产品表单增加库存单位、销售单位、卷宽、卷长、每卷米数、数量精度。
- [x] 新增 helper 计算产品库存规格展示文案。
- [x] 产品列表展示规格摘要，不再只显示自由文本 `specification`。

验证：

```bash
corepack pnpm --filter @mallbay/web test -- src/features/products/display.test.ts
corepack pnpm --filter @mallbay/api test -- src/products/products.service.test.ts
```

### Step 3：库存匹配业务视图改造

目标：让客服/采购按订单完成库存匹配，而不是操作技术表单。

任务：

- [x] 待匹配订单列表展示客户、车辆、产品明细和预约日期。
- [x] 订单匹配详情按订单明细展示候选批次、可用量、已锁量、缺口。
- [x] 缺货时在同一视图生成采购需求。
- [x] 出库和释放展示已锁定批次明细。

验证：

```bash
corepack pnpm --filter @mallbay/web test -- src/features/inventory/api.test.ts
corepack pnpm --filter @mallbay/api test -- src/inventory/inventory.service.test.ts
```

### Step 4：客户档案分区与自动生成字段

目标：把需求文档中的客户档案拆成基础信息、人工维护信息和自动统计信息。

任务：

- [x] 客户详情增加客户画像摘要、车辆、订单、质保、售后、备注/沟通记录分区。
- [x] 自动统计字段从订单、质保和售后聚合，不新增可手填字段。
- [x] 新建客户只要求基本信息，车辆和偏好作为后续维护入口。

验证：

```bash
corepack pnpm --filter @mallbay/api test -- src/customers/customers.service.test.ts
corepack pnpm --filter @mallbay/web test -- src/features/customers/create-customer-form.test.ts
```

### Step 5：订单和收款审计

目标：补齐订单变更和支付账户变更的可追溯要求。

任务：

- [x] 复用审计日志记录订单变更前后摘要。
- [x] 新增订单明细/金额变更 use-case，限定当前销售、店长、管理员可操作。
- [x] 支付账户变更必须填写原因，并记录操作人、时间和变更原因。
- [x] 订单产品明细、数量、金额变更必须通过独立 use-case，记录变更前后摘要和原因。

验证：

```bash
corepack pnpm --filter @mallbay/api test -- src/orders/orders.service.test.ts
corepack pnpm --filter @mallbay/api test -- src/prisma/database-invariants.test.ts
```

### Step 6：财务类页面金额单位统一

目标：消除财务、发票、返利、提成和报表页面直接展示“分”或要求业务人员按分录入的问题。

任务：

- [x] 报表页订单总额、已收款改为元展示，保留 API 整数分结构。
- [x] 财务费用、报销和流水金额输入/展示改为元，提交前转分。
- [x] 发票申请金额输入/列表展示改为元，提交前转分。
- [x] 返利申请金额输入/列表展示改为元，提交前转分。
- [x] 提成规则固定金额、师傅基础提成和调整金额输入/展示改为元，提交前转分。
- [x] 售后责任判定处罚金额输入改为元，提交前转成 `penaltyAmountCents`。
- [x] 售后创建入口改为订单选择器，不再要求业务人员手填订单 ID 作为主路径。
- [x] 售后派单和判责改为售后单选择器，派单人员和处罚人员改为施工人员选择器。
- [x] 售后列表改为订单业务摘要展示，不再把售后 ID 和订单 ID 作为主展示列。
- [x] 质保创建入口改为已完工订单选择器，不再要求业务人员手填订单 ID。
- [x] 质保列表和电子质保卡改为订单业务摘要展示，不再把订单 ID 作为主展示字段。
- [x] 发票申请改为可开票订单选择器，发票开具、重开、作废和发送改为发票选择器。
- [x] 返利申请改为返利订单选择器，返利审核和发放改为返利申请选择器。
- [x] 发票/返利列表改为订单业务摘要展示，不再把技术 ID 作为主展示列。
- [x] 售后、质保、发票和返利在订单摘要缺失时显示“订单未加载”，不再把订单技术 ID 作为兜底业务文案。
- [x] 提成生成改为销售订单、施工记录和施工人员选择器，不再要求业务人员手填订单 ID、施工记录 ID 或人员 ID。
- [x] 财务报销创建改为关联费用选择器，报销审批改为报销申请选择器。
- [x] 财务申请和流水列表改为业务标签展示，不再把申请 ID 或来源 ID 作为主展示列。
- [x] 订单变更审计和收款账户审计操作人改为姓名/账号业务标签展示，不再把操作者 ID 作为主展示。
- [x] 采购需求来源订单改为订单业务摘要展示，不再把来源订单 ID 作为主展示列。
- [x] 待匹配订单、已锁批次、采购需求和采购订单状态改为中文业务标签，不再直接展示状态枚举。
- [x] 施工照片上传人改为施工人员业务标签展示，不再把上传人 ID 作为主展示列。
- [x] 施工照片阶段改为中文业务标签，不再直接展示 `BEFORE/DURING/AFTER`。
- [x] 施工任务和派工列表状态改为中文业务标签，不再直接展示 `DISPATCHED/IN_CONSTRUCTION/COMPLETED`。
- [x] 施工任务和派工列表订单号缺失时显示“订单未加载”，不再把订单技术 ID 作为订单号兜底展示。
- [x] 施工详情顶部优先展示订单号，施工状态和质检结果改为中文业务标签，不再把路由订单 ID 或质检枚举作为主展示。
- [x] 施工派工、售后派工/判责、师傅提成调整的施工人员选择器改为施工人员业务标签展示，不再用人员 ID 拼接成下拉文案。
- [x] 施工人员摘要缺失时显示“施工人员未加载”，不再截取用户 ID 后四位作为业务文案。
- [x] 师傅提成的施工记录选择器状态改为中文业务标签，不再直接展示施工状态枚举。
- [x] 提成规则类型改为中文业务标签，不再直接展示规则类型枚举。
- [x] 库存流水订单和操作人筛选改为订单/用户选择器，不再要求业务人员手填订单 ID 或用户 ID。
- [x] 库存产品、采购需求、订单匹配和库存流水在产品/批次摘要缺失时显示“产品未加载”或“批次未加载”，不再把产品或批次技术 ID 作为业务文案。
- [x] 提成页订单/施工记录摘要缺失时显示“订单未加载”，财务流水来源缺失时显示“来源未加载”，不再把相关技术 ID 作为兜底展示。

验证：

```bash
corepack pnpm --filter @mallbay/web test -- src/features/reports/display.test.ts
corepack pnpm --filter @mallbay/web test -- src/features/finance/display.test.ts
corepack pnpm --filter @mallbay/web typecheck
```

### Step 7：订单变更审计查询闭环

目标：让订单关键字段变更不仅写日志，还能在业务页面追溯。

任务：

- [x] 新增 `AuditEvent` 持久化模型和 migration，按 `targetType + targetId + createdAt` 支持目标对象审计查询。
- [x] 订单明细/金额变更和收款账户变更写入 `AuditEvent`，同时保留结构化日志输出。
- [x] 新增 `GET /orders/:id/audit-events`，复用订单可见性边界。
- [x] 新增 `GET /payment-accounts/:id/audit-events`，复用收款管理权限边界。
- [x] 订单详情页展示订单变更审计记录，包含变更类型、原因、操作人和时间。
- [x] 财务管理页展示收款账户列表，并可查看账户级审计记录。

验证：

```bash
corepack pnpm --filter @mallbay/api test -- src/orders/orders.service.test.ts src/prisma/database-invariants.test.ts
corepack pnpm --filter @mallbay/web test -- src/features/orders/api.test.ts
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web typecheck
```

## 5. 当前已执行修复

本轮已完成：

- 产品显示 helper：`apps/web/src/features/products/display.ts`。
- 产品 helper 测试：`apps/web/src/features/products/display.test.ts`。
- 产品管理列表类别由枚举值改为中文业务标签，单位也显示为中文。
- 产品表单 helper：`apps/web/src/features/products/product-form.ts`，产品基础价以元录入并在提交前转换为 `basePriceCents`。
- 产品库存规格表单：`apps/web/app/products/page.tsx` 已暴露库存单位、销售单位、卷宽、卷长、每卷米数和数量精度，并使用结构化规格摘要展示。
- 库存订单显示 helper：`apps/web/src/features/inventory/display.ts`，库存待匹配订单列表已展示客户、车辆和产品明细摘要。
- 库存匹配 helper：`apps/web/src/features/inventory/matching.ts`，库存匹配详情已展示订单明细的需求、已锁、可用和缺口，并支持基于缺口生成采购需求、查看已锁批次、确认出库和释放锁库。
- 库存批次号过滤：`apps/web/src/features/inventory/matching.ts` 新增 `filterInventoryBatches`；`/inventory` 的订单批次锁定支持输入或扫码批次号过滤候选批次。
- 库存拆分结果展示：`apps/web/src/features/inventory/display.ts` 新增 `getInventoryBatchSplitSummary`；`/inventory` 的批次拆分完成后展示原批次剩余、新批次生成和换算关系。
- 库存流水筛选：`GET /inventory/movements` 已支持产品、批次、订单、流水类型和操作人筛选；`/inventory` 的“锁库与流水”页签已提供对应筛选表单。
- 批次追溯入口：`/inventory` 的“库存批次”页签新增 `traceBatchMovements`，可从批次表一键切换到“锁库与流水”并按批次筛选。
- 采购订单审批：新增 `InventoryService.approvePurchaseOrder` 和 `POST /inventory/purchase-orders/:id/approve`；`/inventory` 对 `DRAFT` 采购单展示“审批通过”，未审批采购单禁止执行到货入库。
- 采购订单取消原因：新增 `InventoryService.cancelPurchaseOrder` 和 `POST /inventory/purchase-orders/:id/cancel`；`/inventory` 取消采购单时要求填写原因，服务端写入 `AuditEvent` 并拒绝已取消采购单继续入库。
- 采购入库详情展示：`apps/web/src/features/inventory/display.ts` 新增 `getPurchaseInboundItemDetails`；`/inventory` 的采购订单可展开查看产品品牌、名称、型号、类别、规格、质保、采购数量、已入库数量和入库批次，并可对采购明细执行到货入库。
- 采购批量扫码入库：`POST /inventory/purchase-orders/items/:id/receive-batches` 支持采购明细批量入库并逐行返回成功/失败；`apps/web/src/features/inventory/inbound-scan.ts` 解析批次扫码文本，`/inventory` 采购订单明细已提供批量扫码入库入口。
- 采购入库追溯 API：`apps/api/src/inventory/inventory.service.ts` 的采购订单列表返回产品详情和采购明细对应的入库批次；采购明细入库写入 `sourceType/sourceId`，用于后续按采购明细追溯批次号和入库日期。
- 采购预计到货提醒：`apps/web/src/features/inventory/display.ts` 新增 `getPurchaseOrderArrivalReminder`；`/inventory` 的采购订单表展示预计到货日和未设置、今日、明日、逾期、已入库提醒。
- 供应商联系人与评级历史：`SupplierContact` 和 `SupplierRatingHistory` 已补齐；`/inventory` 供应商档案展开行可新增联系人、追加评级历史，评级历史会同步供应商当前评级。
- 采购需求明细业务化：`apps/web/src/features/inventory/display.ts` 新增 `getPurchaseRequirementItemsSummary`；`/inventory` 的采购需求列表用产品、采购数量和单位展示需求明细，不再把采购需求 ID 作为主展示列。
- 库存匹配 API：`apps/api/src/inventory/inventory.service.ts` 的订单匹配详情已返回库存分配对应的批次信息，支持前端追溯批次号。
- 客户档案分区：`apps/web/app/customers/[id]/page.tsx` 已展示基础信息、客户画像摘要、车辆、标签、跟进记录、质保记录、售后记录和最近订单；`archiveSummary` 继续由后端从订单、质保和售后聚合生成。
- 客户画像结构化展示：`CustomerNoteType` 的客户偏好、特殊要求和沟通记录在客户详情页分区展示；`apps/web/src/features/customers/display.ts` 提供 `getCustomerProfileNotes` 统一分组。
- 客户展示 helper：`apps/web/src/features/customers/display.ts` 统一客户自动档案、人工维护计数、质保状态和售后状态/责任展示。
- 客户消费趋势：`apps/api/src/customers/customers.service.ts` 的客户详情 `archiveSummary.consumption.trend` 从订单金额自动聚合最近 6 个月月度趋势；`apps/web/src/features/customers/display.ts` 新增 `getCustomerConsumptionTrendRows`，客户详情页展示消费趋势条。
- 创建订单客户历史：`/orders/create` 的客户历史卡片展示最近订单号、订单状态、车辆和金额，订单状态使用中文业务标签；`CustomersService.detail` 从 `ConstructionRecord` 按客户订单聚合最近 3 条施工记录，客户历史卡片展示订单号、车辆、施工类型、状态、质检结果和实际用时。
- 客服角色建模：`StorePosition` 新增 `CUSTOMER_SERVICE`，`PermissionPolicy` 允许客服维护本店客户、创建/协同订单、库存匹配、生成质保、处理售后和申请返利，但不允许财务审批、发票管理、提成管理或查看经营报表；门店工作台已提供客服协同入口。
- 创建订单车辆照片初版：`/orders/create` 新客户弹窗支持填写车辆照片 URL，并随 `customerApi.createVehicle` 写入客户车辆档案。
- 施工容量新增日期选择器修复：表单内保留 DatePicker 值，提交前格式化为 `YYYY-MM-DD`；日期弹层交由 Ant Design 原生管理，避免受控 `open` 状态导致新增容量时无法选择日期或年份；创建订单页跳转到施工容量维护时会携带当前预约日期，容量页自动回填该日期。
- 创建订单收款账户闭环：`/orders/create` 在录入定金但没有可用收款账户时，支持通过 `orderApi.createPaymentAccount` 就地新增收款账户，成功后刷新 `payment-accounts` 查询并自动选中新增账户；服务端允许同门店销售在下单流程创建收款账户，但收款账户修改、停用和审计查询仍保留财务/店长/管理员权限。
- 创建订单定金账户校验：`CreateOrderUseCase` 在写入订单收款前校验 `deposit.accountId` 对应收款账户属于订单门店且启用，跨店或停用账户返回“收款账户不可用”。
- 创建订单客户归属校验：`CreateOrderUseCase` 复用 `PermissionPolicy.canViewCustomer`，销售角色不能绕过客户搜索限制，直接传入同门店其他销售名下客户创建订单。
- 创建订单外出地址校验：`CreateOrderUseCase` 对 `ConstructionLocation.OUTSIDE` 要求 `constructionAddress` 非空，并在保存前 trim。
- 创建订单预约时间一致性：`CreateOrderUseCase` 校验预约日期和预约时段必须成对提交，并保存 trim 后的预约时段；Web 提交前会格式化预约 DatePicker 值，并 trim 预约时段、外出地址和备注。
- 订单金额毛利快照：`CreateOrderUseCase` 初始写入 `materialCostCents`、`salesCommissionCents` 和 `profitCents`；`OrdersService.updateCommercials` 在产品费或施工费变更时保留已有成本/提成并重算毛利。
- 施工人工费建议快照：新增 `OrderAmount.suggestedLaborCostCents` 和 `OrderAmount.laborCostAdjustmentReason`；`/orders/create` 随订单提交当前建议价，人工费不同于建议价时要求填写调整原因；`/orders/[id]` 展示建议人工费、最终人工费和调整原因。
- 审计操作人展示兜底：`getAuditActorLabel` 在后端未返回操作者姓名/账号时显示“未知用户”，不再用 `actorId` 后缀拼接业务界面文案。
- 订单列表筛选保留：`/orders` 从 URL 查询串初始化关键字、订单状态、施工类型、付款状态和创建日期范围；筛选变更后通过 `router.replace` 同步 URL，刷新后不会丢失当前筛选。
- 订单列表分页保留：`/orders` 从 URL 查询串初始化 `page/pageSize`，表格分页变更后同步 URL，并使用服务端分页参数查询订单。
- 售后处罚金额单位统一：`/after-sales` 的责任判定表单改为“处罚金额（元）”，提交前由 `apps/web/src/features/after-sales/display.ts` 转换为整数分。
- 售后订单入口业务化：`/after-sales` 创建售后单时通过 `orderApi.list` 拉取当前门店订单，下拉文案包含订单号、客户和车牌，避免业务人员手填订单 ID。
- 售后派单和判责入口业务化：`/after-sales` 复用当前售后单列表生成售后单选择器，复用 `constructionApi.workers` 生成施工人员选择器，避免手填售后 ID 和人员 ID。
- 售后列表业务化：`AfterSalesService.list` 返回订单号、客户和车辆摘要；`/after-sales` 列表和售后单选择器使用业务标签展示，避免把售后 ID 和订单 ID 作为主展示信息。
- 售后订单摘要兜底：`getAfterSaleOrderLabel` 在后端未返回订单摘要时显示“订单未加载”，不再把 `orderId` 技术字段作为业务文案展示。
- 售后销售作用域：`AfterSalesService.list` 对销售角色追加 `order.salesPersonId` 过滤，只返回本人订单对应售后单。
- 质保创建入口业务化：`/warranties` 通过 `orderApi.list({ status: "COMPLETED" })` 拉取已完工订单，下拉文案包含订单号、客户和车牌，避免手填订单 ID。
- 质保列表业务化：`WarrantiesService.list/detail/lookup` 返回订单号、客户和车辆摘要；`/warranties` 列表和电子质保卡使用业务标签展示，避免把订单 ID 作为主展示信息。
- 质保订单摘要兜底：`getWarrantyOrderLabel` 在后端未返回订单摘要时显示“订单未加载”，不再把 `orderId` 技术字段作为业务文案展示。
- 质保销售作用域：`WarrantiesService.list` 对销售角色追加 `order.salesPersonId` 过滤，`WarrantiesService.detail` 校验质保所属订单销售人，防止销售查看同门店其他销售订单的质保。
- 发票入口业务化：`/invoices` 通过 `orderApi.list({ status: "COMPLETED" })` 生成可开票订单选择器，开具、重开、作废和发送复用当前发票列表生成发票选择器，避免手填订单 ID 和发票 ID。
- 返利入口业务化：`/rebates` 通过 `orderApi.list({ status: "COMPLETED" })` 生成返利订单选择器，审核和发放复用当前返利列表生成返利申请选择器，避免手填订单 ID 和返利 ID。
- 发票/返利列表业务化：`InvoicesService.list` 和 `RebatesService.list` 返回订单号、客户和车辆摘要；`/invoices` 与 `/rebates` 列表和操作选择器使用业务标签展示，避免把技术 ID 作为主展示信息。
- 发票/返利订单摘要兜底：`getInvoiceOrderLabel` 和 `getRebateOrderLabel` 在后端未返回订单摘要时显示“订单未加载”，不再把 `orderId` 技术字段作为业务文案展示。
- 发票 PDF 业务化：`InvoicePdfService` 生成的本地 PDF 只输出发票号、订单号、抬头、税号和金额，不再写入 `Invoice ID`、`Order ID` 或数据库技术 ID。
- 提成入口业务化：`/commissions` 通过 `orderApi.list({ status: "COMPLETED" })` 生成销售提成订单选择器，通过 `constructionApi.assignments` 生成施工记录选择器，通过 `constructionApi.workers` 生成施工人员选择器，施工记录选择器状态使用中文业务标签，避免手填订单 ID、施工记录 ID 和人员 ID。
- 财务报销入口业务化：`/finance` 通过费用列表生成关联费用选择器，通过报销列表生成报销申请选择器，避免手填费用 ID 和报销 ID。
- 审计操作人业务化：`OrdersService.listAuditEvents` 和 `listPaymentAccountAuditEvents` 为审计事件补充 `actor` 用户摘要；`/orders/[id]` 与 `/finance` 审计视图通过 `getAuditActorLabel` 展示姓名/账号，避免直接把操作者 ID 作为主展示。
- 财务列表业务化：`/finance` 费用/报销申请列表使用标题、金额和状态展示；财务流水按来源类型映射到费用/报销业务标签，并在缺少关联对象时用备注或“来源未加载”兜底，避免主列表展示申请 ID 和来源 ID。
- 财务流水来源兜底：`getPaymentRecordSourceLabel` 在来源对象未加载且无备注时显示“来源未加载”，不再把 `sourceId/referenceId` 技术字段作为业务文案展示。
- 采购需求来源业务化：`InventoryService.listPurchaseRequirements` 返回来源订单的订单号、客户、车辆和产品摘要；`/inventory` 使用 `getPurchaseRequirementSourceOrderLabel` 展示来源订单，手工采购需求显示“手工创建”。
- 库存状态业务化：`apps/web/src/features/inventory/display.ts` 新增库存分配、采购需求和采购订单状态 helper；`/inventory` 的待匹配订单、已锁批次、采购需求和采购订单状态列统一输出中文业务标签。
- 库存采购后台权限：`InventoryService.listSuppliers`、`listPurchaseOrders` 和 `listPurchaseRequirements` 已使用 `PermissionPolicy.canManageInventory`，销售角色不能直接读取供应商档案、采购订单和采购需求后台列表。
- 施工照片上传人业务化：`ConstructionService.listWorkers` 返回施工人员账号摘要；`/construction/orders/[id]` 使用 `getConstructionWorkerLabel` 展示派工人员和照片上传人。
- 施工照片阶段业务化：`apps/web/src/features/construction/display.ts` 新增 `getConstructionPhotoStageLabel`；`/construction/orders/[id]` 施工照片阶段显示为施工前、施工中、施工后。
- 施工销售作用域：`ConstructionService.listAssignments` 对销售角色追加 `order.salesPersonId` 过滤，只返回本人订单对应施工记录。
- 施工订单号兜底业务化：`/construction/assignments` 和 `/construction/tasks` 在订单关联缺失时显示“订单未加载”，不再把 `orderId` 技术字段当订单号展示。
- 施工人员选择器业务化：`/construction/assignments`、`/after-sales` 和 `/commissions` 统一使用 `getConstructionWorkerLabel` 生成施工人员选项和人员列，优先显示昵称/账号和技能标签，避免下拉文案暴露人员 ID。
- 施工人员缺失摘要兜底：`getConstructionWorkerLabel` 在后端未返回姓名/账号时显示“施工人员未加载”，不再把用户 ID 后缀作为业务文案。
- 提成规则类型业务化：`apps/web/src/features/commissions/display.ts` 新增 `getCommissionRuleTypeLabel` 和规则类型选项；`/commissions` 规则列表输出中文类型。
- 提成订单摘要兜底：`/commissions` 的销售提成订单和施工记录选择器在订单摘要缺失时显示“订单未加载”，不再把订单技术 ID 作为业务文案展示。
- 支付账户变更审计：`PATCH /payment-accounts/:id` 必须提供 `changeReason`，服务层会剥离原因字段、更新账户字段，并通过 `AuditLogService` 记录操作人、变更原因和变更前后摘要。
- 订单变更审计：新增 `PATCH /orders/:id/commercials`，只允许待派单订单修改产品明细、施工人工费和备注；提交必须填写 `changeReason`，服务层重算订单金额并记录变更前后摘要。
- 库存展示统一：`/inventory` 的产品、批次和流水不再直接展示 `productId`/`batchId`/库存流水枚举，改用 `apps/web/src/features/inventory/display.ts` 和产品 display helper 输出业务文案。
- 库存缺失摘要兜底：`getInventoryProductLabel`、订单匹配 helper 和库存流水表在产品或批次摘要缺失时显示“产品未加载”或“批次未加载”，不再把 `productId`/`batchId` 技术字段作为业务文案展示。
- 库存流水筛选入口业务化：`/inventory` 锁库与流水页的订单筛选通过订单列表生成选择器，操作人筛选通过用户搜索生成选择器，避免手填订单 ID 和用户 ID。
- 状态展示统一：施工类型/地点选项由 `apps/web/src/features/orders/order-display.ts` 输出；质保状态、售后状态/责任和财务审批/流水类型分别收敛到 `warranties/display.ts`、`after-sales/display.ts` 和 `finance/display.ts`，页面不再直接展示对应枚举值。
- 质保提醒和电子卡：`apps/web/src/features/warranties/display.ts` 新增 `getWarrantyExpiryReminder` 和 `getWarrantyCardRows`；`/warranties` 列表展示到期提醒，质保编号查询结果展示为电子质保卡。
- 报表金额展示：`/reports` 通过 `apps/web/src/features/reports/display.ts` 把订单总额、已收款从整数分格式化为人民币元，表格和统计卡不再出现“订单总额分”“已收款分”。
- 报表销售趋势：`ReportsService.summary` 新增 `salesTrend`，按订单创建月份聚合订单数、订单额和已收款；`/reports` 通过 `buildSalesTrendRows` 展示月度订单数、订单额、已收款和回款率。
- 报表施工趋势：`ReportsService.summary` 新增 `constructionTrend`，按施工记录创建月份聚合施工记录、已完工、质检通过和返工数量；`/reports` 通过 `buildConstructionTrendRows` 展示月度完工率和质检结果分布。
- 报表售后趋势：`ReportsService.summary` 新增 `afterSaleTrend`，按售后单创建月份聚合售后单、已解决和施工责任数量；`/reports` 通过 `buildAfterSaleTrendRows` 展示月度解决率、售后率和责任分布。
- 报表提成趋势：`ReportsService.summary` 新增销售提成和师傅提成汇总金额，并新增 `commissionTrend`，按提成生成月份聚合销售提成单、师傅提成单、销售提成、师傅提成、调整金额和提成合计；`/reports` 通过 `buildCommissionTrendRows` 展示提成月度分布。
- 报表库存趋势：`ReportsService.summary` 新增 `inventoryTrend`，按库存流水创建月份聚合流水数量、入库、出库、锁定、释放和调整数量；`/reports` 通过 `buildInventoryTrendRows` 展示库存月度流转分布。
- 报表财务趋势：`ReportsService.summary` 新增 `financeTrend`，按付款流水创建月份聚合订单收款、费用、报销、返利和净现金流；`/reports` 通过 `buildFinanceTrendRows` 展示月度现金流分布。
- 报表发票趋势：`ReportsService.summary` 新增 `invoiceTrend`，按发票创建月份聚合发票数量、已开具、已作废、已重开和金额；`/reports` 通过 `buildInvoiceTrendRows` 展示月度开票率和金额分布。
- 报表返利趋势：`ReportsService.summary` 新增 `rebateTrend`，按返利创建月份聚合返利数量、已审批、已发放、已驳回和金额；`/reports` 通过 `buildRebateTrendRows` 展示月度发放率和金额分布。
- 报表作用域：`GET /reports/summary` 的 `storeId` 改为可选；店长和财务未传 `storeId` 时默认查询本人门店，管理员未传 `storeId` 时查询全量经营汇总；销售访问时只统计本人订单、本人订单发票/返利和本人销售提成，施工、库存、财务等全店经营指标不对销售开放；`/reports` 在管理员无门店成员时仍会加载全量报表，销售和财务工作台已提供对应报表入口。
- 费用/报销申请权限：新增 `PermissionPolicy.canSubmitFinanceApplication`，仅允许管理员、店长、财务和采购提交费用或报销申请；销售等其他门店成员直接调用 `POST /finance/expenses` 或 `POST /finance/reimbursements` 会被服务端拒绝。
- 发票申请归属：新增 `PermissionPolicy.canApplyInvoiceForOrder`，销售只能为 `salesPersonId` 等于自己的订单申请发票；财务、店长和管理员仍可按本权限范围处理订单发票申请。
- 发票列表作用域：`InvoicesService.list` 对销售角色追加 `order.salesPersonId` 过滤，只返回销售自己的订单发票；财务、店长和管理员继续按门店查看。
- 返利申请归属：新增 `PermissionPolicy.canApplyRebateForOrder`，销售只能为 `salesPersonId` 等于自己的订单申请返利；店长和管理员仍可按本权限范围处理订单返利申请。
- 返利列表作用域：`RebatesService.list` 对销售角色追加 `order.salesPersonId` 过滤，只返回销售自己的订单返利；店长和管理员继续按门店查看。
- 售后任务作用域：`AfterSalesService.list` 对销售角色追加 `order.salesPersonId` 过滤，对施工/学徒角色追加 `assignments.some.workerUserId` 过滤；店长、施工主管和管理员继续按门店查看售后单。
- 财务金额单位：`/finance` 的费用、报销表单以人民币元录入并在提交前转换为整数分；费用、报销和流水列表统一以元展示。
- 财务审批与打款分离：`FinanceService.approveReimbursement` 在 `APPROVED` 状态只更新审批结果，不再生成付款流水；只有状态进入 `PAID` 时才写入 `PaymentRecordType.REIMBURSEMENT`。
- 发票与返利金额单位：`/invoices` 和 `/rebates` 的申请金额以人民币元录入并在提交前转换为整数分，列表状态和金额使用业务文案与元展示。
- 返利两级审批：`RebatesService.approve` 已将业务审核和财务审批拆为两步；店长/管理员只能把 `APPLIED` 返利审核到 `REVIEWED` 或驳回，财务/管理员只能在 `REVIEWED` 后审批为 `APPROVED` 或驳回，`RebatesService.pay` 仍要求返利状态为 `APPROVED` 后才能发放，防止跳过审核直接生成付款流水。
- 发票电子文件：`Invoice.fileUrl` 已通过 migration 持久化；开具/重开发票可记录电子文件 URL；若开票时未传 `fileUrl`，`InvoicePdfService` 会在本地 OSS 目录生成仅包含发票号、订单号、抬头、税号和金额的 PDF，并回填 `/local-oss/invoices/*.pdf` URL，`/invoices` 列表通过 `getInvoiceFileDisplay` 展示“查看电子文件”入口。
- 发票发送记录：新增 `POST /invoices/:id/send`，仅允许已开具或已重开且存在电子文件的发票发送；服务端写入 `InvoiceLog` 记录发送渠道、接收人和备注，`/invoices` 提供“发送发票”表单入口。
- 提成金额单位：`/commissions` 的销售提成固定金额、师傅基础提成和调整金额均以人民币元录入并在提交前转换为整数分，规则列表固定金额以元展示。
- 订单审计查询：新增 `AuditEvent` 持久化模型，订单明细/金额变更和收款账户变更写入审计事件；`GET /orders/:id/audit-events` 复用订单可见性边界，订单详情页展示订单变更审计记录。
- 收款账户审计查询：新增 `GET /payment-accounts/:id/audit-events`，复用收款管理权限边界；财务管理页新增“收款账户”标签页，可查看账户类型、掩码账号和账户级审计记录。
- 小程序师傅端任务初版：`apps/mini/pages/tasks` 从本地缓存展示派单任务，并可调用 `/construction/assignments` 手动拉取任务；任务同步兼容数组响应和 `{ items: [...] }` 包装响应，避免真实页面与 TypeScript helper 的响应解析分叉；`apps/mini/pages/task-detail` 展示任务详情，按当前状态提供开工/完工按钮并写入 `TASK_STATUS` 离线队列，开工状态会携带本地 `startedAt`，完工状态会携带本地 `completedAt`，同时通过 `wx.chooseMedia` 把施工照片本地路径和本地 `takenAt` 拍摄时间写入离线队列，离线队列达到 100 条时提示“本地缓存已达上限，请联网同步后再继续操作”；`apps/mini/pages/leave` 支持离线填写开始日期、结束日期和原因，并写入 `LEAVE_REQUEST` 队列；`apps/mini/pages/offline` 展示队列摘要，并可把照片、施工状态和请假记录同步到后端；失败记录在 3 次以内继续保留为 `PENDING`，第 3 次失败后标记 `FAILED`；`apps/mini/pages/settings` 支持保存 API 地址、access token 和门店 ID，也可通过 `wx.login` 调用 `POST /auth/wechat-login` 后自动保存 token 和门店 ID；`apps/mini/app.js` 在启动和回前台时按 60 秒间隔自动尝试同步离线队列，并使用同样的 3 次重试规则。

## 6. 回滚原则

MUST：

- 每个 Step 独立提交，失败时只回滚对应 Step。
- UI 文案和 display helper 变更不得修改后端枚举值，避免破坏历史数据。
- 数据模型变更必须有 Prisma migration 和 database invariant 测试。
- API 行为变化必须保留现有统一错误结构和 `requestId`。

RECOMMENDED：

- 先完成业务语言、金额单位、字段展示这类低风险改造，再推进库存匹配和订单审计。
- 复杂审批、税控/版式级发票 PDF、小程序发布和更复杂多维 BI 图表独立排期，不混入当前 P0 修复。
