# Phase 3 库存采购改进实施计划

- 文档类型：功能实施计划
- 文档状态：初版
- 适用范围：产品库存规格、库存匹配、批次锁定、采购需求、采购订单、采购入库、单位转换、批次拆分、其他出入库
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)、V1.7 需求文档库存管理模块 3.3

## 文档规范符合性

MUST：

- 本文作为功能实施计划，存放在 `docs/features/`，符合 [文档规范](../DOCUMENTATION_GUIDELINES.md) 的功能文档分类。
- 本文用于修正当前 Phase 3 库存采购实现与 V1.7 需求之间的差距，不替代质保实施计划。
- 修改本文时 MUST 同步检查 [文档索引](../README.md) 和根 [README](../../README.md)。

MUST NOT：

- 不在本文中安排售后、财务、发票、返利、报表或小程序离线能力。
- 不要求一次性重写现有 `inventory` 模块；必须按可回滚的小步骤演进。

## 当前实现差距

当前代码库已经有 `apps/api/src/inventory/` 和 `/inventory` 页面，但它们仍是最小雏形：

- 当前 `InventoryBatch` 只有整数数量，不能表达 `1.4卷`、`0.6卷` 或 30 米等拆分结果。
- 当前 `Product.specification` 是展示字符串，不能可靠计算 `1卷 = N米`。
- 当前缺货时直接生成 `PurchaseOrder(DRAFT)`，没有独立的采购需求单。
- 当前订单锁库主要依赖 `InventoryMovement(ORDER_LOCK)`，没有订单明细与批次的分配表。
- 当前单位转换只修改原批次数量并记录流水，没有生成新批次号。
- 当前前端主要手填产品 ID、订单 ID，不符合“客服查看订单 -> 匹配库存 -> 选择/扫描批次”的业务入口。
- 当前其他出入库只有宽泛类型，不能明确区分盘点、报损、调拨和退货。
- 当前库存流水筛选和统计初版已补齐，支持按产品、批次、订单、流水类型和操作人查询，并按筛选结果展示入库、出库、锁定、释放、调整和流水条数；库存批次表已提供“批次追溯”入口，可一键切换到该批次流水。
- 当前批量扫码入库初版已补齐，采购明细可一次提交多行批次，后端逐行返回成功和失败结果。
- 当前预计到货提醒初版已补齐，采购订单列表按预计到货日展示未设置、今日、明日、逾期和已全部入库状态。
- 当前采购审批初版已补齐，草稿采购单可通过 `POST /inventory/purchase-orders/:id/approve` 转为 `ORDERED`，未审批草稿采购单禁止到货入库。
- 当前采购订单取消原因初版已补齐，取消必须填写原因并写入 `AuditEvent`，已取消采购单禁止到货入库。

## 目标业务流程

Phase 3 库存采购 MUST 支持以下主链路：

```text
订单创建
  -> 客服/采购/店长查看待匹配订单
  -> 库存匹配
      -> 有货：选择或扫描批次号 -> 锁定库存
      -> 无货：生成采购需求单
  -> 采购人员基于采购需求创建采购订单
  -> 采购到货
  -> 按批次入库
  -> 施工领料或确认出库
  -> 订单、施工、售后和质保可追溯批次
```

MUST：

- 库存匹配入口必须是订单和订单明细。
- 锁库必须记录订单明细、批次、数量、操作人和时间。
- 出库必须基于已锁定库存执行。
- 缺货必须先生成采购需求，再由采购人员创建采购订单。

MUST NOT：

- 不得用采购订单草稿替代采购需求单。
- 不得只靠流水备注追溯批次使用情况。
- 不得允许前端直接修改库存数量字段。

## 数据模型改进

### 产品库存规格

MUST 在 `Product` 或独立 `ProductInventorySpec` 中补充可计算字段：

- `inventoryUnit`：库存基准单位，例如 `ROLL`、`METER`、`PIECE`。
- `salesUnit`：销售默认单位。
- `rollWidthMeters`：卷宽，例如 1.52。
- `rollLengthMeters`：卷长，例如 15。
- `metersPerRoll`：每卷可换算米数，通常等于卷长。
- `quantityPrecision`：数量精度，用于控制卷或米的小数位。

MUST NOT：

- 不得依赖 `specification = "1.52*15米"` 解析换算规则。

### 库存批次

`InventoryBatch` MUST 支持：

