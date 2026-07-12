# 漆面保护膜施工管理系统建设方案

本文档基于 `docs/漆面保护膜施工管理系统-需求规格说明书-V1.7.docx` 和当前 MallBay 代码库制定。目标是把 V1.7 需求拆解为可渐进落地的产品、架构、数据和实施方案。

## 1. 方案结论

MUST：

- 保持当前 `apps/api`、`apps/web`、`packages/shared` 的 monorepo 和模块化单体架构，不在当前阶段拆微服务。
- 以“销售订单 -> 施工履约 -> 库存批次 -> 质保售后 -> 财务报表”为主链路推进。
- 先建设 Web 管理端和后端主链路，再建设微信小程序离线能力。
- 所有新增模块必须遵守 [架构规范](../governance/ARCHITECTURE.md)、[API 规范](../governance/API_GUIDELINES.md) 和 [编码规范](../governance/CODE_STYLE.md)。
- 每个阶段必须可独立验证、可回滚，禁止一次性大规模重写当前门店、成员、审核和通知功能。

RECOMMENDED：

- 第一轮实施只覆盖“业务闭环可跑通”，复杂智能推荐、OCR 自动识别、电子发票 PDF 自动生成、短信/小程序推送可作为后续增强。
- 当前系统名仍可保留 MallBay；业务文案逐步从“门店运营台”收敛到“漆面保护膜施工管理”。

## 2. 当前项目现状

### 2.1 已实现能力

当前代码库已经实现以下能力：

- 账号体系：注册、登录、加密凭据登录、refresh token、退出登录、`/auth/me`。
- 个人资料：昵称、头像、密码、邮箱/手机/微信/支付宝绑定、管理员重置密码。
- 门店管理：管理员创建门店、指派店长、门店列表、门店详情、冻结/解冻、店长变更。
- 门店成员：店长邀请成员、成员接受/拒绝邀请、移除成员、岗位枚举。
- 门店送审：店长编辑门店资料和照片、提交审核、管理员通过/驳回。
- 工作台：门店成员可查看工作台，店长可执行管理动作。
- 通知：邀请、审核结果、冻结/解冻、移除成员、密码重置等站内通知。
- 文件存储：阿里云 OSS 和本地 OSS 模式，支持头像和门店照片上传。
- 可观测性：结构化日志、request id、trace、metrics、audit log。
- 工程治理：`docs/governance/` 下已有架构、API、编码、协作和重构计划文档。

对应主要文件：

- API 模块：`apps/api/src/auth/`、`apps/api/src/users/`、`apps/api/src/stores/`、`apps/api/src/members/`、`apps/api/src/notifications/`。
- Web 页面：`apps/web/app/auth/`、`apps/web/app/profile/`、`apps/web/app/admin/`、`apps/web/app/workbench/`。
- 数据模型：`apps/api/prisma/schema.prisma`。
- 共享类型：`packages/shared/src/index.ts`。

### 2.2 与 V1.7 需求的主要差距

当前项目尚未实现 V1.7 的核心业务域：

- 客户管理：客户档案、车辆、标签、备注、历史消费和施工记录。
- 销售订单：订单创建、产品选择、施工类型、施工地点、定金/收款、订单状态流转。
- 施工容量：按日期、施工地点和施工类别设置每日容量。
- 施工派单：施工主管派单、师傅接单、施工照片、施工用时、质检。
- 库存采购：产品、批次、库存流水、采购入库、出库锁定、单位转换。
- 质保：质保录入、质保编号、电子质保卡、到期提醒。
- 售后：售后申请、派单、责任判断、处罚。
- 人员排班：请假、排班、师傅外出能力、施工组合。
- 提成：销售提成规则、师傅提成核算、提成日志。
- 财务：费用申请、报销、打款、收款账户、财务流水。
- 发票：发票申请、开具、作废、重开、发送。
- 返利：客服申请、主管/老板业务审核、财务审批、发放。
- 报表：销售、收款、施工、提成、售后、财务、发票、返利报表。
- 微信小程序离线：本地缓存、照片上传队列、离线状态同步。

## 3. 目标业务架构

### 3.1 模块划分

