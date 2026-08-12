# MallBay

MallBay is an open-source full-stack store SaaS reference implementation built with Next.js, NestJS, Prisma, PostgreSQL, and Nx. It provides a reusable foundation for teams exploring multi-store operations, full-stack TypeScript architecture, and modular SaaS development.

MallBay 是一个开源的全栈门店 SaaS 参考实现，采用 pnpm workspace 与 Nx 管理 monorepo，可作为多门店经营、全栈 TypeScript 架构和模块化 SaaS 开发的学习与实践基础。

## 技术栈与项目结构

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
- [docs/deploy-setup.md](./docs/deploy-setup.md): 部署配置说明

## 测试账号
邮箱：owner+smoke@mallbay.test
密码：password123

## 开源许可

MallBay 基于 [Apache License 2.0](./LICENSE) 开源。你可以在许可证约定的范围内使用、修改和分发本项目。
