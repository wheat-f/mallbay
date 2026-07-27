import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// prisma generate 不需要真实数据库，用 placeholder 占位即可。
// prisma migrate deploy 在运行时容器里执行，此时 DATABASE_URL 已由 docker-compose 注入。
export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations"
  },
  datasource: {
    url: getDatabaseUrl()
  }
});

function getDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  const envFiles = [path.resolve(process.cwd(), ".env"), path.resolve(process.cwd(), "../../.env")];
  for (const envFile of envFiles) {
    if (!existsSync(envFile)) continue;
    const line = readFileSync(envFile, "utf8")
      .split(/\r?\n/)
      .find((value) => /^\s*DATABASE_URL\s*=/.test(value));
    if (!line) continue;
    // Split only at the first equals sign. Connection URLs commonly contain query parameters such as `schema=public`; truncating at a second equals produces an invalid URL and makes Prisma issue `SET search_path = ""`.
    const separator = line.indexOf("=");
    const value = separator >= 0 ? line.slice(separator + 1).trim() : undefined;
    if (value) return value.replace(/^['"]|['"]$/g, "");
  }

  return "postgresql://postgres:postgres@localhost:5432/mallbay?schema=public";
}
