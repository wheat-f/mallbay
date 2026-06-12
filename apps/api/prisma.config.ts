import { defineConfig } from "prisma/config";
import { getRequiredEnvValue } from "./src/config/env";

export default defineConfig({
  schema: "./prisma/schema.prisma",
  migrations: {
    path: "./prisma/migrations"
  },
  datasource: {
    url: getRequiredEnvValue("DATABASE_URL")
  }
});
