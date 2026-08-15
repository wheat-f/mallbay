import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { ConstructionLocation, ConstructionType } from "@prisma/client";
import { Client } from "pg";
import { PrismaService } from "./prisma.service";
import { OrderLifecycle } from "../orders/domain/order-lifecycle";
import { CreateOrderUseCase } from "../orders/use-cases/create-order.use-case";

/**
 * Opt-in real PostgreSQL fixture for the order lifecycle seam.
 *
 * Both commands intentionally start from the same DISPATCHED/version=1
 * snapshot.  The conditional version predicate is the database boundary that
 * prevents a different-command race from becoming last-write-wins.
 */
const enabled = process.env.MALLBAY_RUN_REAL_DB_TESTS === "1";
let bootstrapCleanup: (() => Promise<void>) | undefined;

before(async (t) => {
  if (!enabled) return;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const existing = await client.query(`
      SELECT c.id
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      JOIN "PricingCalculation" pc ON pc."storeId" = c."storeId"
      LIMIT 1
    `);
    if (existing.rowCount === 0) {
      const suffix = randomUUID();
      const userId = `stage-gate-user-${suffix}`;
      const entityId = `stage-gate-entity-${suffix}`;
      const storeId = `stage-gate-store-${suffix}`;
      const customerId = `stage-gate-customer-${suffix}`;
      const vehicleId = `stage-gate-vehicle-${suffix}`;
      const productId = `stage-gate-product-${suffix}`;
      const paymentAccountId = `stage-gate-payment-account-${suffix}`;
      const ruleSetId = `stage-gate-rules-${suffix}`;
      const calculationId = `stage-gate-calculation-${suffix}`;
      await client.query("BEGIN");
      await client.query(
      `INSERT INTO "User" ("id", "username", "passwordHash", "nickname", "createdAt", "updatedAt") VALUES ($1, $2, 'stage-gate', 'Stage Gate', NOW(), NOW())`,
      [userId, `stage-gate-${suffix}`]
      );
      await client.query(
      `INSERT INTO "FinancialEntity" ("id", "code", "name", "createdAt", "updatedAt") VALUES ($1, $2, 'Stage Gate Entity', NOW(), NOW())`,
      [entityId, `STAGE-${suffix}`]
      );
      await client.query(
      `INSERT INTO "Store" ("id", "status", "name", "financialEntityId", "createdAt", "updatedAt") VALUES ($1, 'PUBLISHED', 'Stage Gate Store', $2, NOW(), NOW())`,
      [storeId, entityId]
      );
      await client.query(
      `INSERT INTO "Customer" ("id", "storeId", "ownerUserId", "customerType", "phoneEncrypted", "phoneHash", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'PERSONAL', 'stage-gate', $4, NOW(), NOW())`,
      [customerId, storeId, userId, `stage-gate-phone-${suffix}`]
      );
      await client.query(
      `INSERT INTO "CustomerVehicle" ("id", "storeId", "customerId", "carModel", "status", "createdAt", "updatedAt") VALUES ($1, $2, $3, 'Stage Gate Vehicle', 'ACTIVE', NOW(), NOW())`,
      [vehicleId, storeId, customerId]
      );
      await client.query(
      `INSERT INTO "Product" ("id", "storeId", "brand", "name", "model", "category", "unit", "inventoryUnit", "salesUnit", "basePriceCents", "status", "createdAt", "updatedAt") VALUES ($1, $2, 'Stage Gate', 'Stage Gate Product', $3, 'PPF', 'ROLL', 'ROLL', 'ROLL', 100, 'ACTIVE', NOW(), NOW())`,
      [productId, storeId, `MODEL-${suffix}`]
      );
      await client.query(
      `INSERT INTO "PaymentAccount" ("id", "storeId", "name", "type", "createdAt", "updatedAt") VALUES ($1, $2, 'Stage Gate Account', 'CORPORATE', NOW(), NOW())`,
      [paymentAccountId, storeId]
      );
      await client.query(
      `INSERT INTO "PricingRuleSet" ("id", "storeId", "version", "status", "effectiveFrom", "createdById", "createdAt", "updatedAt") VALUES ($1, $2, 1, 'PUBLISHED', NOW(), $3, NOW(), NOW())`,
      [ruleSetId, storeId, userId]
      );
      await client.query(
      `INSERT INTO "PricingCalculation" ("id", "storeId", "ruleSetId", "ruleSetVersion", "inputHash", "inputSnapshot", "outputSnapshot", "appliedRules", "createdById", "createdAt") VALUES ($1, $2, $3, 1, 'stage-gate', '{"constructionType":"PPF","constructionLocation":"IN_STORE"}'::jsonb, '{}'::jsonb, '{}'::jsonb, $4, NOW())`,
      [calculationId, storeId, ruleSetId, userId]
      );
      await client.query("COMMIT");
      bootstrapCleanup = async () => {
        const cleanup = new Client({ connectionString });
        await cleanup.connect();
        await cleanup.query(`DELETE FROM "Store" WHERE "id" = $1`, [storeId]);
        await cleanup.query(`DELETE FROM "FinancialEntity" WHERE "id" = $1`, [entityId]);
        await cleanup.query(`DELETE FROM "User" WHERE "id" = $1`, [userId]);
        await cleanup.end();
      };
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
});

after(async () => {
  await bootstrapCleanup?.().catch(() => undefined);
});

test("real PostgreSQL allows only one competing order lifecycle transition", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  const cleanup = new Client({ connectionString });
  const orderId = `stage-gate-order-${randomUUID()}`;
  const orderNo = `SG-${Date.now()}-${randomUUID().slice(0, 8)}`;

  try {
    await Promise.all([first.connect(), second.connect(), cleanup.connect()]);
    const contextResult = await cleanup.query<{
      storeId: string;
      customerId: string;
      userId: string;
    }>(`
      SELECT c."storeId" AS "storeId", c.id AS "customerId", u.id AS "userId"
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has no customer and user fixture");
      return;
    }
    const context = contextResult.rows[0];
    await cleanup.query(
      `
        INSERT INTO "Order" (
          "id", "storeId", "executionStoreId", "orderNo", "customerId",
          "salesPersonId", "constructionType", "constructionLocation",
          "status", "lifecycleVersion", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $2, $3, $4, $5, 'PPF', 'IN_STORE', 'DISPATCHED', 1, NOW(), NOW())
      `,
      [orderId, context.storeId, orderNo, context.customerId, context.userId]
    );

    const transition = `
      UPDATE "Order"
      SET "status" = $2, "lifecycleVersion" = "lifecycleVersion" + 1, "updatedAt" = NOW()
      WHERE "id" = $1 AND "status" = 'DISPATCHED' AND "lifecycleVersion" = 1
    `;
    await first.query("BEGIN");
    await second.query("BEGIN");
    const firstUpdate = await first.query(transition, [orderId, "PENDING_DISPATCH"]);
    const competingUpdate = second.query(transition, [orderId, "IN_CONSTRUCTION"]);

    // The second transaction is blocked on the row lock until the first one
    // commits; it then rechecks the version predicate and affects zero rows.
    await new Promise((resolve) => setTimeout(resolve, 75));
    await first.query("COMMIT");
    const secondUpdate = await competingUpdate;
    await second.query("COMMIT");

    assert.equal(firstUpdate.rowCount, 1);
    assert.equal(secondUpdate.rowCount, 0);
    const final = await cleanup.query<{ status: string; lifecycleVersion: number }>(
      `SELECT "status", "lifecycleVersion" FROM "Order" WHERE "id" = $1`,
      [orderId]
    );
    assert.equal(final.rowCount, 1);
    assert.equal(final.rows[0].status, "PENDING_DISPATCH");
    assert.equal(final.rows[0].lifecycleVersion, 2);
  } finally {
    await first.query("ROLLBACK").catch(() => undefined);
    await second.query("ROLLBACK").catch(() => undefined);
    await cleanup.query(`DELETE FROM "Order" WHERE "id" = $1`, [orderId]).catch(() => undefined);
    await Promise.all([
      first.end().catch(() => undefined),
      second.end().catch(() => undefined),
      cleanup.end().catch(() => undefined)
    ]);
  }
});

test("real PostgreSQL serializes the order lifecycle command race matrix", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }
  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  const cleanup = new Client({ connectionString });
  const cases = [
    { name: "dispatch-vs-cancel", from: "PENDING_DISPATCH", firstStatus: "DISPATCHED", secondStatus: "CANCELLED" },
    { name: "start-vs-return", from: "DISPATCHED", firstStatus: "IN_CONSTRUCTION", secondStatus: "PENDING_DISPATCH" }
  ] as const;
  const createdOrderIds: string[] = [];
  try {
    await Promise.all([first.connect(), second.connect(), cleanup.connect()]);
    const contextResult = await cleanup.query<{ storeId: string; customerId: string; userId: string }>(`
      SELECT c."storeId" AS "storeId", c.id AS "customerId", u.id AS "userId"
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has no customer and user fixture");
      return;
    }
    const context = contextResult.rows[0];
    for (const race of cases) {
      const orderId = `stage-gate-race-${race.name}-${randomUUID()}`;
      createdOrderIds.push(orderId);
      await cleanup.query(
        `
          INSERT INTO "Order" (
            "id", "storeId", "executionStoreId", "orderNo", "customerId", "salesPersonId",
            "constructionType", "constructionLocation", "status", "lifecycleVersion", "createdAt", "updatedAt"
          ) VALUES ($1, $2, $2, $3, $4, $5, 'PPF', 'IN_STORE', $6, 1, NOW(), NOW())
        `,
        [orderId, context.storeId, `SG-RM-${Date.now()}-${randomUUID().slice(0, 8)}`, context.customerId, context.userId, race.from]
      );
      const transition = `
        UPDATE "Order"
        SET "status" = $2, "lifecycleVersion" = "lifecycleVersion" + 1, "updatedAt" = NOW()
        WHERE "id" = $1 AND "status" = $3 AND "lifecycleVersion" = 1
      `;
      await first.query("BEGIN");
      await second.query("BEGIN");
      const firstUpdate = await first.query(transition, [orderId, race.firstStatus, race.from]);
      const competingUpdate = second.query(transition, [orderId, race.secondStatus, race.from]);
      await new Promise((resolve) => setTimeout(resolve, 50));
      await first.query("COMMIT");
      const secondResult = await competingUpdate;
      await second.query("COMMIT");
      assert.equal(firstUpdate.rowCount, 1, `${race.name}: first command must win`);
      assert.equal(secondResult.rowCount, 0, `${race.name}: competing command must conflict`);
      const final = await cleanup.query<{ status: string; lifecycleVersion: number }>(`SELECT "status", "lifecycleVersion" FROM "Order" WHERE "id" = $1`, [orderId]);
      assert.equal(final.rows[0].status, race.firstStatus);
      assert.equal(final.rows[0].lifecycleVersion, 2);
    }
  } finally {
    await first.query("ROLLBACK").catch(() => undefined);
    await second.query("ROLLBACK").catch(() => undefined);
    if (createdOrderIds.length > 0) await cleanup.query(`DELETE FROM "Order" WHERE "id" = ANY($1::text[])`, [createdOrderIds]).catch(() => undefined);
    await Promise.all([first.end().catch(() => undefined), second.end().catch(() => undefined), cleanup.end().catch(() => undefined)]);
  }
});

