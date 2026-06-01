# Phase 3 库存采购质保功能说明

- 文档类型：已交付功能说明
- 文档状态：初版
- 适用范围：库存批次、库存流水、采购需求、订单锁库、质保生成与查询
- 来源依据：[Phase 3 库存采购质保实施计划](./phase-3-inventory-warranty-plan.md)

本文档说明 Phase 3 已交付的库存采购与质保能力。

## 已交付能力

- 库存批次：按门店、产品和批次号记录库存，批次号在同门店同产品下唯一。
- 库存流水：记录采购入库、订单锁定、订单出库、库存释放和单位转换等流水。
- 采购需求：人工创建采购单；订单锁库缺货时自动生成草稿采购需求。
- 采购入库：采购明细可按批次入库，并更新采购单状态。
- 订单锁库：按订单产品明细消耗可用库存并增加锁定库存。
- 订单出库：把已锁定库存转为订单施工出库流水。
- 单位转换：支持卷转米拆分记录，保存转换倍率。
- 质保生成：已完工订单可生成唯一质保，复制客户、车辆、订单和施工照片。
- 质保查询：支持按质保编号公开查询质保状态。

## 角色权限

- 管理员：跨门店管理库存、采购和质保。
- 店长：管理本门店库存、采购和质保。
- 采购：管理本门店库存和采购，不具备质保生成权限。
- 施工主管：可基于已完工订单生成本门店质保。
- 销售、财务、师傅、学徒：不具备库存写权限；仅按现有数据范围查看相关业务摘要。

## API 范围

- `GET /inventory/batches`、`POST /inventory/batches`。
- `POST /inventory/batches/:batchId/convert`。
- `GET /inventory/movements`。
- `GET /inventory/purchase-orders`、`POST /inventory/purchase-orders`。
- `POST /inventory/purchase-orders/items/:id/receive`。
- `POST /inventory/orders/:orderId/lock`、`POST /inventory/orders/:orderId/outbound`。
- `GET /warranties`、`POST /warranties`、`GET /warranties/:id`。
- `GET /warranties/lookup?no=`。

## 前端页面

- `/inventory`：批次入库、采购需求、订单库存匹配和库存流水。
- `/warranties`：从已完工订单生成质保、按质保编号查询、查看质保列表。

## 约束

- MUST 通过库存 API 记录出入库，不允许业务代码直接改库存数量。
- MUST 通过质保 API 生成质保，不允许绕过已完工订单。
- MUST 保留订单、批次、施工照片到质保的追溯链。
- MUST NOT 在 Phase 3 实现售后、财务、发票、返利、报表或小程序离线。
