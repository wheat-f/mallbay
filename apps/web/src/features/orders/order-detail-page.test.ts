import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("order detail audit events render actor business labels", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /getAuditActorLabel/);
  assert.doesNotMatch(pageSource, /操作人：\$\{event\.actorId\}/);
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
  assert.match(pageSource, /确认提交派工与库房匹配/);
  assert.match(pageSource, /openFulfillmentDrawer/);
  assert.match(pageSource, /打开确认流转/);
  assert.match(pageSource, /进入库房匹配/);
  assert.match(pageSource, /router\.push\("\/inventory"\)/);
  assert.match(pageSource, /进入施工派工/);
  assert.match(pageSource, /router\.push\("\/construction\/assignments"\)/);
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
  assert.match(pageSource, /确认提交，进入派工流转/);
  assert.match(pageSource, /暂存草稿/);
  assert.match(pageSource, /order-fulfillment-drawer-body/);
  assert.match(pageSource, /order-fulfillment-product-row/);
  assert.match(pageSource, /order-fulfillment-checklist/);
  assert.match(cssSource, /\.order-fulfillment-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /\.order-fulfillment-drawer-body/);
  assert.match(cssSource, /\.order-fulfillment-product-row/);
  assert.match(cssSource, /\.order-fulfillment-checklist/);
});

test("order detail follows the prototype stepper and bento workspace layout", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /order-detail-hero/);
  assert.match(pageSource, /order-detail-stepper/);
  assert.match(pageSource, /order-detail-bento/);
  assert.match(pageSource, /order-customer-card/);
  assert.match(pageSource, /order-product-card/);
  assert.match(pageSource, /order-construction-card/);
  assert.match(pageSource, /order-payment-card/);
  assert.match(pageSource, /order-audit-card/);
  assert.doesNotMatch(pageSource, /detail-layout/);
});

test("order detail commercial editor uses a prototype right-side drawer", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /\bDrawer\b/);
  assert.match(pageSource, /openCommercialsDrawer/);
  assert.match(pageSource, /rootClassName="order-commercials-drawer"/);
  assert.match(pageSource, /order-commercials-drawer-footer/);
  assert.match(pageSource, /order-commercials-item-grid/);
  assert.match(cssSource, /\.order-commercials-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /width:\s*min\(720px,\s*calc\(100vw - 24px\)\)/);
  assert.match(cssSource, /\.order-commercials-drawer-footer/);
  assert.doesNotMatch(pageSource, /<Modal\b/);
  assert.doesNotMatch(pageSource, /openCommercialsModal/);
});

test("order detail drawers avoid force rendering closed portal content", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.doesNotMatch(pageSource, /\bforceRender\b/);
});
