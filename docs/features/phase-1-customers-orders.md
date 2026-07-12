# Phase 1 客户订单收款功能说明

- 文档类型：已交付功能说明
- 文档状态：初版
- 适用范围：客户、车辆、产品、订单、订单费用、收款账户和订单收款
- 来源依据：[Phase 1 客户、产品、订单与收款实施计划](./phase-1-customers-orders-plan.md)

本文档说明 Phase 1 已交付的客户、车辆、产品、订单和收款能力。

## 已交付能力

- 客户档案：个人/企业客户、联系方式、来源、推荐人。
- 车辆档案：车牌、VIN、车型、颜色、照片。
- 产品基础资料：品牌、名称、型号、类别、规格、单位、质保年限、基础价格。
- 销售订单：客户、车辆、产品明细、施工类型、施工地点、预约时间、费用清单。
- 收款：定金、尾款、全款，关联收款账户。

## 角色权限

- 管理员：跨门店全量，复用当前 `User.isAuditor=true`。
- 店长：本门店客户、产品、订单和收款账户管理。
- 销售：创建订单，查看和维护自己名下客户与订单。
- 财务：查看本门店订单，维护收款账户和订单收款。
- 施工主管：当前 Phase 1 只读参与，后续派工阶段再扩展写权限。
- 师傅/学徒：不参与 Phase 1 操作。

## API 范围

- `POST /customers`、`GET /customers`、`GET /customers/:id`、`PATCH /customers/:id`。
- `POST /products`、`GET /products`、`GET /products/:id`、`PATCH /products/:id`、`DELETE /products/:id`。
- `POST /orders`、`GET /orders`、`GET /orders/:id`。
- `POST /orders/:id/payments`、`GET /orders/:id/payments`。
- `POST /payment-accounts`、`GET /payment-accounts`、`PATCH /payment-accounts/:id`、`DELETE /payment-accounts/:id`。

## 前端页面

- `/customers`：客户列表和检索。
- `/customers/[id]`：客户详情。
- `/products`：产品列表、创建、编辑和停用。
- `/orders`：订单列表和状态筛选。
- `/orders/create`：创建订单。
- `/orders/[id]`：订单详情、产品明细和收款记录。

## 验收路径

1. 销售创建客户和车辆。
2. 销售选择产品创建订单。
3. 销售录入定金。
4. 财务查看订单收款状态并补录尾款。
5. 店长查看本门店客户、产品和订单。

## 约束

- MUST 使用整数分保存金额字段。
- MUST 使用 `phoneHash` 和 `vinHash` 支持敏感字段检索。
- MUST NOT 在 API 响应中返回 `phoneEncrypted`、`phoneHash`、`vinEncrypted`、`vinHash`。
- MUST NOT 把 Phase 2+ 能力混入当前闭环，例如施工派工、库存扣减、质保、售后、发票、返利、报表、OCR 或小程序离线同步。