MUST 按业务域扩展模块：

```text
apps/api/src/
  customers/       客户、车辆、标签、备注、客户画像
  products/        产品、施工类型、质保规则、价格基础数据
  orders/          销售订单、订单金额、收款、订单状态机
  construction/    施工容量、派单、施工记录、施工照片、质检、师傅提成
  inventory/       库存、批次、库存流水、采购订单、单位转换
  warranty/        质保记录、质保卡、到期提醒
  after-sales/     售后申请、售后派单、处罚
  finance/         费用申请、报销、打款、收款账户、财务流水
  invoices/        发票申请、开具、作废、重开、发送记录
  rebates/         返利申请、审核、审批、发放
  reports/         统计查询、图表数据、经营建议
```

当前 `stores/`、`members/`、`notifications/` MUST 保留，并作为组织、人员和消息底座服务上述模块。

### 3.2 主链路

MUST 以订单作为业务主聚合根：

```text
客户/车辆
  -> 销售订单
  -> 收款与订单金额
  -> 施工容量校验
  -> 库存匹配或采购需求
  -> 施工派单
  -> 施工照片与完工确认
  -> 质保录入
  -> 售后、发票、返利、报表
```

设计约束：

- `Order` MUST 关联客户、车辆、销售人员、门店、施工类型、施工地点、订单金额。
- `ConstructionRecord` MUST 关联订单和施工人员，不直接孤立存在。
- 库存匹配 MUST 以订单明细为入口，先生成库存匹配结果，人工确认后锁定批次；缺货时生成采购需求单，不得直接跳过需求单创建采购订单。
- `InventoryMovement` MUST 关联产品批次和业务来源，支持订单锁库、订单出库、采购入库、盘点、报损、调拨和退货。
- `OrderInventoryAllocation` MUST 记录订单明细与库存批次的锁定、出库和释放关系，库存追溯不得只依赖流水备注。
- `Warranty`、`Invoice`、`CustomerRebate`、`AfterSale` MUST 能追溯到订单。

## 4. 权限方案

### 4.1 角色映射

V1.7 原始需求列出了销售、施工主管、师傅、客服、采购、财务、老板、管理员，但遗漏了当前系统已经存在且承担门店运营职责的店长角色。方案 MUST 将店长作为正式业务角色纳入权限矩阵。

当前系统已有：

- `User.isAuditor`：当前系统遗留高权限标记。MUST 统一解释为管理员能力，不再单独保留“审核员”角色。
- `StoreMember.position`：`MANAGER`、`SALES`、`PURCHASING`、`FINANCE`、`SCHEDULER`、`CONSTRUCTION`、`APPRENTICE`。

MUST 在第一阶段复用当前岗位模型，避免过早引入复杂 RBAC：

| 目标角色 | 当前可映射岗位 | 说明 |
| --- | --- | --- |
| 管理员 | `User.isAuditor=true` | 使用当前遗留高权限标记承载管理员能力，负责系统配置、门店创建、门店审核、跨店管理、全量报表和大额审批；业务文案 MUST 统一显示为管理员。 |
| 店长 | `MANAGER` | 复用现有店长岗位，负责本门店日常运营、成员邀请/移除、门店资料送审、查看本店全量业务数据。 |
| 销售 | `SALES` | 创建订单、查看自己业绩、申请发票 |
| 施工主管 | `SCHEDULER` | 复用现有排班员枚举，负责每日施工量设定、派单、质检、师傅提成核算和排班。 |
| 师傅 | `CONSTRUCTION`、`APPRENTICE` | 接单、上传施工照片、请假 |
| 客服 | `CUSTOMER_SERVICE` | 负责客户管理、订单协同、库存匹配、质保录入、售后处理和返利申请；不能审批财务、发票、返利或查看经营报表。 |
| 采购 | `PURCHASING` | 库存、采购、部分费用申请 |
| 财务 | `FINANCE` | 收款、报销、发票、返利审批 |
| 老板 | `User.isAuditor=true` 的高权限用户，RECOMMENDED 后续拆 `OWNER` | 大额费用审批、返利终审、查看所有经营报表。短期与管理员共享能力，后续如需分权再拆独立权限。 |

