import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("returns page exposes both sales and purchase return workflows", () => {
  const file = fileURLToPath(new URL("../../../app/returns/page.tsx", import.meta.url));
  const source = readFileSync(file, "utf8");
  assert.match(source, /销售退货单/);
  assert.match(source, /采购退货单/);
  assert.match(source, /submitSalesReturn/);
  assert.match(source, /submitPurchaseReturn/);
  assert.match(source, /approvePurchaseReturn/);
});