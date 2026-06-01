# Phase 4 售后人员提成功能说明

- 文档类型：已交付功能说明
- 文档状态：初版
- 适用范围：售后申请、售后派单、责任判断、处罚、销售提成和师傅提成
- 来源依据：[Phase 4 售后人员提成实施计划](./phase-4-after-sales-commission-plan.md)

本文档说明 Phase 4 已交付的售后与提成能力。

## 已交付能力

- 售后申请：售后单关联订单、客户和可选质保。
- 售后派单：店长、施工主管、管理员可派给本门店师傅或学徒。
- 责任判断：支持客户、施工、材料、门店责任。
- 处罚记录：施工责任可记录处罚人员、金额和原因。
- 销售提成规则：支持固定比例、固定金额、销售阶梯和施工类型规则类型。
- 销售提成日志：按订单生成唯一销售提成快照。
- 师傅提成：按施工记录为参与施工人员生成提成，并支持人工调整。

## 角色权限

- 管理员：跨门店管理售后和提成。
- 店长：管理本门店售后和提成。
- 施工主管：管理本门店售后派单和责任判断。
- 财务：管理本门店提成规则和提成生成。
- 师傅/学徒：当前阶段不直接处理售后单写操作。

## API 范围

- `GET /after-sales`、`POST /after-sales`。
- `POST /after-sales/:id/assign`。
- `POST /after-sales/:id/responsibility`。
- `GET /commissions/sales-rules`、`POST /commissions/sales-rules`。
- `POST /commissions/orders/:orderId/sales`。
- `POST /commissions/records/:recordId/workers`。

## 前端页面

- `/after-sales`：售后创建、派单、责任判断和处罚。
- `/commissions`：销售提成规则、销售提成生成、师傅提成生成。

## 约束

- MUST 通过售后 API 创建和处理售后，不允许孤立处罚。
- MUST 通过提成 API 生成提成日志，不允许前端直接写提成表。
- MUST 保留订单、施工记录、售后、处罚和提成的追溯关系。
- MUST NOT 在 Phase 4 实现费用、发票、返利、报表或小程序离线同步。