RECOMMENDED 后续将 `OWNER` 拆为独立岗位，或引入 `Role`/`Permission` 表。当前 `CUSTOMER_SERVICE` 已作为正式岗位进入 `StorePosition`，权限仍 MUST 通过策略函数封装判断，例如 `canCreateOrder(user, storeId)`、`canDispatchConstruction(user, storeId)`。

### 4.2 权限边界

MUST：

- 管理员可跨门店管理，店长只能管理本门店。
- 销售只能编辑自己名下客户和订单，除非具备管理权限。
- 施工主管只能管理本门店施工容量、派单、质检和排班，不默认拥有店长的成员管理和门店送审权限。
- 施工人员只能处理分配给自己的施工单和售后单。
- 客服可维护本门店客户、质保、售后和返利申请，但不能审批财务和返利。
- 财务可查看收款、费用、发票、返利，但不能修改施工照片和库存批次。
- 库存出入库必须记录操作人和业务来源。
- 报表查询必须按角色裁剪数据范围。

MUST NOT：

- 在前端隐藏按钮后就视为权限完成。
- 在 Service 中散落硬编码岗位判断；必须收敛到 policy 或 use-case。

### 4.3 数据范围矩阵

MUST 按角色裁剪客户、订单和报表数据：

| 角色 | 客户范围 | 订单范围 | 报表范围 |
| --- | --- | --- | --- |
| 管理员/老板 | 跨门店全量 | 跨门店全量 | 全量经营报表 |
| 店长 | 本门店全量 | 本门店全量 | 本门店全量 |
| 销售 | 自己名下客户 | 自己创建或归属自己的订单 | 自己销售业绩 |
| 施工主管 | 本门店只读 | 本门店施工相关订单 | 施工相关报表 |
| 师傅 | 仅关联自己施工任务的客户摘要 | 仅分配给自己的施工订单 | 个人施工统计 |
| 客服 | 本门店全量 | 本门店全量只读，允许按职责修改客户/质保/售后 | 客服相关统计 |
| 采购 | 无默认客户权限 | 采购和库存相关订单摘要 | 库存和采购统计 |
| 财务 | 本门店客户只读 | 本门店订单只读，允许维护收款/发票/返利/报销 | 财务相关报表 |

RECOMMENDED 在 Phase 1 先实现 `PermissionPolicy` 和数据 scope，不急于实现完整 RBAC：

```typescript
export class PermissionPolicy {
  static isAdmin(user: AuthUser): boolean;
  static isStoreManager(user: AuthUser, storeId: string): boolean;
  static canCreateOrder(user: AuthUser, storeId: string): boolean;
  static canViewCustomer(user: AuthUser, storeId: string, ownerUserId: string): boolean;
  static canEditCustomer(user: AuthUser, storeId: string, ownerUserId: string): boolean;
  static canManageOrderPayment(user: AuthUser, storeId: string): boolean;
  static canDispatchConstruction(user: AuthUser, storeId: string): boolean;
  static getCustomerScope(user: AuthUser, storeId: string): CustomerScope;
  static getOrderScope(user: AuthUser, storeId: string): OrderScope;
}
```

## 5. 数据模型建设方案

### 5.1 数据库技术取舍

需求文档建议 MySQL 8.0，但当前项目已经使用 PostgreSQL + Prisma。

MUST：

- 继续使用 PostgreSQL，不为满足文档建议切换数据库。
- 新增模型使用 Prisma migration 管理。
- 对金额字段使用整数分，字段命名采用 `amountCents`、`laborCostCents`、`commissionCents`。
- 对手机号、车架号等敏感字段预留加密或哈希查询策略。

RECOMMENDED：

- 手机号可存 `phoneEncrypted` + `phoneHash`，查询走 hash，展示走解密。
- VIN 可存 `vinEncrypted` + `vinHash`。
- 图片和视频只存对象存储 key、URL、文件类型、阶段、上传人、拍摄时间。

### 5.2 第一批核心模型

Phase 1 MUST 建立：

