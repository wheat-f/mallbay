import assert from "node:assert/strict";
import { test } from "node:test";
import { AuditEventWriter } from "./observability/audit-event-writer";
import { AccessContext } from "./permissions/domain/access-context";

test("platform and access seams delegate through stable contracts", async () => {
  const events: unknown[] = [];
  const audit = new AuditEventWriter({ record: (event: unknown) => events.push(event) } as never);
  const result = audit.write({ action: "TEST", targetType: "test", targetId: "1" });
  assert.equal(result.accepted, true);
  assert.equal(events.length, 1);

  const persisted: unknown[] = [];
  const transactionalResult = await audit.writeTransactional(
    { auditEvent: { create: async ({ data }: { data: unknown }) => { persisted.push(data); } } },
    { action: "TX_TEST", targetType: "test", idempotencyKey: "tx-1" }
  );
  assert.equal(transactionalResult.accepted, true);
  assert.equal(persisted.length, 1);
  assert.equal((persisted[0] as { idempotencyKey?: string }).idempotencyKey, "tx-1");

  const access = new AccessContext({
    getForUser: async (userId: string) => ({ userId }),
    authorize: async () => true,
    buildScopeFilter: async () => ({})
  } as never);
  assert.deepEqual(await access.resolve("user-1"), { userId: "user-1" });
  assert.deepEqual(await access.resolve({ userId: "user-1" }), { userId: "user-1" });
  assert.equal(await access.can("user-1", "orders", "read"), true);
  assert.deepEqual(await access.require("user-1", "orders", "read", { storeId: "store-1" }), {
    allowed: true,
    userId: "user-1",
    capability: "orders",
    action: "read",
    context: { storeId: "store-1" }
  });
});
