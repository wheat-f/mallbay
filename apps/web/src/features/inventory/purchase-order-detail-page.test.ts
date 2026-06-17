import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("purchases order list links purchase orders to the purchase order detail page", () => {
  const pageSource = readFileSync("app/purchases/orders/page.tsx", "utf8");

  assert.match(pageSource, /useRouter/);
  assert.match(pageSource, /router\.push\(`\/purchases\/orders\/\$\{row\.id\}`\)/);
});

test("purchase order detail page keeps arrival review and inbound actions together", () => {
  const detailSource = readFileSync("app/purchases/orders/[id]/page.tsx", "utf8");

  assert.match(detailSource, /采购订单详情/);
  assert.match(detailSource, /返回采购列表/);
  assert.match(detailSource, /router\.push\("\/purchases\/orders"\)/);
  assert.doesNotMatch(detailSource, /返回库存采购/);
  assert.doesNotMatch(detailSource, /router\.push\("\/inventory"\)/);
  assert.match(detailSource, /请从采购列表重新进入采购订单详情。/);
  assert.doesNotMatch(detailSource, /请从库存采购页重新进入采购订单详情。/);
  assert.match(detailSource, /getPurchaseOrderArrivalReminder/);
  assert.match(detailSource, /title="采购清单"/);
  assert.doesNotMatch(detailSource, /title="采购清单与到货验收"/);
  assert.match(detailSource, /receivePurchaseItemBatches/);
  assert.match(detailSource, /parseInboundScanLines/);
  assert.match(detailSource, /生产日期/);
  assert.match(detailSource, /存放仓库/);
  assert.match(detailSource, /验收备注/);
  assert.match(detailSource, /title="流转日志"/);
  assert.match(detailSource, /供应商已发货/);
  assert.match(detailSource, /采购订单创建/);
  assert.match(detailSource, /purchase-reject-panel/);
  assert.match(detailSource, /拒绝收货/);
  assert.match(detailSource, /拒收订单/);
  assert.match(detailSource, /rejectReason/);
  assert.doesNotMatch(detailSource, /window\.prompt/);
});

test("purchase order detail page follows the prototype receiving workspace layout", () => {
  const detailSource = readFileSync("app/purchases/orders/[id]/page.tsx", "utf8");

  assert.match(detailSource, /purchase-detail-hero/);
  assert.match(detailSource, /purchase-detail-stepper/);
  assert.match(detailSource, /const labels = \["新建订单", "审批通过", "供应商发货", "待验收", "已入库"\]/);
  assert.match(detailSource, /purchase-detail-workspace/);
  assert.match(detailSource, /purchase-basic-card/);
  assert.match(detailSource, /purchase-items-card/);
  assert.match(detailSource, /purchase-receiving-panel/);
  assert.match(detailSource, /purchase-log-card/);
  assert.match(detailSource, /到货验收录入/);
  assert.match(detailSource, /入库指南/);
  assert.match(detailSource, /防伪编码/);
  assert.match(detailSource, /拍摄外箱照片存档/);
  assert.doesNotMatch(detailSource, /management-kpi-grid/);
  assert.doesNotMatch(detailSource, /StorePageHeader/);
  assert.doesNotMatch(detailSource, /detail-layout/);
});

test("purchase order detail page uses mobile cards for purchase items", () => {
  const detailSource = readFileSync("app/purchases/orders/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const baseHiddenIndex = cssSource.indexOf(".purchase-items-mobile-cards {\n  display: none");
  const desktopTableIndex = cssSource.indexOf(".purchase-items-desktop-table");
  const mobileDisplayIndex = cssSource.indexOf(".purchase-items-mobile-cards", desktopTableIndex);
  const purchaseItemsBreakpoint = cssSource.match(
    /@media \(max-width: (\d+)px\) \{\s*\.purchase-items-desktop-table\s*\{\s*display: none;\s*\}\s*\.purchase-items-mobile-cards\s*\{\s*display: grid;/
  );

  assert.match(detailSource, /purchase-items-mobile-cards/);
  assert.match(detailSource, /purchase-items-mobile-card/);
  assert.match(detailSource, /purchase-items-desktop-table/);
  assert.match(cssSource, /\.purchase-items-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.equal(purchaseItemsBreakpoint?.[1], "900");
  assert.ok(desktopTableIndex > baseHiddenIndex, "mobile breakpoint must come after the base hidden rule");
  assert.ok(mobileDisplayIndex > baseHiddenIndex, "mobile display override must come after the base hidden rule");
});
