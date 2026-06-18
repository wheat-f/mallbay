import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  checkDatabaseInvariants,
  formatDatabaseInvariantViolations
} from "./database-invariants";

export async function runDatabaseInvariantPreflight() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const violations = await checkDatabaseInvariants(prisma);
    if (violations.length > 0) {
      throw new Error(formatDatabaseInvariantViolations(violations));
    }

    console.log("数据库不变量预检通过。");
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void runDatabaseInvariantPreflight().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
