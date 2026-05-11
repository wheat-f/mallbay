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

## 测试账号
邮箱：owner+smoke@mallbay.test
密码：password123