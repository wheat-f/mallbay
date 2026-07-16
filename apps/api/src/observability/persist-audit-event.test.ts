import assert from "node:assert/strict";
import test from "node:test";
import { persistAuditEvent } from "./persist-audit-event";

test("persistAuditEvent writes structured business metadata to AuditEvent", async () => {
  const rows: unknown[] = [];
  await persistAuditEvent({ auditEvent: { create: async ({ data }) => rows.push(data) } }, {
    action: "pricing_rule_published",
    actorId: "user-1",
    targetType: "PricingRuleSet",
    targetId: "rule-1",
    metadata: { storeId: "store-1", version: 3 }
  });

  assert.deepEqual(rows, [{
    action: "pricing_rule_published",
    actorId: "user-1",
    storeId: "store-1",
    targetType: "PricingRuleSet",
    targetId: "rule-1",
    metadata: { storeId: "store-1", version: 3 }
  }]);
});

test("persistAuditEvent stays compatible with narrow unit-test Prisma fakes", async () => {
  await assert.doesNotReject(() => persistAuditEvent({}, {
    action: "capacity_quote_released",
    targetType: "CapacityReservation",
    targetId: "reservation-1"
  }));
});

test("persistAuditEvent removes undefined JSON metadata values", async () => {
  let row: unknown;
  await persistAuditEvent({ auditEvent: { create: async ({ data }) => { row = data; } } }, {
    action: "sales_quote_reviewed",
    targetType: "SalesQuote",
    metadata: { storeId: "store-1", reviewNote: undefined, checks: [{ reason: undefined, decision: "APPROVED" }] }
  });
  assert.deepEqual(row, {
    action: "sales_quote_reviewed",
    actorId: undefined,
    storeId: "store-1",
    targetType: "SalesQuote",
    targetId: undefined,
    metadata: { storeId: "store-1", checks: [{ decision: "APPROVED" }] }
  });
});
