import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("order detail audit events render actor business labels", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /getAuditActorLabel/);
  assert.match(pageSource, /订单操作记录/);
  assert.doesNotMatch(pageSource, /操作人：\$\{event\.actorId\}/);
  assert.doesNotMatch(pageSource, /return labels\[action\] \?\? action/);
});

test("order detail renders suggested and final labor cost with adjustment reason", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /建议人工费/);
  assert.match(pageSource, /最终人工费/);
  assert.match(pageSource, /人工费调整原因/);
  assert.match(pageSource, /suggestedLaborCostCents/);
  assert.match(pageSource, /laborCostAdjustmentReason/);
});

test("order detail exposes pending dispatch confirmation and fulfillment links", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /shouldShowFulfillmentConfirmation/);
  assert.match(pageSource, /确认派工流转/);
  assert.match(pageSource, /openOrderPaymentEntry/);
  assert.match(pageSource, /openOrderInvoiceEntry/);
  assert.match(pageSource, /\/finance\?section=ledger&action=record-payment&orderId=\$\{order\.id\}/);
  assert.match(pageSource, /\/invoices\?action=create-invoice&orderId=\$\{order\.id\}/);
  assert.match(pageSource, /确认提交派工与库房匹配/);
  assert.match(pageSource, /openFulfillmentDrawer/);
  assert.match(pageSource, /打开确认流转/);
  assert.match(pageSource, /continueToInventoryMatching/);
  assert.match(pageSource, /确认提交，进入库房匹配/);
  assert.match(pageSource, /router\.push\(`\/inventory\/matching\?orderId=\$\{params\.id\}`\)/);
  assert.doesNotMatch(pageSource, /router\.push\("\/inventory"\)/);
  assert.doesNotMatch(pageSource, /router\.push\("\/construction\/assignments"\)/);
  assert.doesNotMatch(pageSource, /<Button[^>]*>进入施工派工<\/Button>/);
});

test("order detail confirmation flow uses the prototype right-side drawer", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /fulfillmentDrawerOpen/);
  assert.match(pageSource, /rootClassName="order-fulfillment-drawer"/);
  assert.match(pageSource, /订单概览/);
  assert.match(pageSource, /货品匹配预检/);
  assert.match(pageSource, /已核对客户信息及施工要求/);
  assert.match(pageSource, /已告知客户施工时间及注意事项/);
  assert.match(pageSource, /给库房\/施工主管的补充建议/);
  assert.match(pageSource, /确认提交，进入库房匹配/);
  assert.match(pageSource, /order-fulfillment-flow-steps/);
  assert.match(pageSource, /库房匹配完成后再进入施工派工/);
  assert.match(pageSource, /暂存草稿/);
  assert.match(pageSource, /order-fulfillment-drawer-body/);
  assert.match(pageSource, /order-fulfillment-product-row/);
  assert.match(pageSource, /order-fulfillment-checklist/);
  assert.match(cssSource, /\.order-fulfillment-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /\.order-fulfillment-drawer-body/);
  assert.match(cssSource, /\.order-fulfillment-product-row/);
  assert.match(cssSource, /\.order-fulfillment-checklist/);
});

test("order detail fulfillment preview reflects inventory match state", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");
  const fulfillmentSource = readFileSync("src/features/orders/fulfillment.ts", "utf8");

  assert.match(pageSource, /inventoryAllocations/);
  assert.match(pageSource, /getFulfillmentInventoryStatus/);
  assert.match(fulfillmentSource, /已匹配/);
  assert.match(fulfillmentSource, /已出库/);
  assert.match(fulfillmentSource, /待库房匹配/);
  assert.doesNotMatch(pageSource, /<Tag color="processing">待库房匹配<\/Tag>/);
});

