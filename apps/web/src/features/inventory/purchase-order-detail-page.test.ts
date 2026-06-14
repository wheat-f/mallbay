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

test("purchase order detail page follows the prototype receiving workspace layout", () => {
  const detailSource = readFileSync("app/inventory/purchase-orders/[id]/page.tsx", "utf8");

  assert.match(detailSource, /purchase-detail-hero/);
  assert.match(detailSource, /purchase-detail-stepper/);
  assert.match(detailSource, /purchase-detail-workspace/);
  assert.match(detailSource, /purchase-basic-card/);
  assert.match(detailSource, /purchase-items-card/);
  assert.match(detailSource, /purchase-receiving-panel/);
  assert.match(detailSource, /purchase-log-card/);
  assert.match(detailSource, /到货验收录入/);
  assert.match(detailSource, /入库指南/);
  assert.doesNotMatch(detailSource, /detail-layout/);
});

test("purchase order detail page uses mobile cards for purchase items", () => {
  const detailSource = readFileSync("app/inventory/purchase-orders/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const baseHiddenIndex = cssSource.indexOf(".purchase-items-mobile-cards {\n  display: none");
  const desktopTableIndex = cssSource.indexOf(".purchase-items-desktop-table");
  const mobileDisplayIndex = cssSource.indexOf(".purchase-items-mobile-cards", desktopTableIndex);

  assert.match(detailSource, /purchase-items-mobile-cards/);
  assert.match(detailSource, /purchase-items-mobile-card/);
  assert.match(detailSource, /purchase-items-desktop-table/);
  assert.match(cssSource, /\.purchase-items-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.purchase-items-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.purchase-items-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.ok(desktopTableIndex > baseHiddenIndex, "mobile breakpoint must come after the base hidden rule");
  assert.ok(mobileDisplayIndex > baseHiddenIndex, "mobile display override must come after the base hidden rule");
});
