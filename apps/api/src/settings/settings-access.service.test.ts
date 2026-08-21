import test from "node:test";
import assert from "node:assert/strict";
import { SettingsAccessService } from "./settings-access.service";

function service() {
  const scope = async (subject: { userId: string }, _capability: string, _action: string, context: { storeId?: string } = {}) => {
    if (subject.userId === "hq") return { allowed: true, global: true, storeIds: [] };
    if (context.storeId && context.storeId !== "store-a") return { allowed: false, global: false, storeIds: ["store-a"], reason: "STORE_OUT_OF_SCOPE" as const };
    return { allowed: true, global: false, storeIds: ["store-a"] };
  };
  return new SettingsAccessService({ settingsConfigVersion: { findMany: async () => [] } } as never, undefined, { scope } as never);
}

test("capabilities expose AccessContext scope facts without reading actor fields", async () => {
  const store = await service().getCapabilities({ id: "u1" });
  assert.ok(store.length > 0);
  assert.equal(store.find((item) => item.code === "store.operations")?.scopeId, null);
  assert.equal(store.find((item) => item.code === "account.profile")?.scopeId, "u1");
  const hq = await service().getCapabilities({ id: "hq" });
  assert.ok(hq.some((item) => item.domain === "HQ"));
});

test("store capability rejects an explicit out-of-scope store", async () => {
  await assert.rejects(() => service().assert({ id: "u1" }, "store.operations", "edit", "store-b"), /其他门店/);
});

test("a global subject can resolve an explicit store target", async () => {
  const result = await service().assert({ id: "hq" }, "store.operations", "view", "store-b");
  assert.equal(result.scopeId, "store-b");
});
