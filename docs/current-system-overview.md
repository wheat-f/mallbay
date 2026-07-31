# MallBay 当前系统概览

> 文档类型：当前实现说明
> 状态：以代码为准，持续维护
> 适用范围：当前 Nx monorepo、Web 管理端、API、数据库和本地开发环境
> 来源依据：`apps/api/src/`、`apps/web/app/`、`apps/web/src/`、`apps/api/prisma/schema.prisma`、`.github/workflows/deploy.yml`

## 1. 系统形态

MallBay 当前是 Nx monorepo 下的模块化单体：

- `apps/web`：Next.js 16、React、Ant Design、TanStack Query、Zustand。
- `apps/api`：NestJS、Prisma 7、PostgreSQL；Redis 用于本地和部署环境的基础设施。
- `packages/shared`：前后端共享类型和业务契约。
- 本地依赖：`docker-compose.yml` 提供 PostgreSQL `5432` 和 Redis `16379`。

本地启动：

```bash
pnpm install
pnpm prisma:generate
pnpm dev
```

默认地址：

- Web：`http://localhost:3000`
- API：`http://localhost:3001`
- API 健康检查：`GET /health`

## 2. 当前业务域

后端主要模块位于 `apps/api/src/`：

- `auth`、`users`、`stores`、`members`、`notifications`
- `customers`、`products`、`orders`、`sales-quotes`
- `inventory`、`purchases`、`construction`
- `warranties`、`after-sales`、`commissions`
- `finance`、`invoices`、`rebates`、`reports`
- `settings`、`prisma`、`common`

Web 主要管理入口位于 `apps/web/app/`，包括客户、订单、库存/采购、施工、质保、售后、财务、发票、返利、提成、报表和系统设置。

## 3. 订单履约的当前事实口径

“订单完成”只表示客户尾款结清后的最终交付，不等同于施工记录完成。

```text
订单创建（允许零定金）
  → 库存匹配（人工选择批次和数量锁库）
  → 出库
  → 施工派工 / 领取物料 / 开工
  → 施工完成
  → 待质检
  → 质检通过
  → 生成质保卡（尾款未清时为 PENDING_ACTIVATION）
  → 尾款结清
  → 系统事务内最终交付
      ├─ 质保卡 ACTIVE，起始日为最终交付日
      ├─ 未生成质保卡时自动创建并同时生效
      ├─ 订单标记 COMPLETED
      └─ 关闭尾款待办并写入审计事件
```

关键规则：

- 质检不通过进入独立返工状态；返工复用 `ConstructionRecord` 快照和 `AuditEvent`，不新增 `ReworkRecord`。
- 尾款未结清允许生成质保卡，但质保有效期不开始计算。
- 采购到货只增加可用库存，由采购或店长人工确认；到货不会自动锁定订单库存。
- 尾款待办通过站内通知生成，销售/财务在工作台查看；同一订单去重，阅读不等于处理，尾款结清或订单取消时关闭。
- 历史已完成订单若缺失质检记录，不回写历史事实，进入历史待核验列表。
- 当前阶段由现有订单/施工状态、质检、质保和收款数据派生，不扩张为大量订单状态枚举。

实现入口：

- `apps/api/src/orders/domain/order-workflow.ts`
- `apps/api/src/orders/domain/order-delivery.ts`
- `apps/api/src/orders/orders.service.ts`
- `apps/api/src/construction/construction.service.ts`
- `apps/api/src/warranties/warranties.service.ts`
- `apps/api/src/notifications/notifications.service.ts`

## 4. 数据和迁移

订单流程优化迁移位于：

`apps/api/prisma/migrations/20260731120000_order_end_to_end_flow_optimization/migration.sql`

本迁移包含质保待生效状态、质保日期可空、尾款待办字段、返工审计字段和收款幂等键等变更。部署环境必须先执行数据库迁移，再启动 API。

## 5. 验证命令

```bash
pnpm --dir apps/api test
pnpm --dir apps/web test
pnpm --dir apps/api exec tsc -p tsconfig.app.json --noEmit --pretty false
pnpm --dir apps/web exec tsc -p tsconfig.json --noEmit --pretty false
pnpm --dir apps/api exec prisma validate --schema prisma/schema.prisma
```

当前已验证：API 全量测试 `384/384`，Web 全量测试 `606/606`。

## 6. 文档维护规则

- 业务流程、状态口径和 API 行为变更时，必须同步更新本概览、端到端流程图和验收清单。
- 带 `plan`、`phase`、`review` 的文件主要记录历史方案、评审或实施过程，不自动代表当前实现。
- 如果历史文档与代码冲突，以当前代码、数据库 schema、迁移和测试为准，并在对应历史文档中补充“历史记录”说明。