test("real PostgreSQL lets only one transaction claim an approved quote for conversion", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const first = new Client({ connectionString });
  const second = new Client({ connectionString });
  const cleanup = new Client({ connectionString });
  const quoteId = `stage-gate-quote-${randomUUID()}`;
  const quoteNo = `SG-Q-${Date.now()}-${randomUUID().slice(0, 8)}`;

  try {
    await Promise.all([first.connect(), second.connect(), cleanup.connect()]);
    const contextResult = await cleanup.query<{
      storeId: string;
      customerId: string;
      userId: string;
      pricingCalculationId: string;
    }>(`
      SELECT c."storeId" AS "storeId", c.id AS "customerId", u.id AS "userId", pc.id AS "pricingCalculationId"
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      JOIN "PricingCalculation" pc ON pc."storeId" = c."storeId"
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has no customer, user and pricing calculation fixture");
      return;
    }
    const context = contextResult.rows[0];
    await cleanup.query(
      `
        INSERT INTO "SalesQuote" (
          "id", "storeId", "executionStoreId", "quoteNo", "customerId", "salesPersonId",
          "pricingCalculationId", "status", "suggestedProductAmountCents", "suggestedLaborCostCents",
          "suggestedTotalCents", "finalProductAmountCents", "finalLaborCostCents", "finalTotalCents",
          "validUntil", "approvedAt", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $2, $3, $4, $5, $6, 'APPROVED', 100, 100, 200, 100, 100, 200, NOW() + INTERVAL '1 day', NOW(), NOW(), NOW())
      `,
      [quoteId, context.storeId, quoteNo, context.customerId, context.userId, context.pricingCalculationId]
    );

    const claimSql = `
      UPDATE "SalesQuote"
      SET "status" = 'CONVERTED', "updatedAt" = NOW()
      WHERE "id" = $1 AND "status" = 'APPROVED' AND "convertedOrderId" IS NULL
    `;
    await first.query("BEGIN");
    await second.query("BEGIN");
    const firstClaim = await first.query(claimSql, [quoteId]);
    const competingClaim = second.query(claimSql, [quoteId]);
    await new Promise((resolve) => setTimeout(resolve, 75));
    await first.query("COMMIT");
    const secondClaim = await competingClaim;
    await second.query("COMMIT");

    assert.equal(firstClaim.rowCount, 1);
    assert.equal(secondClaim.rowCount, 0);
    const final = await cleanup.query<{ status: string; convertedOrderId: string | null }>(
      `SELECT "status", "convertedOrderId" FROM "SalesQuote" WHERE "id" = $1`,
      [quoteId]
    );
    assert.equal(final.rowCount, 1);
    assert.equal(final.rows[0].status, "CONVERTED");
    assert.equal(final.rows[0].convertedOrderId, null);
  } finally {
    await first.query("ROLLBACK").catch(() => undefined);
    await second.query("ROLLBACK").catch(() => undefined);
    await cleanup.query(`DELETE FROM "SalesQuote" WHERE "id" = $1`, [quoteId]).catch(() => undefined);
    await Promise.all([
      first.end().catch(() => undefined),
      second.end().catch(() => undefined),
      cleanup.end().catch(() => undefined)
    ]);
  }
});

test("real PostgreSQL rolls back order facts, command record and version ledger together", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const client = new Client({ connectionString });
  const cleanup = new Client({ connectionString });
  const orderId = `stage-gate-rollback-${randomUUID()}`;
  const orderNo = `SG-R-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const commandId = `stage-gate-command-${randomUUID()}`;
  const commandRecordId = `stage-gate-command-record-${randomUUID()}`;
  const versionChangeId = `stage-gate-version-${randomUUID()}`;

  try {
    await Promise.all([client.connect(), cleanup.connect()]);
    const contextResult = await cleanup.query<{ storeId: string; customerId: string; userId: string }>(`
      SELECT c."storeId" AS "storeId", c.id AS "customerId", u.id AS "userId"
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has no customer and user fixture");
      return;
    }
    const context = contextResult.rows[0];
    await cleanup.query(
      `
        INSERT INTO "Order" (
          "id", "storeId", "executionStoreId", "orderNo", "customerId", "salesPersonId",
          "constructionType", "constructionLocation", "status", "lifecycleVersion", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $2, $3, $4, $5, 'PPF', 'IN_STORE', 'PENDING_DISPATCH', 1, NOW(), NOW())
      `,
      [orderId, context.storeId, orderNo, context.customerId, context.userId]
    );

    await client.query("BEGIN");
    await client.query(
      `UPDATE "Order" SET "status" = 'DISPATCHED', "lifecycleVersion" = 2 WHERE "id" = $1 AND "lifecycleVersion" = 1`,
      [orderId]
    );
    await client.query(
      `
        INSERT INTO "OrderLifecycleCommandRecord" (
          "id", "orderId", "storeId", "commandId", "commandType", "actorId", "targetType", "targetId",
          "requestFingerprint", "expectedVersion", "beforeVersion", "afterVersion", "status", "inputSummary"
        ) VALUES ($1, $2, $3, $4, 'DISPATCH', $5, 'ORDER', $2, 'stage-gate', 1, 1, 2, 'SUCCEEDED', '{}'::jsonb)
      `,
      [commandRecordId, orderId, context.storeId, commandId, context.userId]
    );
    await client.query(
      `
        INSERT INTO "OrderLifecycleVersionChange" (
          "id", "orderId", "beforeVersion", "afterVersion", "sourceType", "sourceKey", "sourceRefs"
        ) VALUES ($1, $2, 1, 2, 'COMMAND', $3, '{"commandId":"stage-gate"}'::jsonb)
      `,
      [versionChangeId, orderId, commandRecordId]
    );

    // Simulate a process failure after all facts were written but before commit.
    await client.query("ROLLBACK");
    const final = await cleanup.query<{ status: string; lifecycleVersion: number }>(
      `SELECT "status", "lifecycleVersion" FROM "Order" WHERE "id" = $1`,
      [orderId]
    );
    assert.equal(final.rows[0].status, "PENDING_DISPATCH");
    assert.equal(final.rows[0].lifecycleVersion, 1);
    const commandCount = await cleanup.query(`SELECT COUNT(*)::int AS count FROM "OrderLifecycleCommandRecord" WHERE "id" = $1`, [commandRecordId]);
    const versionCount = await cleanup.query(`SELECT COUNT(*)::int AS count FROM "OrderLifecycleVersionChange" WHERE "id" = $1`, [versionChangeId]);
    assert.equal(commandCount.rows[0].count, 0);
    assert.equal(versionCount.rows[0].count, 0);
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await cleanup.query(`DELETE FROM "Order" WHERE "id" = $1`, [orderId]).catch(() => undefined);
    await Promise.all([client.end().catch(() => undefined), cleanup.end().catch(() => undefined)]);
  }
});

test("real OrderLifecycle createOrder rolls back its command reservation when implementation fails", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const queryClient = new Client({ connectionString });
  const prisma = new PrismaService({ get: () => connectionString } as never);
  const orderId = `stage-gate-fault-order-${randomUUID()}`;
  const orderNo = `SG-F-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const commandId = `stage-gate-fault-command-${randomUUID()}`;
  try {
    await queryClient.connect();
    const contextResult = await queryClient.query<{ storeId: string; customerId: string; userId: string }>(`
      SELECT c."storeId" AS "storeId", c.id AS "customerId", u.id AS "userId"
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has no customer and user fixture");
      return;
    }
    const context = contextResult.rows[0];
    const failingCreate = {
      executeWithin: async (tx: { order: { create: (args: unknown) => Promise<unknown> } }) => {
        await tx.order.create({
          data: {
            id: orderId,
            storeId: context.storeId,
            executionStoreId: context.storeId,
            orderNo,
            customerId: context.customerId,
            salesPersonId: context.userId,
            constructionType: ConstructionType.PPF,
            constructionLocation: ConstructionLocation.IN_STORE,
            status: "PENDING_DISPATCH",
            lifecycleVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
        throw new Error("INJECTED_ORDER_IMPLEMENTATION_FAILURE");
      }
    };
    const lifecycle = new OrderLifecycle(
      failingCreate as never,
      prisma,
      { can: async () => true } as never,
      {} as never
    );
    await assert.rejects(
      lifecycle.createOrder(
        { id: context.userId, isAuditor: false, storeMember: { storeId: context.storeId, position: "SALES" } } as never,
        { commandId, source: "WEB" },
        { source: "DIRECT", order: { storeId: context.storeId, customerId: context.customerId, vehicleId: "unused", constructionType: ConstructionType.PPF, constructionLocation: ConstructionLocation.IN_STORE, items: [] } as never }
      ),
      /INJECTED_ORDER_IMPLEMENTATION_FAILURE/
    );
    const orderCount = await queryClient.query(`SELECT COUNT(*)::int AS count FROM "Order" WHERE "id" = $1`, [orderId]);
    const commandCount = await queryClient.query(`SELECT COUNT(*)::int AS count FROM "OrderLifecycleCommandRecord" WHERE "commandId" = $1`, [commandId]);
    assert.equal(orderCount.rows[0].count, 0);
    assert.equal(commandCount.rows[0].count, 0);
  } finally {
    await queryClient.query(`DELETE FROM "Order" WHERE "id" = $1`, [orderId]).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    await queryClient.end().catch(() => undefined);
  }
});

test("real OrderLifecycle deduplicates concurrent direct creation and rejects same-command input drift", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const queryClient = new Client({ connectionString });
  const prisma = new PrismaService({ get: () => connectionString } as never);
  const commandId = `stage-gate-create-${randomUUID()}`;
  let createdOrderId: string | undefined;
  try {
    await queryClient.connect();
    const contextResult = await queryClient.query<{
      storeId: string;
      customerId: string;
      userId: string;
      vehicleId: string;
      productId: string;
      paymentAccountId: string;
    }>(`
      SELECT c."storeId" AS "storeId", c.id AS "customerId", u.id AS "userId", v.id AS "vehicleId",
             p.id AS "productId", pa.id AS "paymentAccountId"
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      JOIN "CustomerVehicle" v ON v."customerId" = c.id AND v.status = 'ACTIVE'
      JOIN "Product" p ON p."storeId" = c."storeId" AND p.status = 'ACTIVE'
      JOIN "PaymentAccount" pa ON pa."storeId" = c."storeId" AND pa."isActive" = true
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has customer, vehicle, product and payment account fixtures");
      return;
    }
    const context = contextResult.rows[0];
    const actor = { id: context.userId, isAuditor: false, storeMember: { storeId: context.storeId, position: "SALES" } } as never;
    const createUseCase = new CreateOrderUseCase(
      prisma,
      { can: async () => true } as never,
      { next: () => `SG-I-${Date.now()}-${randomUUID().slice(0, 8)}` }
    );
    const lifecycle = new OrderLifecycle(
      createUseCase,
      prisma,
      { can: async () => true } as never,
      {} as never
    );
    const orderInput = {
      storeId: context.storeId,
      customerId: context.customerId,
      vehicleId: context.vehicleId,
      constructionType: ConstructionType.PPF,
      constructionLocation: ConstructionLocation.IN_STORE,
      items: [{ productId: context.productId, quantity: 1, unitPriceCents: 100 }],
      constructionChargeCents: 0,
      deposit: { accountId: context.paymentAccountId, amountCents: 10, paymentType: "DEPOSIT", paidAt: new Date().toISOString() }
    } as never;

    const results = await Promise.all([
      lifecycle.createOrder(actor, { commandId, source: "WEB" }, { source: "DIRECT", order: orderInput }),
      lifecycle.createOrder(actor, { commandId, source: "WEB" }, { source: "DIRECT", order: orderInput })
    ]);
    assert.equal(results[0].id, results[1].id);
    const orderId = results[0].id;
    createdOrderId = orderId;
    const counts = await queryClient.query<{
      orders: number;
      items: number;
      amounts: number;
      payments: number;
      cashFacts: number;
      commands: number;
      versions: number;
    }>(`
      SELECT
        (SELECT COUNT(*)::int FROM "Order" WHERE id = $1) AS orders,
        (SELECT COUNT(*)::int FROM "OrderItem" WHERE "orderId" = $1) AS items,
        (SELECT COUNT(*)::int FROM "OrderAmount" WHERE "orderId" = $1) AS amounts,
        (SELECT COUNT(*)::int FROM "OrderPayment" WHERE "orderId" = $1) AS payments,
        (SELECT COUNT(*)::int FROM "PaymentRecord" pr JOIN "OrderPayment" op ON op.id = pr."sourceId" WHERE op."orderId" = $1 AND pr."sourceType" = 'ORDER_PAYMENT') AS "cashFacts",
        (SELECT COUNT(*)::int FROM "OrderLifecycleCommandRecord" WHERE "commandId" = $2) AS commands,
        (SELECT COUNT(*)::int FROM "OrderLifecycleVersionChange" WHERE "orderId" = $1) AS versions
    `,
    [orderId, commandId]);
    assert.deepEqual(counts.rows[0], { orders: 1, items: 1, amounts: 1, payments: 1, cashFacts: 1, commands: 1, versions: 1 });

    await assert.rejects(
      lifecycle.createOrder(actor, { commandId, source: "WEB" }, {
        source: "DIRECT",
        order: { ...orderInput, remark: "same command but changed input" }
      }),
      (error: unknown) => error instanceof Error && "getResponse" in error
        && (error as { getResponse: () => unknown }).getResponse?.() instanceof Object
        && JSON.stringify((error as { getResponse: () => unknown }).getResponse()).includes("COMMAND_ID_CONFLICT")
    );
  } finally {
    if (!createdOrderId) {
      const command = await queryClient.query<{ orderId: string | null }>(
        `SELECT "orderId" FROM "OrderLifecycleCommandRecord" WHERE "commandId" = $1`,
        [commandId]
      ).catch(() => ({ rows: [] as { orderId: string | null }[] }));
      createdOrderId = command.rows[0]?.orderId ?? undefined;
    }
    if (createdOrderId) {
      await queryClient.query(
        `DELETE FROM "PaymentRecord" WHERE "sourceType" = 'ORDER_PAYMENT' AND "sourceId" IN (SELECT id FROM "OrderPayment" WHERE "orderId" = $1)`,
        [createdOrderId]
      ).catch(() => undefined);
      await queryClient.query(`DELETE FROM "Order" WHERE id = $1`, [createdOrderId]).catch(() => undefined);
    }
    await prisma.$disconnect().catch(() => undefined);
    await queryClient.end().catch(() => undefined);
  }
});

test("real OrderLifecycle quote conversion rolls back when quote linking fails after order creation", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const queryClient = new Client({ connectionString });
  const prisma = new PrismaService({ get: () => connectionString } as never);
  const quoteId = `stage-gate-fault-quote-${randomUUID()}`;
  const quoteNo = `SG-QF-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const orderId = `stage-gate-fault-quote-order-${randomUUID()}`;
  const orderNo = `SG-OF-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const commandId = `stage-gate-fault-quote-command-${randomUUID()}`;
  const triggerName = "stage_gate_fail_quote_link";
  try {
    await queryClient.connect();
    const contextResult = await queryClient.query<{
      storeId: string;
      customerId: string;
      userId: string;
      vehicleId: string;
      pricingCalculationId: string;
    }>(`
      SELECT c."storeId" AS "storeId", c.id AS "customerId", u.id AS "userId", v.id AS "vehicleId", pc.id AS "pricingCalculationId"
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      JOIN "CustomerVehicle" v ON v."customerId" = c.id AND v.status = 'ACTIVE'
      JOIN "PricingCalculation" pc ON pc."storeId" = c."storeId"
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has customer, active vehicle and pricing calculation fixtures");
      return;
    }
    const context = contextResult.rows[0];
    await queryClient.query(
      `
        INSERT INTO "SalesQuote" (
          "id", "storeId", "executionStoreId", "quoteNo", "customerId", "vehicleId", "salesPersonId",
          "pricingCalculationId", "status", "suggestedProductAmountCents", "suggestedLaborCostCents",
          "suggestedTotalCents", "finalProductAmountCents", "finalLaborCostCents", "finalTotalCents",
          "validUntil", "approvedAt", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $2, $3, $4, $5, $6, $7, 'APPROVED', 100, 100, 200, 100, 100, 200, NOW() + INTERVAL '1 day', NOW(), NOW(), NOW())
      `,
      [quoteId, context.storeId, quoteNo, context.customerId, context.vehicleId, context.userId, context.pricingCalculationId]
    );
    await queryClient.query(`DROP TRIGGER IF EXISTS ${triggerName} ON "SalesQuote"`);
    await queryClient.query(`DROP FUNCTION IF EXISTS ${triggerName}()`);
    await queryClient.query(`
      CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."convertedOrderId" IS NOT NULL THEN
          RAISE EXCEPTION 'INJECTED_QUOTE_LINK_FAILURE';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await queryClient.query(`CREATE TRIGGER ${triggerName} BEFORE UPDATE OF "convertedOrderId" ON "SalesQuote" FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`);

    const failingCreate = {
      executeWithin: async (tx: { order: { create: (args: unknown) => Promise<unknown> } }) => {
        await tx.order.create({
          data: {
            id: orderId,
            storeId: context.storeId,
            executionStoreId: context.storeId,
            orderNo,
            customerId: context.customerId,
            vehicleId: context.vehicleId,
            salesPersonId: context.userId,
            constructionType: ConstructionType.PPF,
            constructionLocation: ConstructionLocation.IN_STORE,
            status: "PENDING_DISPATCH",
            lifecycleVersion: 1,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        });
        return { id: orderId, orderNo };
      }
    };
    const lifecycle = new OrderLifecycle(
      failingCreate as never,
      prisma,
      { can: async () => true } as never,
      {} as never
    );
    await assert.rejects(
      lifecycle.createOrder(
        { id: context.userId, isAuditor: false, storeMember: { storeId: context.storeId, position: "SALES" } } as never,
        { commandId, source: "QUOTE_CONVERSION" },
        { source: "APPROVED_QUOTE", quoteId }
      ),
      /INJECTED_QUOTE_LINK_FAILURE/
    );
    const quote = await queryClient.query<{ status: string; convertedOrderId: string | null }>(
      `SELECT "status", "convertedOrderId" FROM "SalesQuote" WHERE "id" = $1`,
      [quoteId]
    );
    assert.equal(quote.rows[0].status, "APPROVED");
    assert.equal(quote.rows[0].convertedOrderId, null);
    const orderCount = await queryClient.query(`SELECT COUNT(*)::int AS count FROM "Order" WHERE "id" = $1`, [orderId]);
    const commandCount = await queryClient.query(`SELECT COUNT(*)::int AS count FROM "OrderLifecycleCommandRecord" WHERE "commandId" = $1`, [commandId]);
    assert.equal(orderCount.rows[0].count, 0);
    assert.equal(commandCount.rows[0].count, 0);
  } finally {
    await queryClient.query(`DROP TRIGGER IF EXISTS ${triggerName} ON "SalesQuote"`).catch(() => undefined);
    await queryClient.query(`DROP FUNCTION IF EXISTS ${triggerName}()`).catch(() => undefined);
    await queryClient.query(`DELETE FROM "SalesQuote" WHERE "id" = $1`, [quoteId]).catch(() => undefined);
    await queryClient.query(`DELETE FROM "Order" WHERE "id" = $1`, [orderId]).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    await queryClient.end().catch(() => undefined);
  }
});

test("real OrderLifecycle transition rolls back construction facts when implementation fails", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const queryClient = new Client({ connectionString });
  const prisma = new PrismaService({ get: () => connectionString } as never);
  const orderId = `stage-gate-fault-construction-order-${randomUUID()}`;
  const orderNo = `SG-CF-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const commandId = `stage-gate-fault-construction-command-${randomUUID()}`;
  try {
    await queryClient.connect();
    const contextResult = await queryClient.query<{ storeId: string; customerId: string; userId: string }>(`
      SELECT c."storeId" AS "storeId", c.id AS "customerId", u.id AS "userId"
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has no customer and user fixture");
      return;
    }
    const context = contextResult.rows[0];
    await queryClient.query(
      `
        INSERT INTO "Order" (
          "id", "storeId", "executionStoreId", "orderNo", "customerId", "salesPersonId",
          "constructionType", "constructionLocation", "status", "lifecycleVersion", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $2, $3, $4, $5, 'PPF', 'IN_STORE', 'DISPATCHED', 1, NOW(), NOW())
      `,
      [orderId, context.storeId, orderNo, context.customerId, context.userId]
    );
    const failingConstruction = {
      assertAccess: async () => undefined,
      execute: async (tx: { order: { update: (args: unknown) => Promise<unknown> } }) => {
        await tx.order.update({ where: { id: orderId }, data: { status: "IN_CONSTRUCTION", lifecycleVersion: 2 } });
        throw new Error("INJECTED_CONSTRUCTION_FAILURE");
      }
    };
    const lifecycle = new OrderLifecycle(
      {} as never,
      prisma,
      { can: async () => true } as never,
      failingConstruction as never
    );
    await assert.rejects(
      lifecycle.transition(
        { id: context.userId, isAuditor: false, storeMember: { storeId: context.storeId, position: "CONSTRUCTION" } } as never,
        orderId,
        { type: "START_CONSTRUCTION", input: {} },
        { commandId, expectedVersion: 1, source: "WEB" }
      ),
      /INJECTED_CONSTRUCTION_FAILURE/
    );
    const order = await queryClient.query<{ status: string; lifecycleVersion: number }>(
      `SELECT "status", "lifecycleVersion" FROM "Order" WHERE "id" = $1`,
      [orderId]
    );
    assert.equal(order.rows[0].status, "DISPATCHED");
    assert.equal(order.rows[0].lifecycleVersion, 1);
    const commandCount = await queryClient.query(`SELECT COUNT(*)::int AS count FROM "OrderLifecycleCommandRecord" WHERE "commandId" = $1`, [commandId]);
    assert.equal(commandCount.rows[0].count, 0);
  } finally {
    await queryClient.query(`DELETE FROM "Order" WHERE "id" = $1`, [orderId]).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    await queryClient.end().catch(() => undefined);
  }
});

test("real OrderLifecycle direct creation rolls back initial cash facts when payment ledger fails", { skip: !enabled }, async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    t.skip("DATABASE_URL is required for the opt-in real database stage gate");
    return;
  }

  const queryClient = new Client({ connectionString });
  const prisma = new PrismaService({ get: () => connectionString } as never);
  const orderIdempotency = `stage-gate-fault-payment-${randomUUID()}`;
  const triggerName = "stage_gate_fail_payment_record";
  try {
    await queryClient.connect();
    const contextResult = await queryClient.query<{
      storeId: string;
      customerId: string;
      userId: string;
      vehicleId: string;
      productId: string;
      paymentAccountId: string;
    }>(`
      SELECT c."storeId" AS "storeId", c.id AS "customerId", u.id AS "userId", v.id AS "vehicleId", p.id AS "productId", pa.id AS "paymentAccountId"
      FROM "Customer" c
      CROSS JOIN LATERAL (SELECT id FROM "User" LIMIT 1) u
      JOIN "CustomerVehicle" v ON v."customerId" = c.id AND v.status = 'ACTIVE'
      JOIN "Product" p ON p."storeId" = c."storeId" AND p.status = 'ACTIVE'
      JOIN "PaymentAccount" pa ON pa."storeId" = c."storeId" AND pa."isActive" = true
      LIMIT 1
    `);
    if (contextResult.rowCount !== 1) {
      t.skip("the local database has customer, vehicle, product and payment account fixtures");
      return;
    }
    const context = contextResult.rows[0];
    await queryClient.query(`DROP TRIGGER IF EXISTS ${triggerName} ON "PaymentRecord"`);
    await queryClient.query(`DROP FUNCTION IF EXISTS ${triggerName}()`);
    await queryClient.query(`
      CREATE FUNCTION ${triggerName}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'INJECTED_PAYMENT_RECORD_FAILURE';
      END;
      $$
    `);
    await queryClient.query(`CREATE TRIGGER ${triggerName} BEFORE INSERT ON "PaymentRecord" FOR EACH ROW EXECUTE FUNCTION ${triggerName}()`);

    const createUseCase = new CreateOrderUseCase(
      prisma,
      { can: async () => true } as never,
      { next: () => `SG-P-${Date.now()}-${randomUUID().slice(0, 8)}` }
    );
    const lifecycle = new OrderLifecycle(
      createUseCase,
      prisma,
      { can: async () => true } as never,
      {} as never
    );
    await assert.rejects(
      lifecycle.createOrder(
        { id: context.userId, isAuditor: false, storeMember: { storeId: context.storeId, position: "SALES" } } as never,
        { commandId: orderIdempotency, source: "WEB" },
        {
          source: "DIRECT",
          order: {
            storeId: context.storeId,
            customerId: context.customerId,
            vehicleId: context.vehicleId,
            constructionType: ConstructionType.PPF,
            constructionLocation: ConstructionLocation.IN_STORE,
            items: [{ productId: context.productId, quantity: 1, unitPriceCents: 100 }],
            laborCostCents: 0,
            deposit: { accountId: context.paymentAccountId, amountCents: 10, paymentType: "DEPOSIT", paidAt: new Date().toISOString() }
          }
        } as never
      ),
      /INJECTED_PAYMENT_RECORD_FAILURE/
    );
    const commandCount = await queryClient.query(`SELECT COUNT(*)::int AS count FROM "OrderLifecycleCommandRecord" WHERE "commandId" = $1`, [orderIdempotency]);
    const orderCount = await queryClient.query(`SELECT COUNT(*)::int AS count FROM "Order" WHERE "orderNo" LIKE 'SG-P-%' AND "createdAt" > NOW() - INTERVAL '5 minutes'`);
    const paymentCount = await queryClient.query(`SELECT COUNT(*)::int AS count FROM "PaymentRecord" WHERE "idempotencyKey" LIKE 'ORDER_INITIAL_DEPOSIT:%' AND "occurredAt" > NOW() - INTERVAL '5 minutes'`);
    assert.equal(commandCount.rows[0].count, 0);
    assert.equal(orderCount.rows[0].count, 0);
    assert.equal(paymentCount.rows[0].count, 0);
  } finally {
    await queryClient.query(`DROP TRIGGER IF EXISTS ${triggerName} ON "PaymentRecord"`).catch(() => undefined);
    await queryClient.query(`DROP FUNCTION IF EXISTS ${triggerName}()`).catch(() => undefined);
    await prisma.$disconnect().catch(() => undefined);
    await queryClient.end().catch(() => undefined);
  }
});
