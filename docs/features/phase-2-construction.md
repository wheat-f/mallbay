# Phase 2 施工容量派单施工记录功能说明

- 文档类型：已交付功能说明
- 文档状态：初版
- 适用范围：施工容量、施工派单、施工任务、施工照片、完工确认、质检和师傅提成快照
- 来源依据：[Phase 2 施工容量、派单与施工记录实施计划](./phase-2-construction-plan.md)

本文档说明 Phase 2 已交付的施工履约能力。

## 已交付能力

- 施工容量：按门店和日期维护店内、店外、玻璃膜、复检容量与占用数。
- 订单容量校验：创建带预约日期的订单时校验施工容量，未设置或超量时拒绝。
- 施工派单：施工主管、店长和管理员可给订单分配 1 到 3 名施工人员。
- 师傅任务：施工人员只能查看和处理分配给自己的任务。
- 施工照片：支持施工前、施工中、施工后阶段照片记录，关联上传人。
- 完工确认：记录开始时间、完工时间、实际用时和超时分钟数。
- 质检：施工主管、店长和管理员可记录通过或需要返工。
- 提成快照：完工时为参与施工人员生成基础提成快照。

## 角色权限

- 管理员：跨门店管理施工容量、派单、质检。
- 店长：管理本门店施工容量、派单、质检。
- 施工主管：管理本门店施工容量、派单、质检。
- 师傅/学徒：查看自己的施工任务、开工、上传照片、完工。
- 销售/采购/财务：不具备施工写权限。

## API 范围

- `GET /construction/capacities`、`POST /construction/capacities`、`PATCH /construction/capacities/:id`。
- `GET /construction/assignments`。
- `POST /construction/orders/:orderId/assign`。
- `POST /construction/orders/:orderId/start`。
- `POST /construction/orders/:orderId/complete`。
- `POST /construction/records/:recordId/photos`。
- `POST /construction/records/:recordId/quality-check`。
- `GET /construction/workers`、`POST /construction/workers`、`PATCH /construction/workers/:userId`。
- `GET /construction/leaves`、`POST /construction/leaves`、`PATCH /construction/leaves/:id`。
- `POST /construction/schedules`。

## 前端页面

- `/construction/capacities`：施工容量维护。
- `/construction/assignments`：待派工订单和施工记录列表。
- `/construction/orders/[id]`：施工记录详情、照片和质检。
- `/construction/tasks`：施工人员自己的任务列表。

## 约束

- MUST 通过施工 API 流转派单、开工、完工和质检。
- MUST NOT 让前端直接修改 `Order.status`。
- MUST NOT 在 Phase 2 实现库存扣减、采购、质保、售后、发票、返利、复杂提成规则或小程序离线同步。
