# Phase 3 库存采购质保实施计划

- 文档类型：功能实施计划
- 文档状态：初版
- 适用范围：库存批次、库存流水、采购需求、订单锁库、订单出库、卷转米拆分、质保生成与查询
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)

## 目标

Phase 3 MUST 让 Phase 1 订单和 Phase 2 施工结果进入材料追溯与质保闭环：

- 每个产品批次可入库、可追踪库存流水。
- 订单可执行库存匹配，有货锁定，无货生成采购需求。
- 已锁定库存可在施工履约后出库。
- 支持卷转米拆分记录，保留单位转换倍率。
- 已完工订单可生成质保，自动复制客户、车辆、订单和施工照片。
- 客户可通过质保编号查询质保状态。

## 交付范围

MUST：

- 后端新增 `apps/api/src/inventory/` 模块。
- 后端新增 `apps/api/src/warranties/` 模块。
- Prisma 新增 `InventoryBatch`、`InventoryMovement`、`PurchaseOrder`、`PurchaseOrderItem`、`Warranty`、`WarrantyPhoto`。
- 权限策略新增 `canManageInventory`、`canCreateWarranty`、`canViewWarranty`。
- 前端新增 `/inventory` 和 `/warranties` 页面。
- 共享类型新增 `InventoryMovementType`、`PurchaseOrderStatus`、`WarrantyStatus`、`InventoryBatchSummary`、`WarrantySummary`。

MUST NOT：

- 不实现售后、费用、发票、返利、经营报表或小程序离线。
- 不实现智能采购推荐、OCR 识别或复杂库存成本核算。
- 不绕过订单状态直接生成无订单质保。

## API

- `GET /inventory/batches`
- `POST /inventory/batches`
- `POST /inventory/batches/:batchId/convert`
- `GET /inventory/movements`
- `GET /inventory/purchase-orders`
- `POST /inventory/purchase-orders`
- `POST /inventory/purchase-orders/items/:id/receive`
- `POST /inventory/orders/:orderId/lock`
- `POST /inventory/orders/:orderId/outbound`
- `GET /warranties`
- `POST /warranties`
- `GET /warranties/:id`
- `GET /warranties/lookup?no=`

## 验收

- 采购或店长可创建产品批次，并生成 `PURCHASE_IN` 库存流水。
- 订单锁库时可用库存减少、锁定库存增加，并记录 `ORDER_LOCK`。
- 缺货时自动生成 `DRAFT` 采购需求。
- 卷转米记录 `UNIT_CONVERSION`，并保存 `fromUnit`、`toUnit`、`conversionRate`。
- 已完工订单可生成唯一质保记录，订单状态进入 `WARRANTIED`。
- 质保照片自动来自施工照片，质保编号可公开查询。

## 测试计划

- `PermissionPolicy` 库存和质保权限单元测试。
- `InventoryService` 入库、锁库、缺货采购需求、单位转换测试。
- `WarrantiesService` 完工订单生成质保、质保编号查询测试。
- Prisma schema 不变量测试。
- Web API client 路径和 JSON body 测试。
- 完整验证命令沿用项目根 README 与治理规范。
