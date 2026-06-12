import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory supplier page exposes contacts and rating history actions", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /createSupplierContact/);
  assert.match(pageSource, /createSupplierRatingHistory/);
  assert.match(pageSource, /联系人档案/);
  assert.match(pageSource, /评级历史/);
});
