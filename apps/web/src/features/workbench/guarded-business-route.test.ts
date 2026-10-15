import assert from "node:assert/strict";
import { test } from "node:test";
import { canOpenGuardedBusinessRoute, isGuardedBusinessRoute } from "./guarded-business-route";

const paths = ["/customers", "/construction/tasks", "/inventory", "/purchases", "/returns", "/finance", "/commissions", "/after-sales"];

test("direct business entry routes deny before a permission snapshot is available", () => {
  for (const path of paths) {
    assert.equal(isGuardedBusinessRoute(path), true);
    assert.equal(canOpenGuardedBusinessRoute(path, undefined, "store-1"), false);
  }
  assert.equal(isGuardedBusinessRoute("/auth"), false);
});

test("business route guard uses the matching server-evaluated grant and store binding", () => {
  const permissions = [{
    code: "inventory", actions: ["read"], scopes: ["STORE"],
    bindingScopes: [{ scopeType: "STORE" as const, scopeIds: ["store-1"] }]
  }];
  assert.equal(canOpenGuardedBusinessRoute("/inventory", permissions, "store-1"), true);
  assert.equal(canOpenGuardedBusinessRoute("/inventory", permissions, "store-2"), false);
  assert.equal(canOpenGuardedBusinessRoute("/purchases", permissions, "store-1"), false);
});

test("OWN-scoped after-sales grants can enter the own-only list without widening another domain", () => {
  const permissions = [{
    code: "after-sales", actions: ["read"], scopes: ["OWN"],
    bindingScopes: [{ scopeType: "STORE" as const, scopeIds: ["store-1"] }]
  }];
  assert.equal(canOpenGuardedBusinessRoute("/after-sales", permissions, "store-1"), true);
  assert.equal(canOpenGuardedBusinessRoute("/after-sales", permissions, "store-2"), false);
  assert.equal(canOpenGuardedBusinessRoute("/commissions", permissions, "store-1"), false);
});
