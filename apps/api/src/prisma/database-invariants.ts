type Queryable = {
  $queryRawUnsafe<T = unknown>(query: string): Promise<T>;
};

export type DatabaseInvariantViolation = {
  invariant: string;
  message: string;
  rows: unknown[];
};

type DatabaseInvariantCheck = {
  invariant: string;
  message: string;
  query: string;
};

const databaseInvariantChecks: DatabaseInvariantCheck[] = [
  {
    invariant: "store_photo_single_cover",
    message: "同一门店最多只能有一张对外展示封面图",
    query: `
      SELECT "storeId", COUNT(*)::int AS "count"
      FROM "StorePhoto"
      WHERE "isCover" = true
      GROUP BY "storeId"
      HAVING COUNT(*) > 1
      ORDER BY "storeId"
    `
  },
  {
    invariant: "store_audit_submission_single_pending",
    message: "同一门店同一时间最多只能有一条待审核提交",
    query: `
      SELECT "storeId", COUNT(*)::int AS "count"
      FROM "StoreAuditSubmission"
      WHERE "status" = 'PENDING'
      GROUP BY "storeId"
      HAVING COUNT(*) > 1
      ORDER BY "storeId"
    `
  },
  {
    invariant: "store_submission_photo_single_cover",
    message: "同一送审提交最多只能有一张封面图",
    query: `
      SELECT "submissionId", COUNT(*)::int AS "count"
      FROM "StoreSubmissionPhoto"
      WHERE "isCover" = true
      GROUP BY "submissionId"
      HAVING COUNT(*) > 1
      ORDER BY "submissionId"
    `
  }
];

export async function checkDatabaseInvariants(prisma: Queryable) {
  const violations: DatabaseInvariantViolation[] = [];

  for (const check of databaseInvariantChecks) {
    const rows = await prisma.$queryRawUnsafe<unknown[]>(check.query);
    if (rows.length > 0) {
      violations.push({
        invariant: check.invariant,
        message: check.message,
        rows
      });
    }
  }

  return violations;
}

export function formatDatabaseInvariantViolations(violations: DatabaseInvariantViolation[]) {
  const details = violations
    .map((violation) => {
      const rows = JSON.stringify(violation.rows);
      return `- ${violation.invariant}: ${violation.message}; rows=${rows}`;
    })
    .join("\n");

  return `数据库不变量预检失败，需先清理重复数据后再执行约束 migration。\n${details}`;
}
