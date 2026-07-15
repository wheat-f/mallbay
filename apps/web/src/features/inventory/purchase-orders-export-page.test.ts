import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("purchase orders page exports server-provided product detail rows", () => {
  const pageSource = readFileSync("app/purchases/orders/page.tsx", "utf8");

  assert.match(pageSource, /purchaseApi\.exportOrderDetails\(storeId!, exportDimension\)/);
  assert.match(pageSource, /purchase-order-product-details-by-\$\{exportDimension\}\.xlsx/);
  assert.match(pageSource, /采购数量/);
  assert.match(pageSource, /已入库数量/);
  assert.match(pageSource, /待入库数量/);
  assert.match(pageSource, /产品行金额/);
  assert.match(pageSource, /导出产品明细/);
  assert.doesNotMatch(pageSource, /const exportRows = \[\.\.\.rows\]/);
});
