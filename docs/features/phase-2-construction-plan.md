# Phase 2 施工容量、派单与施工记录实施计划

- 文档类型：功能实施计划
- 文档状态：已实施，作为执行记录保留
- 适用范围：MallBay Phase 2 施工容量、派单、施工执行、施工照片、质检和师傅提成快照
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)、[Phase 1 客户订单收款功能说明](./phase-1-customers-orders.md)、[架构规范](../governance/ARCHITECTURE.md)、[API 规范](../governance/API_GUIDELINES.md)

> **执行要求：** 本计划用于分任务实施。执行时 MUST 使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务推进。任务使用 checkbox 追踪状态。

**目标：** 让 Phase 1 销售订单进入施工履约流程，覆盖容量校验、施工主管派单、师傅任务、施工照片、完工确认、质检和师傅提成快照。

**架构原则：** MUST 保持当前模块化单体架构。后端新增 `apps/api/src/construction/` 聚焦模块；订单创建仍在 `orders` 模块内完成，但预约容量校验必须在后端交易内执行。前端新增 `apps/web/app/construction/` 页面，并通过类型化 API client 访问后端。

**回滚原则：** 数据库变更通过 Prisma migration 管理；施工能力使用新增路由接入，不重写 Phase 1 客户、产品、订单和收款主链路；每个任务必须可独立验证。

## 文档规范符合性

MUST：

- 本文作为功能实施计划，存放在 `docs/features/`，符合 [文档规范](../DOCUMENTATION_GUIDELINES.md) 的功能文档分类。
- 已交付功能说明另行创建为 `docs/features/phase-2-construction.md`。
- 修改本文时 MUST 同步检查 [文档索引](../README.md) 和根 `README.md`。

MUST NOT：

- 把 Phase 3 的库存、采购、质保混入本阶段。
- 把微信小程序、离线队列或智能施工人员推荐写成本阶段已交付能力。

## 实施范围

MUST：

- 每日施工容量设置，按店内、店外、玻璃膜、复检四类控制。
- 创建带预约日期的订单时校验容量，超量或未设置容量时拒绝下单。
- 施工主管、店长、管理员可派单，支持 1 到 3 名施工人员。
- 销售只能查看本人订单对应施工记录，师傅和学徒只能处理分配给自己的施工任务。
- 施工照片阶段固定为施工前、施工中、施工后。
- 完工前必须存在施工前和施工后照片。
- 完工时记录实际用时，超过 8 小时记录超时分钟数。
- 施工主管、店长、管理员可质检。
- 完工时生成师傅提成快照，复杂提成规则进入 Phase 4。

MUST NOT：

- 实现库存扣减、采购需求、质保卡、售后、发票、返利、报表或小程序离线同步。
- 前端直接写 `Order.status`，订单施工状态必须通过施工 API 流转。

## 文件结构

计划新增或修改以下文件：

```text
apps/api/prisma/schema.prisma
apps/api/prisma/migrations/20260601120000_phase2_construction/migration.sql
apps/api/src/app.module.ts
apps/api/src/common/policies/permission.policy.ts
apps/api/src/common/policies/permission.policy.test.ts
apps/api/src/orders/use-cases/create-order.use-case.ts
apps/api/src/orders/use-cases/create-order.use-case.test.ts
apps/api/src/prisma/database-invariants.test.ts
apps/api/src/users/oss.service.ts
apps/api/src/construction/construction.module.ts
apps/api/src/construction/construction.controller.ts
apps/api/src/construction/construction.service.ts
apps/api/src/construction/construction.service.test.ts
apps/api/src/construction/dto/construction.dto.ts
packages/shared/src/index.ts
apps/web/src/features/construction/api.ts
apps/web/src/features/construction/api.test.ts
apps/web/src/lib/api.ts
apps/web/app/construction/capacities/page.tsx
apps/web/app/construction/assignments/page.tsx
apps/web/app/construction/orders/[id]/page.tsx
apps/web/app/construction/tasks/page.tsx
docs/features/phase-2-construction-plan.md
docs/features/phase-2-construction.md
docs/README.md
README.md
```

## 任务清单

- [x] 任务 1：权限与状态机基础。
- [x] 任务 2：Prisma 模型与 migration。
- [x] 任务 3：容量 API 与订单容量校验。
- [x] 任务 4：派单 API。
- [x] 任务 5：施工执行与照片。
- [x] 任务 6：质检与师傅提成快照。
- [x] 任务 7：Web 页面与 API client。
- [x] 任务 8：文档与完整验证。

## 验收路径

1. 店长或施工主管设置某日施工容量。
2. 销售创建带预约日期的订单，容量不足时被拒绝。
3. 施工主管给待派工订单分配 1 到 3 名施工人员。
4. 派工、施工任务、施工详情和关联业务选择器使用施工人员姓名/账号/技能标签与施工状态中文业务标签展示，不要求业务人员读取人员 ID 或状态枚举。
5. 被派施工人员看到自己的任务并开工。
6. 施工人员上传施工前、施工中、施工后照片。
7. 施工人员完工，系统记录实际用时和超时分钟数。
8. 施工主管录入质检结果。

## 验证命令

```bash
corepack pnpm --filter @mallbay/api test
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web test
corepack pnpm --filter @mallbay/web typecheck
corepack pnpm --filter @mallbay/shared typecheck
corepack pnpm lint
git diff --check
```

## 自查清单

- [x] Phase 2 不合并 Phase 3 的库存、采购和质保。
- [x] 施工容量由后端在订单创建事务内校验。
- [x] 派单、开工、完工和质检通过施工 API 控制。
- [x] 销售只能访问本人订单对应施工记录，施工人员只能访问分配给自己的施工任务。
- [x] 施工照片按阶段保存并可追溯上传人，前端使用施工人员业务标签展示上传人和派工人员。
- [x] 完工生成师傅提成快照，但不实现复杂提成规则。
