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
    invariant: "active_store_member_has_store_role_binding",
    message: "每位在职门店成员必须拥有至少一个有效的本店角色绑定",
    query: `
      SELECT member."userId", member."storeId", member."position"
      FROM "StoreMember" member
      WHERE NOT EXISTS (
        SELECT 1 FROM "PermissionRoleBinding" binding
        JOIN "PermissionRole" role ON role."id" = binding."roleId" AND role."status" = 'ACTIVE'
        WHERE binding."userId" = member."userId"
          AND binding."scopeType" = 'STORE'
          AND binding."storeId" = member."storeId"
          AND binding."status" = 'ACTIVE'
          AND binding."effectiveAt" <= CURRENT_TIMESTAMP
          AND (binding."expiredAt" IS NULL OR binding."expiredAt" > CURRENT_TIMESTAMP)
      )
      ORDER BY member."storeId", member."userId"
    `
  },
  {
    invariant: "store_single_manager",
    message: "每家门店必须恰有一名店长",
    query: `
      SELECT store."id" AS "storeId", COUNT(member."id")::int AS "managerCount"
      FROM "Store" store
      LEFT JOIN "StoreMember" member
        ON member."storeId" = store."id" AND member."position" = 'MANAGER'
      GROUP BY store."id"
      HAVING COUNT(member."id") <> 1
      ORDER BY store."id"
    `
  },
  {
    invariant: "store_manager_binding_consistency",
    message: "门店必须恰有一条属于店长的有效 MANAGER 绑定",
    query: `
      SELECT store."id" AS "storeId", member."userId" AS "managerUserId",
             COUNT(binding."id")::int AS "managerBindingCount"
      FROM "Store" store
      LEFT JOIN "StoreMember" member
        ON member."storeId" = store."id" AND member."position" = 'MANAGER'
      LEFT JOIN "PermissionRole" role
        ON role."code" = 'MANAGER' AND role."status" = 'ACTIVE'
      LEFT JOIN "PermissionRoleBinding" binding
        ON binding."storeId" = store."id"
       AND binding."roleId" = role."id"
       AND binding."scopeType" = 'STORE'
       AND binding."status" = 'ACTIVE'
       AND binding."effectiveAt" <= CURRENT_TIMESTAMP
       AND (binding."expiredAt" IS NULL OR binding."expiredAt" > CURRENT_TIMESTAMP)
      GROUP BY store."id", member."userId"
      HAVING COUNT(binding."id") <> 1
         OR BOOL_OR(binding."userId" IS DISTINCT FROM member."userId")
      ORDER BY store."id"
    `
  },
  {
    invariant: "nonmember_store_binding_review",
    message: "非成员的有效门店绑定仅供核查来源，不自动撤销",
    query: `
      SELECT binding."id", binding."userId", binding."storeId", binding."roleId", binding."createdById"
      FROM "PermissionRoleBinding" binding
      LEFT JOIN "StoreMember" member
        ON member."userId" = binding."userId" AND member."storeId" = binding."storeId"
      WHERE binding."scopeType" = 'STORE'
        AND binding."status" = 'ACTIVE'
        AND member."id" IS NULL
      ORDER BY binding."storeId", binding."userId", binding."id"
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
