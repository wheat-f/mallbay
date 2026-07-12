import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("purchase detail page exposes approval and receiving rejection actions", () => {
  const pageSource = readFileSync("app/purchases/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /approvePurchaseOrder/);
  assert.match(pageSource, /cancelPurchaseOrder/);
  assert.match(pageSource, /purchaseApi\.approveOrder/);
  assert.match(pageSource, /purchaseApi\.cancelOrder/);
  assert.match(pageSource, /审批通过/);
  assert.match(pageSource, /purchaseOrder\.status === "DRAFT"/);
  assert.match(pageSource, /拒绝收货/);
  assert.match(pageSource, /请填写拒绝原因/);
  assert.match(pageSource, /请填写拒绝收货原因/);
  assert.match(pageSource, /拒收订单/);
  assert.match(pageSource, /canManagePurchase/);
  assert.match(pageSource, /disabled=\{!canManagePurchase/);
  assert.doesNotMatch(pageSource, /window\.prompt/);
});