test("order detail fulfillment draft persists checks and notes per order", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /getFulfillmentDraftKey/);
  assert.match(pageSource, /params\.id/);
  assert.match(pageSource, /loadFulfillmentDraft\(params\.id\)/);
  assert.match(pageSource, /saveFulfillmentDraft\(params\.id/);
  assert.match(pageSource, /fulfillmentChecklist/);
  assert.match(pageSource, /setFulfillmentChecklist/);
  assert.match(pageSource, /fulfillmentNote/);
  assert.match(pageSource, /setFulfillmentNote/);
  assert.match(pageSource, /checked=\{fulfillmentChecklist\.customerConfirmed\}/);
  assert.match(pageSource, /checked=\{fulfillmentChecklist\.scheduleNotified\}/);
  assert.match(pageSource, /checked=\{fulfillmentChecklist\.commercialConfirmed\}/);
  assert.match(pageSource, /value=\{fulfillmentNote\}/);
  assert.match(pageSource, /localStorage\.setItem/);
  assert.match(pageSource, /localStorage\.getItem/);
});

test("order detail follows the prototype stepper and bento workspace layout", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /order-detail-hero/);
  assert.match(pageSource, /order-detail-stepper/);
  assert.match(pageSource, /getOrderWorkflowIndex/);
  assert.match(pageSource, /订单确认/);
  assert.match(pageSource, /库房匹配/);
  assert.match(pageSource, /施工派工/);
  assert.match(pageSource, /施工交付/);
  assert.match(pageSource, /质保售后/);
  assert.doesNotMatch(pageSource, /const labels = \["待派单", "已派单", "施工中", "已完工", "已质保"\]/);
  assert.match(pageSource, /order-detail-bento/);
  assert.match(pageSource, /order-customer-card/);
  assert.match(pageSource, /order-product-card/);
  assert.match(pageSource, /order-construction-card/);
  assert.match(pageSource, /order-payment-card/);
  assert.match(pageSource, /order-audit-card/);
  assert.doesNotMatch(pageSource, /detail-layout/);
});

test("order detail exposes prototype related document shortcuts", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /order-related-card/);
  assert.match(pageSource, /相关单据/);
  assert.match(pageSource, /发票记录/);
  assert.match(pageSource, /电子质保单/);
  assert.match(pageSource, /售后记录/);
  assert.match(pageSource, /openOrderInvoiceEntry/);
  assert.match(pageSource, /router\.push\("\/warranties"\)/);
  assert.match(pageSource, /router\.push\("\/after-sales"\)/);
});

test("order detail returns to the order list instead of the workbench", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /返回订单列表/);
  assert.match(pageSource, /router\.push\("\/orders"\)/);
  assert.doesNotMatch(pageSource, /返回工作台/);
});

test("order detail commercial editor uses a prototype right-side drawer", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /\bDrawer\b/);
  assert.match(pageSource, /openCommercialsDrawer/);
  assert.match(pageSource, /outstandingCents/);
  assert.match(pageSource, /收款未完全确认前可修改产品清单/);
  assert.doesNotMatch(pageSource, /const canEditCommercials = order\?\.status === "PENDING_DISPATCH"/);
  assert.match(pageSource, /rootClassName="order-commercials-drawer"/);
  assert.match(pageSource, /order-commercials-drawer-footer/);
  assert.match(pageSource, /order-commercials-item-grid/);
  assert.match(cssSource, /\.order-commercials-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /width:\s*min\(720px,\s*calc\(100vw - 24px\)\)/);
  assert.match(cssSource, /\.order-commercials-drawer-footer/);
  assert.doesNotMatch(pageSource, /<Modal\b/);
  assert.doesNotMatch(pageSource, /openCommercialsModal/);
});

test("order detail exposes return-to-edit flow before editing locked orders", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /returnToPendingMutation/);
  assert.match(pageSource, /反审核退回修改/);
  assert.match(pageSource, /returnReason/);
  assert.match(pageSource, /orderApi\.returnToPendingDispatch\(params\.id/);
  assert.match(pageSource, /ORDER_RETURNED_TO_PENDING_DISPATCH/);
});

test("order detail drawers avoid force rendering closed portal content", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.doesNotMatch(pageSource, /\bforceRender\b/);
});