- `unit`：当前批次计量单位。
- `totalQuantity`、`availableQuantity`、`lockedQuantity`、`outboundQuantity`：使用 Decimal。
- `batchNo`：同门店同产品唯一。
- `parentBatchId`：拆分批次指向原批次。
- `supplierName`、`receivedAt`、`unitCostCents`。
- `sourceType`、`sourceId`：采购入库、手工入库、拆分等来源。

RECOMMENDED：

- 保留旧整数字段迁移期映射，但新库存计算必须走 Decimal 字段。

### 订单库存分配

新增 `OrderInventoryAllocation`：

- `storeId`
- `orderId`
- `orderItemId`
- `productId`
- `batchId`
- `lockedQuantity`
- `outboundQuantity`
- `status`：`LOCKED`、`OUTBOUND`、`RELEASED`
- `lockedById`、`lockedAt`
- `outboundById`、`outboundAt`

MUST：

- 订单锁库和出库必须通过分配表流转。
- 取消订单或释放库存必须更新分配表并生成释放流水。

### 采购需求与采购订单

新增 `PurchaseRequirement`、`PurchaseRequirementItem`：

- 来源：订单缺货或人工创建。
- 字段：`storeId`、`sourceOrderId`、`status`、`createdById`。
- 明细：`productId`、`requiredQuantity`、`requiredUnit`、`orderItemId`、`fulfilledQuantity`。

`PurchaseOrder` MUST 关联采购需求：

- 一个采购订单可覆盖一个或多个采购需求明细。
- 草稿采购订单必须审批通过后才能到货入库。
- 采购订单取消必须记录原因，并保留审计事件。
- 到货入库必须回写采购订单明细和采购需求明细的完成数量。

### 供应商主数据

新增 `Supplier`、`SupplierContact`、`SupplierRatingHistory`：

- 字段：`storeId`、`name`、`contactName`、`contactPhone`、`rating`、`note`、`isActive`、`createdById`。
- 联系人：`supplierId`、`name`、`phone`、`role`、`isPrimary`、`isActive`、`createdById`。
- 评级历史：`supplierId`、`rating`、`note`、`createdById`、`createdAt`。
- 唯一性：同一门店 `storeId + name` 唯一。
- 采购单和库存批次上的 `supplierName` 继续作为历史快照保留，不随供应商主数据改名而自动覆盖。

MUST：

- 供应商档案用于日常维护和采购录入参考，历史采购单/批次必须保留当时的供应商名称快照。
- 供应商列表必须能合并展示主数据、采购单快照和批次快照，避免老数据在页面上消失。
- 主数据供应商必须支持多联系人和评级历史；历史快照供应商只读展示，不允许维护联系人和评级。
- 供应商档案、采购订单和采购需求列表必须使用库存管理权限；销售只能查看本人订单相关业务摘要，不允许读取采购后台列表。

### 库存流水与其他出入库

`InventoryMovementType` MUST 明确区分：

- `PURCHASE_IN`
- `ORDER_LOCK`
- `ORDER_OUT`
- `STOCK_RELEASE`
- `COUNT_IN`
- `COUNT_OUT`
- `DAMAGE_OUT`
- `TRANSFER_IN`
- `TRANSFER_OUT`
- `RETURN_IN`
- `RETURN_OUT`
- `UNIT_CONVERSION`
- `BATCH_SPLIT`

每条流水 MUST 记录：

- 门店、产品、批次、数量、单位。
- 操作人、操作时间、来源类型、来源 ID。
- 备注。

## API 改进

MUST 新增或调整：

- `GET /inventory/orders/pending-match`：待库存匹配订单列表。
- `GET /inventory/orders/:orderId/match`：查看订单明细、可用批次和缺货情况。
- `POST /inventory/orders/:orderId/allocations`：确认锁定批次。
- `POST /inventory/orders/:orderId/outbound`：基于锁定分配出库。
- `POST /inventory/orders/:orderId/release`：取消或异常时释放锁定库存。
- `GET /inventory/purchase-requirements`：采购需求单列表。
- `POST /inventory/purchase-requirements`：人工创建采购需求。
- `POST /inventory/purchase-requirements/:id/purchase-orders`：基于需求创建采购订单。
- `POST /inventory/purchase-orders/:id/approve`：审批草稿采购订单，使其进入可入库状态。
- `POST /inventory/purchase-orders/:id/cancel`：取消采购订单，必须提交取消原因并写入审计事件。
- `POST /inventory/purchase-orders/items/:id/receive`：采购到货入库。
- `POST /inventory/purchase-orders/items/:id/receive-batches`：采购明细批量扫码入库，返回每行成功/失败结果。
- `GET /inventory/suppliers`：供应商档案和历史供应商快照合并列表。
- `POST /inventory/suppliers`：新增供应商档案。
- `PATCH /inventory/suppliers/:id`：编辑供应商联系方式、评级、备注和启停状态。
- `POST /inventory/suppliers/:id/contacts`：新增供应商联系人。
- `POST /inventory/suppliers/:id/rating-history`：追加供应商评级历史并同步当前评级。
- `GET /inventory/movements`：按门店查询库存流水，并支持产品、批次、订单、流水类型和操作人筛选；Web 端基于返回结果展示当前筛选范围内的流水统计。
- `POST /inventory/batches/:batchId/split`：批次拆分并生成新批次号。
- `POST /inventory/stock-operations`：盘点、报损、调拨、退货等其他出入库。

