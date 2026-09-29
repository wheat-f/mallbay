import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMAIN_READS, EXPLICIT_ROUTE_EXPECTATIONS, MANUAL_BINDING_WRITES, ROLE_KEYS } from "./full-role-matrix-expectations.mjs";

test("all requested business domains have a versioned read expectation for eight roles", () => {
  assert.equal(ROLE_KEYS.length, 8);
  assert.equal(new Set(ROLE_KEYS).size, 8);
  assert.deepEqual(Object.keys(DOMAIN_READS).sort(), [
    "客户", "产品", "订单", "报价", "施工", "库存", "采购", "财务", "发票", "返利",
    "提成", "售后", "质保", "退货", "人员", "门店", "权限", "审计", "设置"
  ].sort());
  for (const [domain, expectation] of Object.entries(DOMAIN_READS)) {
    assert.ok(expectation.api.startsWith("/"), domain);
    assert.ok(expectation.route.startsWith("/"), domain);
    assert.ok(expectation.allowed.every((key) => ROLE_KEYS.includes(key)), domain);
  }
});

test("manual binding surfaces are deny-only", () => {
  assert.deepEqual(EXPLICIT_ROUTE_EXPECTATIONS["/settings/role-bindings"], []);
  assert.equal(MANUAL_BINDING_WRITES.length, 4);
  assert.ok(MANUAL_BINDING_WRITES.every((probe) => ["POST", "PATCH"].includes(probe.method)));
});
