import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { Client } from "pg";

/**
 * This test is intentionally opt-in. The regular unit-test suite must remain
 * hermetic, while the Inventory/Procurement stage gate needs one real
 * PostgreSQL check for the idempotency boundary.
 */
const enabled = process.env.MALLBAY_RUN_REAL_DB_TESTS === "1";

test("real PostgreSQL rejects a concurrent duplicate inventory movement idempotency key", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  const cleanup = new Client({ connectionString });
  const sourceId = `stage-gate-${randomUUID()}`;
  const idempotencyKey = "same-key";
  const movementParams = (id: string, context: { storeId: string; batchId: string; productId: string; userId: string }) => [
    id,
    context.storeId,
    context.batchId,
    context.productId,
    sourceId,
    idempotencyKey,
    context.userId
  ];
  const insertSql = `
    INSERT INTO "InventoryMovement" (
      "id", "storeId", "batchId", "productId", "movementType", "quantity", "unit",
      "sourceType", "sourceId", "idempotencyKey", "createdById"
    ) VALUES ($1, $2, $3, $4, 'STOCK_ADJUST', 1, 'PIECE', 'STAGE_GATE', $5, $6, $7)
  `;

  try {
    await Promise.all([first.connect(), second.connect(), cleanup.connect()]);
    const contextResult = await cleanup.query<{
      storeId: string;
      batchId: string;
      productId: string;
      userId: string;
    }>(`
      SELECT b."storeId" AS "storeId", b.id AS "batchId", b."productId" AS "productId", u.id AS "userId"
      FROM "InventoryBatch" b
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has no inventory batch and user fixture");
      return;
    }
    const context = contextResult.rows[0];

    await first.query("BEGIN");
    await second.query("BEGIN");
    await first.query(insertSql, movementParams(randomUUID(), context));

    // Submit the competing insert before the first transaction commits. The
    // unique index makes PostgreSQL wait for that decision, then reject it.
    const competingInsert = second.query(insertSql, movementParams(randomUUID(), context));
    await new Promise((resolve) => setTimeout(resolve, 75));
    await first.query("COMMIT");

    await assert.rejects(competingInsert, (error: { code?: string }) => error.code === "23505");
    await second.query("ROLLBACK");
  } finally {
    await first.query("ROLLBACK").catch(() => undefined);
    await second.query("ROLLBACK").catch(() => undefined);
    await cleanup.query(
      `DELETE FROM "InventoryMovement" WHERE "sourceType" = 'STAGE_GATE' AND "sourceId" = $1 AND "idempotencyKey" = $2`,
      [sourceId, idempotencyKey]
    ).catch(() => undefined);
    await Promise.all([
      first.end().catch(() => undefined),
      second.end().catch(() => undefined),
      cleanup.end().catch(() => undefined)
    ]);
  }
});

test("real PostgreSQL conditional capacity update prevents concurrent overbooking", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  const cleanup = new Client({ connectionString });
  const capacityId = randomUUID();
  const capacityDate = "2099-01-01";

  try {
    await Promise.all([first.connect(), second.connect(), cleanup.connect()]);
    const storeResult = await cleanup.query<{ id: string }>(`SELECT id FROM "Store" LIMIT 1`);
    if (storeResult.rowCount !== 1) {
      t.skip("the local database has no store fixture");
      return;
    }
    const storeId = storeResult.rows[0].id;
    const createdAt = new Date();
    await cleanup.query(
      `INSERT INTO "DailyCapacity" ("id", "storeId", "date", "inStoreCapacity", "createdAt", "updatedAt") VALUES ($1, $2, $3, 1, $4, $4)`,
      [capacityId, storeId, capacityDate, createdAt]
    );

    const updateSql = `
      UPDATE "DailyCapacity"
      SET "inStoreReserved" = "inStoreReserved" + 1
      WHERE "id" = $1 AND "inStoreReserved" < "inStoreCapacity"
    `;
    await first.query("BEGIN");
    await second.query("BEGIN");
    const firstUpdate = await first.query(updateSql, [capacityId]);
    const competingUpdate = second.query(updateSql, [capacityId]);
    await new Promise((resolve) => setTimeout(resolve, 75));
    await first.query("COMMIT");
    const secondUpdate = await competingUpdate;
    await second.query("COMMIT");

    assert.equal(firstUpdate.rowCount, 1);
    assert.equal(secondUpdate.rowCount, 0);
    const final = await cleanup.query<{ inStoreReserved: number }>(
      `SELECT "inStoreReserved" FROM "DailyCapacity" WHERE "id" = $1`,
      [capacityId]
    );
    assert.equal(final.rows[0].inStoreReserved, 1);
  } finally {
    await first.query("ROLLBACK").catch(() => undefined);
    await second.query("ROLLBACK").catch(() => undefined);
    await cleanup.query(`DELETE FROM "DailyCapacity" WHERE "id" = $1`, [capacityId]).catch(() => undefined);
    await Promise.all([
      first.end().catch(() => undefined),
      second.end().catch(() => undefined),
      cleanup.end().catch(() => undefined)
    ]);
  }
});
