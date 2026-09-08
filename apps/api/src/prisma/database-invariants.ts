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
  },
  {
    invariant: "customer_vehicle_unique_normalized_plate",
    message: "同一门店不能存在重复的标准化车牌",
    query: `
      SELECT customer."storeId",
             REGEXP_REPLACE(UPPER(TRIM(vehicle."carPlate")), '\\s+', '', 'g') AS "carPlateNormalized",
             COUNT(*)::int AS "count",
             ARRAY_AGG(vehicle."id" ORDER BY vehicle."id") AS "vehicleIds"
      FROM "CustomerVehicle" vehicle
      JOIN "Customer" customer ON customer."id" = vehicle."customerId"
      WHERE NULLIF(REGEXP_REPLACE(UPPER(TRIM(vehicle."carPlate")), '\\s+', '', 'g'), '') IS NOT NULL
      GROUP BY customer."storeId", REGEXP_REPLACE(UPPER(TRIM(vehicle."carPlate")), '\\s+', '', 'g')
      HAVING COUNT(*) > 1
      ORDER BY customer."storeId", "carPlateNormalized"
    `
  },
  {
    invariant: "customer_vehicle_unique_vin",
    message: "同一门店不能存在重复的 VIN 标识",
    query: `
      SELECT customer."storeId", vehicle."vinHash", COUNT(*)::int AS "count",
             ARRAY_AGG(vehicle."id" ORDER BY vehicle."id") AS "vehicleIds"
      FROM "CustomerVehicle" vehicle
      JOIN "Customer" customer ON customer."id" = vehicle."customerId"
      WHERE vehicle."vinHash" IS NOT NULL
      GROUP BY customer."storeId", vehicle."vinHash"
      HAVING COUNT(*) > 1
      ORDER BY customer."storeId", vehicle."vinHash"
    `
  },
  {
    invariant: "customer_vehicle_has_identity",
    message: "车辆至少需要车牌或 VIN 之一",
    query: `
      SELECT vehicle."id", vehicle."customerId"
      FROM "CustomerVehicle" vehicle
      WHERE NULLIF(REGEXP_REPLACE(TRIM(vehicle."carPlate"), '\\s+', '', 'g'), '') IS NULL
        AND vehicle."vinHash" IS NULL
      ORDER BY vehicle."id"
    `
  },
  {
    invariant: "order_vehicle_customer_consistency",
    message: "订单车辆必须归属于订单客户",
    query: `
      SELECT orders."id" AS "orderId", orders."customerId" AS "orderCustomerId",
             vehicle."id" AS "vehicleId", vehicle."customerId" AS "vehicleCustomerId"
      FROM "Order" orders
      JOIN "CustomerVehicle" vehicle ON vehicle."id" = orders."vehicleId"
      WHERE orders."customerId" <> vehicle."customerId"
      ORDER BY orders."id"
    `
  },
  {
    invariant: "active_store_member_has_matching_role_binding",
    message: "每位在职门店成员必须拥有与其岗位对应的有效门店角色绑定",
    query: `
      SELECT member."userId", member."storeId", member."position"
      FROM "StoreMember" member
      LEFT JOIN "PermissionRole" role
        ON role."code" = member."position"::text
       AND role."status" = 'ACTIVE'
      LEFT JOIN "PermissionRoleBinding" binding
        ON binding."userId" = member."userId"
       AND binding."roleId" = role."id"
       AND binding."scopeType" = 'STORE'
       AND binding."storeId" = member."storeId"
       AND binding."status" = 'ACTIVE'
       AND binding."effectiveAt" <= CURRENT_TIMESTAMP
       AND (binding."expiredAt" IS NULL OR binding."expiredAt" > CURRENT_TIMESTAMP)
      WHERE binding."id" IS NULL
      ORDER BY member."storeId", member."userId"
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