- `Customer`：客户类型、姓名/企业名、联系人、电话、微信、来源、推荐人。
- `CustomerVehicle`：车牌、VIN、车型、颜色、车辆照片。
- `Product`：品牌、名称、型号、类别、规格、单位、质保年限、基础价格。
- `Order`：订单号、客户、车辆、销售、门店、施工类型、施工地点、预约时间、状态、备注。
- `OrderItem`：订单产品明细、数量、单价、金额。
- `OrderAmount`：产品费用、施工费、总金额、材料成本、销售提成、毛利快照。
- `PaymentAccount`：收款账户。
- `OrderPayment`：定金、尾款、收款账户、收款时间。

Phase 2 MUST 建立：

- `DailyCapacity`：日期、门店、店内/店外/玻璃膜/复检容量、已预约数。
- `ConstructionWorkerProfile`：师傅能力、外出能力、状态、技能标签。
- `ConstructionAssignment`：订单、施工人员、角色、派单人、派单时间。
- `ConstructionRecord`：订单施工状态、验车开始、完工时间、实际用时、质检状态。
- `ConstructionPhoto`：订单/施工记录、阶段、照片类型、URL、上传人。
- `LeaveRequest`、`Schedule`：请假和排班。

Phase 3 MUST 建立：

- `ProductInventorySpec` 或等价产品库存字段：卷宽、卷长、每卷米数、库存基准单位、数量精度。`Product.specification` 仅用于展示，MUST NOT 作为库存换算的唯一计算来源。
- `InventoryBatch`、`InventoryMovement`、`OrderInventoryAllocation`。
- `PurchaseRequirement`、`PurchaseRequirementItem`、`PurchaseOrder`、`PurchaseOrderItem`。
- `StockOperation` 或等价手工出入库操作模型，用于盘点、报损、调拨和退货。
- `Warranty`、`WarrantyPhoto`。

Phase 3 库存数量规则 MUST：

- 使用 Decimal 类型保存库存数量，支持卷和米的换算结果，不再使用只能表达整数的数量字段承载拆分结果。
- 批次 MUST 记录当前单位、总量、可用量、锁定量、已出库量、父批次和来源业务。
- 单位转换和拆分 MUST 生成可追溯记录；拆分批次 MUST 使用原批次号加后缀，例如 `BOP001-01`。
- 订单出库 MUST 从已锁定库存转出，禁止绕过锁定关系直接扣批次数量。

Phase 4/5 MUST 建立：

- `AfterSale`、`AfterSaleAssignment`、`Penalty`。
- `SalesCommissionRule`、`SalesCommissionLog`、`WorkerCommission`。
- `ExpenseApplication`、`ReimbursementApplication`、`PaymentRecord`。
- `Invoice`、`InvoiceLog`。
- `CustomerRebate`、`RebateLog`。

## 6. API 与前端建设方案

### 6.1 API 风格

MUST：

- 使用 REST API，沿用当前 `requestId`、统一错误结构和分页结构。
- 新增列表接口必须支持 `page`、`pageSize`，`pageSize` 默认 20，最大 100。
- 写操作必须有 DTO 校验和 Service/use-case 测试。
- 状态流转必须由后端控制，前端不得直接写最终状态。

RECOMMENDED API 分组：

```text
/customers
/customers/:id/vehicles
/orders
/orders/:id/payments
/orders/:id/submit-for-dispatch
/construction/capacities
/construction/assignments
/construction/records/:id/photos
/inventory/products
/inventory/orders/pending-match
/inventory/orders/:orderId/match
/inventory/orders/:orderId/allocations
/inventory/batches
/inventory/batches/:batchId/split
/inventory/purchase-requirements
/inventory/purchase-requirements/:id/purchase-orders
/inventory/movements
/inventory/stock-operations
/warranties
/after-sales
/finance/expenses
/finance/reimbursements
/invoices
/rebates
/reports/sales
/reports/construction
/reports/finance
```

### 6.2 Web 页面

MUST 先覆盖管理端核心页面：

```text
apps/web/app/customers/
apps/web/app/orders/
apps/web/app/construction/
apps/web/app/inventory/
apps/web/app/warranties/
apps/web/app/after-sales/
apps/web/app/finance/
apps/web/app/invoices/
apps/web/app/rebates/
apps/web/app/reports/
```