RECOMMENDED：

- 旧 `POST /inventory/orders/:orderId/lock` 可保留一个迁移期，但内部应调用新的匹配和分配逻辑。
- 所有写接口支持幂等键，避免重复锁库、重复入库或重复拆分。

## Web 页面改进

`/inventory` MUST 从调试型页面改为业务型页面：

- 待匹配订单：展示订单号、客户、车辆、订单明细、预约日期、匹配状态。
- 库存匹配：展示每个订单明细的可用批次，支持选择/扫描批次号和输入锁定数量。
- 采购需求：展示缺货来源、产品、数量、关联订单，支持生成采购订单。
- 采购订单：创建采购订单、审批草稿采购单、填写原因取消采购单、到货入库、填写批次号、供应商和入库日期；采购明细支持粘贴或扫码多行“批次号 数量 供应商”执行批量入库；采购订单列表展示预计到货日和到货风险提醒。
- 供应商档案：新增、编辑、启停供应商，展示采购单数量和批次数；仅历史快照行只读展示。
- 批次管理：查询批次、批次追溯、批次拆分、卷米换算；批次追溯必须能从批次列表直接进入对应批次流水，不要求用户手动复制批次 ID。
- 其他出入库：盘点、报损、调拨和退货表单。
- 库存流水：按产品、批次、订单、类型、操作人筛选，并展示当前筛选结果的入库、出库、锁定、释放、调整和条数统计；筛选条件必须传入 `GET /inventory/movements`，不得仅前端过滤当前页数据。

MUST NOT：

- 不得把产品 ID、订单 ID 手填作为主要操作路径。
- 不得隐藏锁库结果；用户必须能看到哪些批次被锁、锁了多少。

## 实施顺序

### Task 1：库存规格与 Decimal 数量

MUST：

- 为产品补充库存换算字段。
- 将库存计算迁移到 Decimal 数量。
- 增加产品规格和换算单元测试。

验收：

- 产品规格 `1.52*15米` 可展示，但库存换算使用结构化字段。
- 1 卷可换算为配置的 N 米。

### Task 2：订单库存分配表

MUST：

- 新增 `OrderInventoryAllocation`。
- 改造锁库逻辑，写入分配表和流水。
- 出库时基于分配表扣减锁定量。

验收：

- 订单详情可追溯到具体批次。
- 取消订单可释放已锁库存。

### Task 3：采购需求单

MUST：

- 新增采购需求模型和 API。
- 库存不足时生成采购需求单，不直接生成采购订单。
- 支持人工创建采购需求。

验收：

- 缺货订单生成采购需求。
- 采购人员可查看需求来源和缺货明细。

### Task 4：采购订单与入库

MUST：

- 支持基于采购需求创建采购订单。
- 支持草稿采购订单审批；`DRAFT` 采购单不得入库。
- 支持采购订单取消原因；`CANCELLED` 采购单不得入库。
- 采购到货后按批次入库。
- 入库必须填写唯一批次号、数量、入库日期和供应商。
- 批量扫码入库必须逐行返回成功和失败结果，单行失败不得阻断后续有效行入库。
- 采购订单列表必须按预计到货日展示到货提醒，覆盖未设置、今日、明日、逾期和已全部入库。

验收：

- 入库后采购订单和采购需求状态正确推进。
- 草稿采购单审批后状态进入 `ORDERED`，未审批时入库被拒绝。
- 取消采购单必须记录原因，取消后入库被拒绝。
- 库存批次和采购来源可追溯。
- 批量扫码入库成功行和失败行可在前端提示中区分。
- 采购人员可在采购订单列表直接识别逾期或临期到货风险。

### Task 5：批次拆分与单位转换

MUST：

