import assert from "node:assert/strict";
import { test } from "node:test";
import type { AuthUser } from "@mallbay/shared";
import { resolveStoreId } from "./store-context";

const user = {
  id: "user-1",
  username: "operator",
  storeMembers: [
    { position: "SALES", store: { id: "store-a", name: "A店", status: "PUBLISHED" } },
    { position: "FINANCE", store: { id: "store-b", name: "B店", status: "PUBLISHED" } }
  ]
} as AuthUser;

test("store context accepts only a bound route or persisted store", () => {
  assert.equal(resolveStoreId(user, "store-b"), "store-b");
  assert.equal(resolveStoreId(user, "store-x", "store-b"), "store-b");
  assert.equal(resolveStoreId(user, "store-x", "store-y"), "store-a");
});

test("store context ignores the legacy first member when explicit memberships exist", () => {
  const legacy = { ...user, storeMember: { position: "CONSTRUCTION", store: { id: "legacy", name: "旧店", status: "PUBLISHED" } } } as AuthUser;
  assert.equal(resolveStoreId(legacy, "store-b"), "store-b");
  assert.notEqual(resolveStoreId(legacy), "legacy");
});
