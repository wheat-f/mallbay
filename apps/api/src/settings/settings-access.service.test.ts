import test from "node:test";
import assert from "node:assert/strict";
import { SettingsAccessService } from "./settings-access.service";
function service(member?: { storeId: string; position: string } | null) { return new SettingsAccessService({ storeMember: { findUnique: async () => member } } as never); }
test("capabilities are scoped to the actor role", async () => {
  const manager = await service({ storeId: "store-a", position: "MANAGER" }).getCapabilities({ id: "u1", isAuditor: false });
  assert.ok(manager.some((item) => item.domain === "STORE")); assert.equal(manager.some((item) => item.domain === "HQ"), false); assert.ok(manager.some((item) => item.code === "store.dictionary"));
  const finance = await service({ storeId: "store-a", position: "FINANCE" }).getCapabilities({ id: "u2", isAuditor: false });
  assert.ok(finance.some((item) => item.domain === "FINANCE")); assert.equal(finance.some((item) => item.domain === "STORE"), false);
  const auditor = await service(undefined).getCapabilities({ id: "u3", isAuditor: true }); assert.ok(auditor.some((item) => item.domain === "HQ"));
});
test("store capability rejects another store", async () => { await assert.rejects(() => service({ storeId: "store-a", position: "MANAGER" }).assert({ id: "u1", isAuditor: false }, "store.operations", "edit", "store-b"), /其他门店/); });
test("finance cannot edit store operations", async () => { await assert.rejects(() => service({ storeId: "store-a", position: "FINANCE" }).assert({ id: "u2", isAuditor: false }, "store.operations", "edit", "store-a"), /无权/); });
test("headquarters can view but cannot edit store settings across stores", async () => { const svc = service(undefined); const result = await svc.assert({ id: "hq", isAuditor: true }, "store.operations", "view", "store-b"); assert.equal(result.scopeId, "store-b"); await assert.rejects(() => svc.assert({ id: "hq", isAuditor: true }, "store.operations", "edit", "store-b"), /无权/); });