第一轮页面 MUST 以可操作为目标，不追求复杂图表：

- 客户列表、客户详情、车辆管理。
- 订单创建、订单列表、订单详情、收款记录。
- 施工容量日历、派单列表、施工记录详情、照片查看。
- 库存待匹配订单、批次选择/扫码锁库、采购需求、采购订单、采购入库、采购明细批量扫码入库、批次拆分、其他出入库、库存流水。
- 质保录入和查询。

RECOMMENDED：

- 报表前期先输出表格和关键指标卡，图表在数据稳定后补充。
- 移动端小程序的页面结构可提前记录，但不要在 Web 主链路前开工。

## 7. 分阶段实施路线

### Phase 0：需求固化与架构准备

目标：将 V1.7 需求转成工程可执行边界。

MUST 完成：

- 本方案文档评审。
- 确认 PostgreSQL 作为数据库实现，不切换 MySQL。
- 确认第一轮 Web 管理端优先，小程序排在主链路后。
- 建立业务术语表：客户、车辆、订单、施工单、质保、售后、返利、收款。

验收：

- 文档评审通过。
- 每个阶段的核心模块和非目标明确。

### Phase 1：客户、产品、订单、收款

目标：销售可以创建订单，系统可以记录客户、车辆、产品、金额和收款。

MUST 完成：

- 客户档案和车辆管理。
- 产品基础资料和施工类型枚举。
- 销售创建订单，支持个人/企业客户、客户来源、推荐人、施工地点、预约时间。
- 订单金额拆分：产品费用、施工费、总金额。
- 定金/尾款收款记录和收款账户。
- 订单列表、订单详情、客户历史摘要。

验收：

- 销售能创建一笔带客户、车辆、产品、金额、定金的订单。
- 客服或财务能查看订单收款状态。
- 输入手机号、车牌或 VIN 能定位客户历史。

### Phase 2：施工容量、派单、施工记录

目标：订单进入施工履约流程。

MUST 完成：

- 每日施工容量设置，按店内、店外、玻璃膜、复检四类控制。
- 创建订单时校验容量，超量禁止下单。
- 施工主管派单，支持 1 到 3 名施工人员。
- 师傅施工照片上传：施工前、施工中、施工后。
- 完工确认、施工用时计算、超 8 小时提醒。
- 质检结果和师傅提成快照。

验收：

- 超过容量的订单不能创建或不能确认预约。
- 派单后施工人员能看到自己的任务。
- 施工照片按阶段完整保存并可追溯。

### Phase 3：库存、采购、质保

目标：材料批次可追溯，施工完成后可生成质保。

MUST 完成：

- 产品库存规格字段，支持按产品型号配置 `1卷 = N米` 的换算规则。
- 库存批次入库、批次唯一性、批次来源和库存流水。
- 待匹配订单列表，支持客服、采购或店长对订单执行库存匹配。
- 订单库存匹配，有货时选择或扫描批次号并锁定库存；无货时生成采购需求单。
- 采购需求单列表、采购订单创建、采购到货和按批次入库。
- 卷/米单位转换和拆分记录，拆分后生成新批次号。
- 盘点入库、盘点出库、报损出库、调拨入库、调拨出库、退货入库、退货出库。
- 质保录入，自动带出客户、车辆、订单、施工照片。
- 质保编号、质保起止日期、质保范围。

MUST NOT：

- 不得继续将缺货采购需求直接等同为采购订单。
- 不得让前端手填产品 ID 或订单 ID 作为主要业务入口；必须提供可选择的产品、订单和批次列表。
- 不得把卷/米换算写成纯备注或只改原批次数量；必须形成可追溯的批次和流水。

验收：

- 每笔订单能追溯使用的产品批次、锁定时间、出库时间和操作人。
- 库存不足时生成采购需求单，采购人员可基于需求创建采购订单。
- 采购到货入库必须填写唯一批次号、数量、入库日期和供应商。
- 选择批次拆分 30 米后，原批次数量和新批次数量均可追溯。
- 盘点、报损、调拨和退货均产生明确出入库流水。
- 施工完成后客服能生成质保记录。
- 客户可通过质保编号查询状态。

