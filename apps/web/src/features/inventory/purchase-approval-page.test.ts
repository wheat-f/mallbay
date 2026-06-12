import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory purchase page exposes draft approval action", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /approvePurchaseOrder/);
  assert.match(pageSource, /cancelPurchaseOrder/);
  assert.match(pageSource, /审批通过/);
  assert.match(pageSource, /取消采购单/);
  assert.match(pageSource, /请输入取消原因/);
  assert.match(pageSource, /row\.status === "DRAFT"/);
});
