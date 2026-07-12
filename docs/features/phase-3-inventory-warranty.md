# Phase 3 库存采购质保功能说明

- 文档类型：已交付功能说明
- 文档状态：已按库存采购改进计划更新
- 适用范围：库存批次、库存流水、采购需求、订单锁库、质保生成与查询
- 来源依据：[Phase 3 库存采购质保实施计划](./phase-3-inventory-warranty-plan.md)、[Phase 3 库存采购改进实施计划](./phase-3-inventory-purchase-improvement-plan.md)

本文档说明 Phase 3 已交付的库存采购与质保能力。

## 已交付能力

- 产品库存规格：产品支持库存单位、销售单位、卷宽、卷长、每卷米数和数量精度。
- 库存批次：按门店、产品和批次号记录 Decimal 数量，支持父子批次、批次来源和出库数量。
- 库存流水：记录采购入库、订单锁定、订单出库、库存释放、单位转换、批次拆分、盘点、报损、调拨和退货，并支持按产品、批次、订单、类型和操作人筛选；Web 端按当前筛选结果展示入库、出库、锁定、释放、调整和流水条数统计。
- 批次追溯：库存批次列表可一键跳转到该批次库存流水，追溯入库、锁库、出库、拆分和其他出入库记录。
- 采购需求：支持人工创建采购需求；订单锁库缺货时自动生成采购需求。
- 采购订单：采购人员可基于采购需求生成采购订单，草稿采购单可审批通过后入库，也可填写原因取消采购单，并在列表中查看预计到货和到货风险提醒。
- 采购入库：采购明细可按批次入库，也可批量扫码入库，并回写采购订单和采购需求状态；批量接口逐行返回成功和失败结果。
- 供应商档案：支持新增、编辑、启停供应商，维护多联系人和评级历史；供应商列表合并主数据与采购单/批次历史供应商快照。
- 订单锁库：按订单明细创建 `OrderInventoryAllocation`，记录批次、数量、操作人和时间。
- 订单出库：把已锁定分配转为订单施工出库流水。
- 单位转换与拆分：支持卷转米记录；批次拆分生成子批次号并记录 `BATCH_SPLIT`。
- 其他出入库：支持盘点入库、盘点出库、报损出库、调拨入库、调拨出库、退货入库和退货出库。
- 质保生成：已完工订单可生成唯一质保，复制客户、车辆、订单和施工照片。
- 质保查询：支持按质保编号公开查询质保状态；销售查看质保列表和详情时仅能访问本人订单对应质保。

## 角色权限

- 管理员：跨门店管理库存、采购和质保。
- 店长：管理本门店库存、采购和质保。
- 采购：管理本门店库存和采购，不具备质保生成权限。
- 施工主管：可基于已完工订单生成本门店质保。
- 销售：不具备库存写权限；仅能查看本人订单相关质保和业务摘要，不允许直接读取采购订单、采购需求和供应商后台列表。
- 财务、师傅、学徒：不具备库存写权限；仅按现有数据范围查看相关业务摘要。

## API 范围

- `GET /inventory/batches`、`POST /inventory/batches`。
- `POST /inventory/batches/:batchId/convert`、`POST /inventory/batches/:batchId/split`。
- `GET /inventory/movements`：支持门店、产品、批次、订单、类型和操作人筛选。
- `GET /inventory/orders/pending-match`、`GET /inventory/orders/:orderId/match`。
- `POST /inventory/orders/:orderId/allocations`、`POST /inventory/orders/:orderId/release`。
- `GET /inventory/purchase-orders`、`POST /inventory/purchase-orders`。
- `POST /inventory/purchase-orders/items/:id/receive`。
- `POST /inventory/purchase-orders/items/:id/receive-batches`。
- `GET /inventory/purchase-requirements`、`POST /inventory/purchase-requirements`。
- `POST /inventory/purchase-requirements/:id/purchase-orders`。
- `GET /inventory/suppliers`、`POST /inventory/suppliers`、`PATCH /inventory/suppliers/:id`。
- `POST /inventory/suppliers/:id/contacts`、`POST /inventory/suppliers/:id/rating-history`。
- `POST /inventory/stock-operations`。
- `POST /inventory/orders/:orderId/lock`、`POST /inventory/orders/:orderId/outbound`。
- `GET /warranties`、`POST /warranties`、`GET /warranties/:id`。
- `GET /warranties/lookup?no=`。

## 前端页面

- `/inventory`：批次入库、供应商档案、供应商联系人和评级历史、采购需求、采购订单审批、采购订单取消原因、采购预计到货提醒、订单库存匹配、采购明细批量扫码入库、批次拆分、批次追溯、其他出入库、库存流水筛选和流水统计。
- `/warranties`：从已完工订单生成质保、按质保编号查询、查看质保列表。

## 约束

- MUST 通过库存 API 记录出入库，不允许业务代码直接改库存数量。
- MUST 通过批量入库 API 返回逐行成功/失败，不允许前端循环多次提交后丢失失败明细。
- MUST 通过 `GET /inventory/movements` 的服务端查询条件筛选库存流水，不允许只在前端过滤当前页数据。
- MUST 通过采购需求生成缺货采购链路，不允许用采购订单草稿替代采购需求。
- MUST 保留采购单和批次上的供应商历史快照，不允许供应商主数据编辑覆盖历史记录。
- MUST 通过 `SupplierContact` 和 `SupplierRatingHistory` 维护联系人和评级历史，不允许把多联系人压进备注字段。
- MUST 将供应商档案、采购订单和采购需求列表限定为库存管理权限，不允许销售通过 API 读取采购后台数据。
- MUST 通过 `OrderInventoryAllocation` 追溯订单明细与批次关系。
- MUST 通过质保 API 生成质保，不允许绕过已完工订单。
- MUST 保留订单、批次、施工照片到质保的追溯链。
- MUST 对销售访问 `GET /warranties` 和 `GET /warranties/:id` 时按质保所属订单 `salesPersonId` 过滤，不允许销售查看同门店其他销售订单的质保。
- MUST NOT 在 Phase 3 实现售后、财务、发票、返利、报表或小程序离线。
