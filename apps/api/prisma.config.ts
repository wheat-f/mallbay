import { defineConfig } from "prisma/config";
import { getPrismaCliDatabaseUrl } from "./src/config/env";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations"
  },
  datasource: {
    url: getPrismaCliDatabaseUrl()
  }
});