### Phase 4：售后、人员、提成

目标：覆盖售后闭环和人员绩效。

MUST 完成：

- 售后申请、售后派单、责任判断、处罚记录。
- 请假、反审核、排班。
- 销售提成规则：固定比例、施工类型、销售额阶梯、综合规则。
- 师傅提成计算，支持多人施工和人工调整。
- 提成日志和历史追溯。

验收：

- 售后能关联订单、施工人员、质保和处罚。
- 请假人员不会出现在可派单列表。
- 完工订单能生成销售和师傅提成快照。

### Phase 5：财务、发票、返利、报表

目标：覆盖经营管理和财务闭环。

MUST 完成：

- 费用申请、审批、报销、打款。
- 收款账户对账和财务流水。
- 发票申请、开具、作废、重开。
- 返利申请、业务审核、财务审批、发放。
- 销售、收款、施工、提成、售后、财务、发票、返利报表。

验收：

- 财务能完成费用和报销审批流。
- 已完工且已收款订单能申请发票和返利。
- 老板/管理员能查看全量经营报表。

### Phase 6：微信小程序与离线

目标：师傅端移动作业。

MUST 完成：

- 师傅任务列表、任务详情、施工拍照。
- 本地缓存派单任务、客户、车辆和施工状态。
- 任务详情可离线记录开工和完工状态，保留本地开工和完成时间，联网后通过施工 API 同步。
- 离线照片上传队列，保留本地拍摄时间，联网后重试 3 次。
- 离线提交请假，联网后同步。

验收：

- 断网时可查看已缓存任务并拍照暂存。
- 联网后照片和状态能自动同步。
- 超过本地缓存上限时有明确提示。

## 8. 风险与取舍

### 8.1 主要风险

- 需求文档范围大，若一次性建全模块，交付和迁移风险高。
- 订单、施工、库存、财务强耦合，必须先稳定订单主模型。
- 敏感信息加密会影响搜索，需要提前设计 hash 查询。
- 小程序离线同步仍存在冲突处理和后台常驻同步问题，不适合作为第一阶段。
- 当前岗位枚举已经表达客服；老板和管理员仍共用遗留高权限标记，需要在权限策略中继续预留后续拆分点。

### 8.2 回滚原则

MUST：

- 每个 Phase 独立迁移和提交。
- 数据库 migration 不得删除已有生产字段；废弃字段先保留并停止写入。
- 新业务模块先以新路由接入，不改动当前门店审核主流程。
- 大型状态机上线前保留人工修正入口和审计日志。

MUST NOT：

- 在未验证订单主链路前实现复杂报表。
- 在 Web 主链路未稳定前启动小程序离线同步。
- 将质保、发票、返利等派生业务做成孤立模块，必须关联订单。

## 9. 近期推荐下一步

MUST：

1. 评审本文档，确认 Phase 1 是否作为第一轮开发范围。
2. 为 Phase 1 单独编写实施计划，明确 Prisma 模型、API、页面和测试。
3. 在 Phase 1 开工前确认敏感信息策略：明文、加密、hash 查询三者的落地方式。

RECOMMENDED Phase 1 最小闭环：

- 客户 + 车辆。
- 产品基础资料。
- 订单创建 + 订单详情。
- 订单金额 + 定金/尾款收款。
- 客户历史摘要。

不进入 Phase 1 的内容：

- 自动 OCR。
- 智能施工人员组合推荐。
- 电子发票 PDF 自动生成。
- 微信小程序离线队列。
- 完整经营分析建议。

## 10. 文档自检

- 已明确使用当前 PostgreSQL + Prisma 技术栈，不照搬需求文档中的 MySQL 建议。
- 已区分已实现能力和未实现能力，未把未来能力描述为已完成。
- 已给出模块边界、主链路、权限、数据模型、API、前端页面和分阶段验收。
- 已标注 MUST、MUST NOT、RECOMMENDED。
- 本文是建设方案，不替代后续 Phase 1 的详细实施计划和测试方案。
