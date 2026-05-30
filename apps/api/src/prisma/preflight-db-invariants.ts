import { PrismaClient } from "@prisma/client";
import {
  checkDatabaseInvariants,
  formatDatabaseInvariantViolations
} from "./database-invariants";

export async function runDatabaseInvariantPreflight() {
  const prisma = new PrismaClient();

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
