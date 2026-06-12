import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory page links purchase orders to the purchase order detail page", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /useRouter/);
  assert.match(pageSource, /router\.push\(`\/inventory\/purchase-orders\/\$\{row\.id\}`\)/);
  assert.match(pageSource, />\s*详情\s*<\/Button>/);
});

test("purchase order detail page keeps arrival review and inbound actions together", () => {
  const detailSource = readFileSync("app/inventory/purchase-orders/[id]/page.tsx", "utf8");

  assert.match(detailSource, /title="采购订单详情"/);
  assert.match(detailSource, /getPurchaseOrderArrivalReminder/);
  assert.match(detailSource, /title="采购清单与到货验收"/);
  assert.match(detailSource, /receivePurchaseItemBatches/);
  assert.match(detailSource, /parseInboundScanLines/);
  assert.match(detailSource, /title="流转日志"/);
});