- 实现卷转米、米转卷计算。
- 实现批次拆分并生成新批次号，例如 `BOP001-01`。
- 记录 `UNIT_CONVERSION` 或 `BATCH_SPLIT` 流水。

验收：

- 原批次 2 卷，拆出 30 米后，原批次与新批次数量正确。
- 批次追溯能看到父子批次关系。

### Task 6：其他出入库

MUST：

- 实现盘点入库、盘点出库、报损出库、调拨入库、调拨出库、退货入库、退货出库。
- 每次操作必须记录类型、产品、批次、数量、操作人、时间和备注。

验收：

- 每类其他出入库都能生成独立流水。
- 库存数量和流水方向一致。

### Task 7：供应商档案初版

MUST：

- 新增 `Supplier`、`SupplierContact`、`SupplierRatingHistory` 主数据模型、索引和 migration。
- 新增 `GET/POST/PATCH /inventory/suppliers`、`POST /inventory/suppliers/:id/contacts`、`POST /inventory/suppliers/:id/rating-history`。
- `/inventory` 新增供应商档案页签，支持新增、编辑、启停、联系人档案和评级历史。
- 供应商列表合并主数据与采购单/批次历史供应商快照。

验收：

- 同一门店供应商名称唯一。
- 已有采购单或批次中的供应商名称即使没有主数据，也能在供应商列表中只读出现。
- 编辑供应商主数据不覆盖历史采购单和批次的 `supplierName` 快照。
- 可为主数据供应商维护多个联系人，并追加可追溯的评级历史。

### Task 8：前端库存采购流程

MUST：

- 重构 `/inventory` 为待匹配订单、采购需求、采购订单、批次、其他出入库、流水等业务 Tab。
- 使用产品、订单和批次选择器替代手填 ID。
- 采购需求来源订单 MUST 以订单号、客户、车辆和产品摘要展示；手工采购需求显示“手工创建”，不得把来源订单 ID 作为主展示列。
- 待匹配订单、已锁批次、采购需求和采购订单状态 MUST 使用中文业务标签展示，不得直接展示状态枚举值。
- 库存流水页签增加产品、批次、订单、类型和操作人筛选，并展示当前筛选结果的业务方向统计。
- 库存批次页签增加批次追溯动作，点击后自动切换到库存流水并带入批次筛选。
- 增加基础页面渲染和 API client 测试。

验收：

- 客服或采购能从待匹配订单开始完成锁库或生成采购需求。
- 采购能从需求创建采购订单并入库。
- 采购需求列表能区分订单缺货来源和手工创建来源，业务人员无需读取来源订单 ID。
- 库存采购页面状态列显示为待派工、已锁定、部分入库、草稿等业务文案。
- 库存流水筛选调用 `GET /inventory/movements` 服务端筛选，并有 API client、统计 helper 和页面约束测试。
- 采购或客服可从库存批次表直接追溯该批次的入库、锁库、出库、拆分和其他出入库流水。

### Task 9：文档与验证

MUST：

- 更新 `docs/features/phase-3-inventory-warranty-plan.md`，使其引用本文的库存采购改进边界。
- 更新已交付说明 `docs/features/phase-3-inventory-warranty.md`，区分当前已交付和待改进能力。
- 完成 API、Service、Prisma schema invariant、Web API client 和页面测试。

验证命令：

```bash
corepack pnpm --filter @mallbay/api test
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web test
corepack pnpm --filter @mallbay/web typecheck
corepack pnpm --filter @mallbay/shared typecheck
corepack pnpm lint
git diff --check
```

## 回滚原则

MUST：

- 每个 Task 独立提交，数据库 migration 不删除旧字段。
- 新模型先并行写入，验证通过后再逐步迁移旧接口。
- 旧 `/inventory/orders/:orderId/lock` 在迁移期保留兼容。
- 任何库存数量变更都必须能通过流水和分配表反推。

MUST NOT：

- 不得一次性删除现有库存表或采购表。
- 不得在没有迁移脚本和回滚策略的情况下修改数量字段类型。
- 不得把质保、售后或财务功能混入本次库存采购改进。

## 自检

- 已结合当前代码库的 `InventoryBatch`、`InventoryMovement`、`PurchaseOrder` 和 `/inventory` 页面现状。
- 已区分采购需求和采购订单。
- 已明确单位转换、批次拆分和其他出入库的模型边界。
- 已给出可执行的分阶段实施顺序、验收和回滚要求。
- 已标注 `MUST`、`MUST NOT`、`RECOMMENDED`。
