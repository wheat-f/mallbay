import assert from "node:assert/strict";
import { test } from "node:test";
import { hasEffectivePermission } from "./use-effective-permissions";

test("effective permission helper accepts only matching action and bound scope", () => {
  const permissions = [{
    code: "products",
    actions: ["read", "write"],
    scopes: ["STORE"],
    bindingScopes: [{ scopeType: "STORE" as const, scopeIds: ["store-a"] }]
  }];

  assert.equal(hasEffectivePermission(permissions, "products", "write", "store-a"), true);
  assert.equal(hasEffectivePermission(permissions, "products", "write", "store-b"), false);
  assert.equal(hasEffectivePermission(permissions, "products", "suggested-price-write", "store-a"), false);
});

test("effective permission helper does not widen an OWN grant into a manager action", () => {
  const permissions = [{
    code: "orders",
    actions: ["write"],
    scopes: ["OWN"],
    bindingScopes: [{ scopeType: "STORE" as const, scopeIds: ["store-a"] }]
  }];

  assert.equal(hasEffectivePermission(permissions, "orders", "write", "store-a", { ownerId: "user-a", userId: "user-a" }), true);
  assert.equal(hasEffectivePermission(permissions, "orders", "write", "store-a", { ownerId: "user-b", userId: "user-a" }), false);
  assert.equal(hasEffectivePermission(permissions, "orders", "write", "store-a", { requireStoreScope: true }), false);
});

test("effective permission helper recognizes HQ-bound global authority only", () => {
  const permissions = [{
    code: "permissions.policy",
    actions: ["read"],
    scopes: ["GLOBAL"],
    bindingScopes: [{ scopeType: "HQ" as const, scopeIds: [] }]
  }];

  assert.equal(hasEffectivePermission(permissions, "permissions.policy", "read"), true);
  assert.equal(hasEffectivePermission(permissions, "permissions.policy", "publish"), false);
});
