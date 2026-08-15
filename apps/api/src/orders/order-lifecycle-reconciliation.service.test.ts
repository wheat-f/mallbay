import assert from "node:assert/strict";
import { test } from "node:test";
import { MetricsService } from "../observability/metrics.service";
import { OrderLifecycleReconciliationService } from "./order-lifecycle-reconciliation.service";

function createFakePrisma(existingCodes: string[] = []) {
  const cases: Array<{ id: string; orderId: string; issueCodes: unknown }> = existingCodes.length
    ? [{ id: "verification-1", orderId: "order-1", issueCodes: existingCodes }]
    : [];
  const transactions: Array<{ executed: boolean }> = [];
  const prisma = {
    $queryRawUnsafe: async (query: string) => {
      if (query.includes('FROM "Order" orders')) return [{ orderId: "order-1", status: "COMPLETED" }];
      return [];
    },
    $transaction: async <T>(callback: (tx: unknown) => Promise<T>) => callback({
      $executeRaw: async () => {
        transactions.push({ executed: true });
      },
      orderLifecycleVerificationCase: {
        findFirst: async () => cases[0] ?? null,
        create: async ({ data }: { data: { orderId: string; issueCodes: unknown } }) => {
          cases.push({ id: "verification-created", orderId: data.orderId, issueCodes: data.issueCodes });
          return cases.at(-1);
        },
        update: async ({ data }: { data: { issueCodes: unknown } }) => {
          cases[0]!.issueCodes = data.issueCodes;
          return cases[0];
        }
      }
    })
  };
  return { prisma, cases, transactions };
}

test("reconciliation creates one OPEN case for runtime historical findings", async () => {
  const fake = createFakePrisma();
  const metrics = new MetricsService();
  const logger = { warn: () => undefined, error: () => undefined };
  const service = new OrderLifecycleReconciliationService(fake.prisma as never, metrics, logger as never);

  const result = await service.runOnce();

  assert.deepEqual(result, { skipped: false, violations: 3, casesCreated: 1, casesUpdated: 0 });
  assert.equal(fake.cases.length, 1);
  assert.deepEqual(fake.cases[0]?.issueCodes, [
    "QUALITY_RESULT_MISSING",
    "WARRANTY_FACT_MISSING",
    "HISTORICAL_FACTS_INCONSISTENT"
  ]);
  assert.equal(fake.transactions.length, 1);
  assert.equal(metrics.getCounter("order_lifecycle_reconciliation_cases_created_total"), 1);
  assert.equal(metrics.getCounter("order_lifecycle_reconciliation_violations_total", { invariant: "terminal_order_quality_missing" }), 1);
});

test("reconciliation is idempotent and merges newly observed issue codes", async () => {
  const fake = createFakePrisma(["QUALITY_RESULT_MISSING"]);
  const metrics = new MetricsService();
  const logger = { warn: () => undefined, error: () => undefined };
  const service = new OrderLifecycleReconciliationService(fake.prisma as never, metrics, logger as never);

  const result = await service.runOnce();

  assert.deepEqual(result, { skipped: false, violations: 3, casesCreated: 0, casesUpdated: 1 });
  assert.deepEqual(fake.cases[0]?.issueCodes, [
    "QUALITY_RESULT_MISSING",
    "WARRANTY_FACT_MISSING",
    "HISTORICAL_FACTS_INCONSISTENT"
  ]);
  assert.equal(metrics.getCounter("order_lifecycle_reconciliation_cases_created_total"), 0);
  assert.equal(metrics.getCounter("order_lifecycle_reconciliation_cases_updated_total"), 1);
});
