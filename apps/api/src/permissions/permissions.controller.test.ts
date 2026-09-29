import assert from "node:assert/strict";
import { test } from "node:test";
import { ForbiddenException } from "@nestjs/common";
import { PermissionsController } from "./permissions.controller";

test("manual role-binding write routes reject without invoking governance", async () => {
  let called = false;
  const governance = new Proxy({}, { get: () => { called = true; throw new Error("governance must not run"); } });
  const controller = new PermissionsController(governance as never, {} as never);
  for (const action of [
    () => controller.bindRole(),
    () => controller.bindUserRole(),
    () => controller.updateUserRoleBinding(),
    () => controller.disableBinding()
  ]) {
    assert.throws(action, (error: unknown) => {
      assert.ok(error instanceof ForbiddenException);
      assert.equal(error.getStatus(), 403);
      assert.equal((error.getResponse() as { code: string }).code, "HQ_MEMBER_BINDING_DISABLED");
      return true;
    });
  }
  assert.equal(called, false);
});

test("role-binding diagnostics still require a global policy read grant", async () => {
  const controller = new PermissionsController({ listBindings: async () => [{ id: "binding-1" }] } as never, {
    scope: async () => ({ allowed: true, global: true })
  } as never);
  assert.deepEqual(await controller.getBindings({ user: { id: "hq-1" } }, "target-1"), [{ id: "binding-1" }]);
  const denied = new PermissionsController({ listBindings: async () => { throw new Error("must not query"); } } as never, {
    scope: async () => ({ allowed: false, global: false })
  } as never);
  await assert.rejects(() => denied.getBindings({ user: { id: "sales-1" } }, "target-1"), { name: "ForbiddenException" });
});

test("policy draft preflight is read-only and HQ-gated", async () => {
  let reads = 0;
  const governance = { currentDraft: async () => { reads++; return { id: "draft-1", version: 12 }; } };
  const allowed = new PermissionsController(governance as never, { scope: async () => ({ allowed: true, global: true }) } as never);
  assert.deepEqual(await allowed.getCurrentDraft({ user: { id: "hq-1" } }), { id: "draft-1", version: 12 });
  const denied = new PermissionsController(governance as never, { scope: async () => ({ allowed: false, global: false }) } as never);
  await assert.rejects(() => denied.getCurrentDraft({ user: { id: "sales-1" } }), { name: "ForbiddenException" });
  assert.equal(reads, 1);
});

test("policy publish forwards the expected live policy identity", async () => {
  let args: unknown[] = [];
  const controller = new PermissionsController({ publishPolicy: async (...values: unknown[]) => { args = values; return { version: 3 }; } } as never, {
    scope: async () => ({ allowed: true, global: true })
  } as never);
  assert.deepEqual(await controller.publishPolicy({ user: { id: "hq-1" } }, "candidate-2", { expectedVersion: 2, expectedPublishedId: "original-1" }), { version: 3 });
  assert.deepEqual(args, ["candidate-2", "hq-1", 2, "original-1"]);
});
