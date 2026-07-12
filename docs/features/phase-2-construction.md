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
- 施工记录作用域：销售只能查看本人订单对应施工记录，施工人员只能查看和处理分配给自己的任务。
- 施工照片：支持施工前、施工中、施工后阶段照片记录，关联上传人。
- 完工确认：记录开始时间、完工时间、实际用时和超时分钟数。
- 质检：施工主管、店长和管理员可记录通过或需要返工。
- 提成快照：完工时为参与施工人员生成基础提成快照。

## 角色权限

- 管理员：跨门店管理施工容量、派单、质检。
- 店长：管理本门店施工容量、派单、质检。
- 施工主管：管理本门店施工容量、派单、质检。
- 师傅/学徒：查看自己的施工任务、开工、上传照片、完工。
- 销售：不具备施工写权限；只能查看本人订单对应施工记录。
- 采购/财务：不具备施工写权限。

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

施工相关页面 MUST 使用施工人员姓名/账号/技能标签作为业务标签展示；不得把 `workerUserId` 或 `uploadedById` 作为主要可读文案。施工详情 MUST 优先展示订单号，不得把路由中的订单技术 ID 作为主展示。施工状态 MUST 展示为已派工、施工中、已完工等中文业务标签，不得直接展示 `DISPATCHED`、`IN_CONSTRUCTION`、`COMPLETED`。质检结果 MUST 展示为通过、需要返工，不得直接展示 `PASS`、`REWORK_REQUIRED`。施工照片阶段 MUST 展示为施工前、施工中、施工后，不得直接展示 `BEFORE`、`DURING`、`AFTER`。

## 约束

- MUST 通过施工 API 流转派单、开工、完工和质检。
- MUST 对销售访问 `GET /construction/assignments` 时按 `order.salesPersonId` 过滤，不允许销售查看同门店其他销售订单的施工记录。
- MUST NOT 让前端直接修改 `Order.status`。
- MUST NOT 在 Phase 2 实现库存扣减、采购、质保、售后、发票、返利、复杂提成规则或小程序离线同步。
