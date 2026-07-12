# Phase 4 售后人员提成实施计划

- 文档类型：功能实施计划
- 文档状态：初版
- 适用范围：售后申请、售后派单、责任判断、处罚、销售提成规则、销售提成日志、师傅提成
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)

## 目标

Phase 4 MUST 在施工和质保之后补齐售后闭环与人员绩效：

- 售后必须关联订单、客户和可选质保。
- 售后可派给 1 名或多名本门店施工人员。
- 销售只能查看本人订单对应售后单，施工人员只能查看指派给自己的售后单。
- 售后可记录责任归因和处罚。
- 销售提成规则可维护，并按订单生成提成日志。
- 师傅提成可基于施工记录生成，并支持人工调整。

## 交付范围

MUST：

- 新增 `apps/api/src/after-sales/` 模块。
- 新增 `apps/api/src/commissions/` 模块。
- Prisma 新增 `AfterSale`、`AfterSaleAssignment`、`Penalty`、`SalesCommissionRule`、`SalesCommissionLog`、`WorkerCommission`。
- 权限策略新增 `canManageAfterSales`、`canManageCommission`。
- 前端新增 `/after-sales` 和 `/commissions` 页面。

MUST NOT：

- 不实现完整 HR、考勤工资和复杂组织架构。
- 不实现财务报销、发票、返利和经营报表。
- 不把售后处罚直接写入财务流水，Phase 5 再对接财务。

## API

- `GET /after-sales`
- `POST /after-sales`
- `POST /after-sales/:id/assign`
- `POST /after-sales/:id/responsibility`
- `GET /commissions/sales-rules`
- `POST /commissions/sales-rules`
- `POST /commissions/orders/:orderId/sales`
- `POST /commissions/records/:recordId/workers`

## 验收

- 售后单可从订单创建，自动带出客户和质保关联。
- 售后派单只能选择本门店师傅或学徒。
- 销售查看售后列表时只能返回本人订单对应售后单。
- 师傅和学徒查看售后列表时只能返回指派给自己的售后单。
- 售后派单、处罚人员和师傅提成调整人员选择器必须展示施工人员业务标签，不得要求业务人员读取人员 ID。
- 师傅提成的施工记录选择器必须展示施工状态中文业务标签，不得要求业务人员读取施工状态枚举。
- 责任判断可记录施工、材料、门店、客户等归因。
- 施工责任可生成处罚记录。
- 销售提成按启用规则生成，订单维度唯一。
- 销售提成规则类型在列表和表单中展示中文业务文案。
- 师傅提成按订单和施工人员唯一，支持人工调整后重算。

## 测试计划

- `PermissionPolicy` 售后和提成权限单元测试。
- `AfterSalesService` 创建、派单、责任判断和处罚测试。
- `CommissionsService` 规则创建、销售提成、师傅提成测试。
- Prisma schema 不变量测试。
- Web API client 请求路径测试。
