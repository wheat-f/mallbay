import { defineConfig } from "prisma/config";

// prisma generate 不需要真实数据库，用 placeholder 占位即可。
// prisma migrate deploy 在运行时容器里执行，此时 DATABASE_URL 已由 docker-compose 注入。
export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations"
  },
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://localhost/placeholder"
  }
});
