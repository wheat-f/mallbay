import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrate: {
    async adapter() {
      const { Pool } = await import("pg");
      const { PrismaPg } = await import("@prisma/adapter-pg");
      const connectionString =
        process.env.DATABASE_URL ??
        "postgresql://postgres:postgres@localhost:5432/mallbay?schema=public";
      const pool = new Pool({ connectionString });
      return new PrismaPg(pool);
    }
  }
});
