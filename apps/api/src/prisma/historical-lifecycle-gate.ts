import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

type Queryable = {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
};

export type HistoricalLifecycleViolation = {
  invariant: string;
  message: string;
  rows: unknown[];
};

const checks = [
  {
    invariant: "terminal_order_quality_missing",
    message: "已完成/已质保订单缺少质检结果",
    query: `
      SELECT orders."id" AS "orderId", orders."status", record."id" AS "constructionRecordId"
      FROM "Order" orders
      LEFT JOIN "ConstructionRecord" record ON record."orderId" = orders."id"
      WHERE orders."status" IN ('COMPLETED', 'WARRANTIED')
        AND (record."id" IS NULL OR record."qualityResult" IS NULL)
      ORDER BY orders."id"
    `
  },
  {
    invariant: "terminal_order_warranty_missing",
    message: "已完成/已质保订单缺少有效质保事实",
    query: `
      SELECT orders."id" AS "orderId", orders."status"
      FROM "Order" orders
      LEFT JOIN "Warranty" warranty ON warranty."orderId" = orders."id"
      WHERE orders."status" IN ('COMPLETED', 'WARRANTIED')
        AND (warranty."id" IS NULL OR warranty."status" <> 'ACTIVE')
      ORDER BY orders."id"
    `
  },
  {
    invariant: "historical_violation_without_case",
    message: "已识别的终态历史矛盾没有 OPEN 履约核验单",
    query: `
      SELECT orders."id" AS "orderId", orders."status"
      FROM "Order" orders
      LEFT JOIN "ConstructionRecord" record ON record."orderId" = orders."id"
      LEFT JOIN "Warranty" warranty ON warranty."orderId" = orders."id"
      WHERE orders."status" IN ('COMPLETED', 'WARRANTIED')
        AND (
          record."id" IS NULL OR record."qualityResult" IS NULL
          OR warranty."id" IS NULL OR warranty."status" <> 'ACTIVE'
        )
        AND NOT EXISTS (
          SELECT 1 FROM "OrderLifecycleVerificationCase" verification
          WHERE verification."orderId" = orders."id" AND verification."status" = 'OPEN'
        )
      ORDER BY orders."id"
    `
  },
  {
    invariant: "applied_command_without_version_change",
    message: "已应用履约命令缺少对应的版本变更账本",
    query: `
      SELECT command."id" AS "commandRecordId", command."orderId", command."commandType"
      FROM "OrderLifecycleCommandRecord" command
      WHERE command."status" = 'SUCCEEDED'
        AND command."orderId" IS NOT NULL
        AND command."beforeVersion" IS NOT NULL
        AND command."afterVersion" IS NOT NULL
        AND command."afterVersion" > command."beforeVersion"
        AND NOT EXISTS (
          SELECT 1 FROM "OrderLifecycleVersionChange" change
          WHERE change."sourceType" = 'COMMAND' AND change."sourceKey" = command."id"
        )
      ORDER BY command."id"
    `
  },
  {
    invariant: "orphan_command_version_change",
    message: "履约版本变更账本引用不存在的命令记录",
    query: `
      SELECT change."id", change."orderId", change."sourceKey"
      FROM "OrderLifecycleVersionChange" change
      WHERE change."sourceType" = 'COMMAND'
        AND NOT EXISTS (
          SELECT 1 FROM "OrderLifecycleCommandRecord" command WHERE command."id" = change."sourceKey"
        )
      ORDER BY change."id"
    `
  }
] as const;

export async function checkHistoricalLifecycleGate(prisma: Queryable) {
  const violations: HistoricalLifecycleViolation[] = [];
  for (const check of checks) {
    const rows = await prisma.$queryRawUnsafe<unknown[]>(check.query);
    if (rows.length > 0) violations.push({ invariant: check.invariant, message: check.message, rows });
  }
  return violations;
}

export function formatHistoricalLifecycleViolations(violations: HistoricalLifecycleViolation[]) {
  return [
    "历史履约数据门禁失败；不得恢复非终态写入，也不得自动覆盖原事实。",
    ...violations.map((violation) => `${violation.invariant}: ${violation.message}; rows=${JSON.stringify(violation.rows)}`)
  ].join("\n");
}

export async function runHistoricalLifecycleGate() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const violations = await checkHistoricalLifecycleGate(prisma);
    if (violations.length > 0) throw new Error(formatHistoricalLifecycleViolations(violations));
    console.log("历史履约数据门禁通过：未发现未建核验单矛盾或版本账本缺口。");
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void runHistoricalLifecycleGate().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
