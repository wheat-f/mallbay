import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import {
  checkDatabaseInvariants,
  formatDatabaseInvariantViolations
} from "./database-invariants";

const NON_BLOCKING_LEGACY_INVARIANTS = new Set(["customer_vehicle_has_identity"]);

export async function runDatabaseInvariantPreflight() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const violations = await checkDatabaseInvariants(prisma);
    const blockingViolations = violations.filter(
      (violation) => !NON_BLOCKING_LEGACY_INVARIANTS.has(violation.invariant)
    );
    const legacyWarnings = violations.filter((violation) =>
      NON_BLOCKING_LEGACY_INVARIANTS.has(violation.invariant)
    );
    if (legacyWarnings.length > 0) {
      console.warn(
        "数据库存在历史数据质量提醒，已跳过启动阻断：\n" +
          formatDatabaseInvariantViolations(legacyWarnings)
      );
    }
    if (blockingViolations.length > 0) {
      throw new Error(formatDatabaseInvariantViolations(blockingViolations));
    }

    console.log(
      legacyWarnings.length > 0
        ? "数据库不变量预检通过（含历史数据质量提醒）。"
        : "数据库不变量预检通过。"
    );
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
