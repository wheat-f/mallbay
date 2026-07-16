# MallBay

门店 SaaS monorepo，使用 pnpm workspace + Nx 管理：

- `apps/web`: Next.js + TypeScript + Tailwind + TanStack Query + Zustand + React Hook Form + Ant Design
- `apps/api`: NestJS + Prisma + PostgreSQL + Redis 依赖预置
- `packages/shared`: 前后端共享类型

## 快速开始

```bash
cp .env.example .env
pnpm install
docker compose up -d
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

默认端口：

- Web: http://localhost:3000
- API: http://localhost:3001
- PostgreSQL: localhost:5432
- Redis: localhost:6379

## 已完成认证接口

- `POST /auth/register`: 创建个人账号，返回 access token + refresh token
- `POST /auth/login`: 登录并签发 token
- `POST /auth/refresh`: 校验并轮换 refresh token
- `GET /auth/me`: 使用 bearer access token 获取当前用户
- `POST /auth/logout`: 清除服务端 refresh token

## 项目治理文档

- [docs/README.md](./docs/README.md): 项目文档索引
- [docs/DOCUMENTATION_GUIDELINES.md](./docs/DOCUMENTATION_GUIDELINES.md): 文档目录、命名、内容和维护规范
- [docs/governance/ARCHITECTURE.md](./docs/governance/ARCHITECTURE.md): 架构边界、分层规则和模块职责
- [docs/governance/CONTRIBUTING.md](./docs/governance/CONTRIBUTING.md): 分支、提交、PR、评审和协作规则
- [docs/governance/CODE_STYLE.md](./docs/governance/CODE_STYLE.md): TypeScript、NestJS、React、Prisma 编码规范
- [docs/governance/API_GUIDELINES.md](./docs/governance/API_GUIDELINES.md): REST API、错误、分页、鉴权和版本策略
- [docs/governance/REFACTOR_PLAN.md](./docs/governance/REFACTOR_PLAN.md): 当前问题清单和渐进式改造路线
- [docs/features/sales-order-pricing-engine-implementation-plan.md](./docs/features/sales-order-pricing-engine-implementation-plan.md): 销售订单智能建议价、价格规则、报价审批与毛利保护实施计划
- [docs/features/sales-order-construction-charge-cost-implementation-plan.md](./docs/features/sales-order-construction-charge-cost-implementation-plan.md): 销售订单施工收费、标准工时、预计/实际成本、毛利与结算调整实施计划
- [docs/qa/sales-order-construction-cost-checklist.md](./docs/qa/sales-order-construction-cost-checklist.md): 施工收费、成本核算、灰度和回滚验收清单
- [docs/features/paint-protection-film-system-plan.md](./docs/features/paint-protection-film-system-plan.md): 漆面保护膜施工管理系统 V1.7 需求建设方案
- [docs/features/v1-7-requirements-gap-plan.md](./docs/features/v1-7-requirements-gap-plan.md): V1.7 全功能需求差距与验收计划
- [docs/features/v1-7-local-verification-audit.md](./docs/features/v1-7-local-verification-audit.md): V1.7 本地验收审计
- [docs/features/prototype-ui-optimization-plan.md](./docs/features/prototype-ui-optimization-plan.md): 最新 Stitch 原型 UI 信息架构优化方案
- [docs/features/order-requirements-alignment-plan.md](./docs/features/order-requirements-alignment-plan.md): 订单创建与 V1.7 需求对齐实施计划
- [docs/features/phase-1-customers-orders-plan.md](./docs/features/phase-1-customers-orders-plan.md): Phase 1 客户、产品、订单和收款实施计划
- [docs/features/phase-1-customers-orders.md](./docs/features/phase-1-customers-orders.md): Phase 1 客户、订单、产品和收款功能说明
- [docs/features/phase-2-construction-plan.md](./docs/features/phase-2-construction-plan.md): Phase 2 施工容量、派单与施工记录实施计划
- [docs/features/phase-2-construction.md](./docs/features/phase-2-construction.md): Phase 2 施工容量、派单与施工记录功能说明
- [docs/features/phase-3-inventory-warranty-plan.md](./docs/features/phase-3-inventory-warranty-plan.md): Phase 3 库存、采购与质保实施计划
- [docs/features/phase-3-inventory-purchase-improvement-plan.md](./docs/features/phase-3-inventory-purchase-improvement-plan.md): Phase 3 库存采购改进实施计划
- [docs/features/phase-3-inventory-warranty.md](./docs/features/phase-3-inventory-warranty.md): Phase 3 库存、采购与质保功能说明
- [docs/features/phase-4-after-sales-commission-plan.md](./docs/features/phase-4-after-sales-commission-plan.md): Phase 4 售后、人员与提成实施计划
- [docs/features/phase-4-after-sales-commission.md](./docs/features/phase-4-after-sales-commission.md): Phase 4 售后、人员与提成功能说明
- [docs/features/phase-5-finance-invoice-rebate-report-plan.md](./docs/features/phase-5-finance-invoice-rebate-report-plan.md): Phase 5 财务、发票、返利与报表实施计划
- [docs/features/phase-5-finance-invoice-rebate-report.md](./docs/features/phase-5-finance-invoice-rebate-report.md): Phase 5 财务、发票、返利与报表功能说明
- [docs/features/phase-6-mini-offline-plan.md](./docs/features/phase-6-mini-offline-plan.md): Phase 6 微信小程序与离线实施计划
- [docs/features/phase-6-mini-offline.md](./docs/features/phase-6-mini-offline.md): Phase 6 微信小程序与离线功能说明
- [docs/features/phase-6-mini-program-integration-plan.md](./docs/features/phase-6-mini-program-integration-plan.md): Phase 6 微信小程序联调与发布实施计划
- [docs/features/phase-6-mini-program-acceptance.md](./docs/features/phase-6-mini-program-acceptance.md): Phase 6 微信小程序真机验收脚本
- [docs/features/phase-6-mini-program-release-checklist.md](./docs/features/phase-6-mini-program-release-checklist.md): Phase 6 微信小程序发布前检查清单
- [docs/deploy-setup.md](./docs/deploy-setup.md): 部署配置说明

## 测试账号
邮箱：owner+smoke@mallbay.test
密码：password123
