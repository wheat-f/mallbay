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

test("order detail renders suggested and final construction charge with adjustment reason", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /系统建议施工收费/);
  assert.match(pageSource, /本单施工收费/);
  assert.match(pageSource, /施工收费调整原因/);
  assert.match(pageSource, /suggestedConstructionChargeCents/);
  assert.match(pageSource, /constructionChargeAdjustmentReason/);
});

test("order detail exposes pending dispatch confirmation and fulfillment links", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");
  const drawerSource = readFileSync("src/features/orders/order-payment-drawer.tsx", "utf8");

  assert.match(pageSource, /shouldShowFulfillmentConfirmation/);
  assert.match(pageSource, /确认派工流转/);
  assert.match(pageSource, /openOrderPaymentEntry/);
  assert.match(pageSource, /paymentDrawerOpen/);
  assert.match(pageSource, /OrderPaymentDrawer/);
  assert.match(pageSource, /setPaymentDrawerOpen\(true\)/);
  assert.match(pageSource, /openOrderInvoiceEntry/);
  assert.doesNotMatch(pageSource, /\/finance\?section=ledger&action=record-payment/);
  assert.match(drawerSource, /orderApi\.addPayment/);
  assert.match(drawerSource, /orderApi\.paymentAccounts/);
  assert.match(pageSource, /\/invoices\?action=create-invoice&orderId=\$\{order\.id\}/);
  assert.match(pageSource, /确认提交派工与库房匹配/);
  assert.match(pageSource, /openFulfillmentDrawer/);
  assert.match(pageSource, /打开确认流转/);
  assert.match(pageSource, /continueFulfillmentFlow/);
  assert.match(pageSource, /fulfillmentCanEnterConstruction/);
  assert.match(pageSource, /确认提交，进入库房匹配/);
  assert.match(pageSource, /确认提交，进入施工派工/);
  assert.match(pageSource, /router\.push\(fulfillmentCanEnterConstruction \? "\/construction\/assignments" : `\/inventory\/matching\?orderId=\$\{params\.id\}`\)/);
  assert.doesNotMatch(pageSource, /router\.push\("\/inventory"\)/);
  assert.doesNotMatch(pageSource, /<Button[^>]*>进入施工派工<\/Button>/);
});

test("order detail shows the responsible salesperson", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /客户与销售信息/);
  assert.match(pageSource, /`销售员 \$\{getSalesPersonName\(order\)\}`/);
  assert.match(pageSource, /getSalesPersonName/);
  assert.match(pageSource, /salesPerson\?:/);
});

test("order detail renders the frozen order contact snapshot", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /contactSnapshot\?:/);
  assert.match(pageSource, /订单联系人/);
  assert.match(pageSource, /联系人部门/);
  assert.match(pageSource, /getOrderContactLabel/);
  assert.match(pageSource, /联系人快照待补齐/);
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
  assert.match(pageSource, /fulfillmentPrimaryActionLabel/);
  assert.match(pageSource, /order-fulfillment-flow-steps/);
  assert.match(pageSource, /库房匹配完成后再进入施工派工/);
  assert.match(pageSource, /货品已完成匹配，可进入施工派工。/);
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

test("order detail synchronizes fulfillment summary checks with the drawer draft", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /useEffect\(\(\) => \{/);
  assert.match(pageSource, /setFulfillmentChecklist\(draft\?\.checklist \?\? emptyFulfillmentChecklist\)/);
  assert.match(pageSource, /const fulfillmentChecklistItems = getFulfillmentChecklistItems\(fulfillmentChecklist\)/);
  assert.match(pageSource, /fulfillmentChecklistItems\.map/);
  assert.match(pageSource, /item\.checked \? "is-checked" : "is-pending"/);
  assert.match(pageSource, /checked=\{fulfillmentChecklist\.customerConfirmed\}/);
  assert.match(pageSource, /checked=\{fulfillmentChecklist\.scheduleNotified\}/);
  assert.match(pageSource, /checked=\{fulfillmentChecklist\.commercialConfirmed\}/);
  assert.match(pageSource, /getFulfillmentChecklistItems/);
  assert.match(cssSource, /\.order-check-row\.is-checked \.anticon/);
  assert.match(cssSource, /\.order-check-row\.is-pending \.anticon/);
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
  assert.match(pageSource, /commercialEditableStatuses/);
  assert.match(pageSource, /"DISPATCHED"/);
  assert.match(pageSource, /"IN_CONSTRUCTION"/);
  assert.match(pageSource, /"COMPLETED"/);
  assert.match(pageSource, /"WARRANTIED"/);
  assert.match(pageSource, /id: item\.id/);
  assert.match(pageSource, /收款未完全确认前可修改产品清单/);
  assert.match(pageSource, /收款未完全确认前可调整产品、数量、单价和施工收费/);
  assert.doesNotMatch(pageSource, /order\.status === "PENDING_DISPATCH" && hasEditableOutstandingAmount/);
  assert.match(pageSource, /rootClassName="order-commercials-drawer"/);
  assert.match(pageSource, /order-commercials-drawer-footer/);
  assert.match(pageSource, /order-commercials-item-grid/);
  assert.match(cssSource, /\.order-commercials-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /width:\s*min\(720px,\s*calc\(100vw - 24px\)\)/);
  assert.match(cssSource, /\.order-commercials-drawer-footer/);
  assert.doesNotMatch(pageSource, /<Modal\b/);
  assert.doesNotMatch(pageSource, /openCommercialsModal/);
});

test("order detail edits active unpaid order commercials without requiring return-to-edit", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.doesNotMatch(pageSource, /反审核退回修改/);
  assert.doesNotMatch(pageSource, /returnToPendingMutation/);
  assert.doesNotMatch(pageSource, /orderApi\.returnToPendingDispatch\(params\.id/);
  assert.match(pageSource, /canEditCommercials/);
  assert.match(pageSource, /修改订单/);
});

test("order detail exposes a finance review action for pending amendment requests", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /canReviewAmendment/);
  assert.match(pageSource, /财务审批/);
  assert.match(pageSource, /reviewAmendmentRequest/);
  assert.match(pageSource, /批准，开放改单/);
  assert.match(pageSource, /驳回，不开放修改/);
  assert.match(pageSource, /不改变施工、交付或质保进度/);
  assert.doesNotMatch(pageSource, /批准后订单退回待派工/);
});

test("settled order amendment hides duplicate requests and only exposes commercial fields", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /hasCompletedAmendment/);
  assert.match(pageSource, /!hasApprovedAmendment/);
  assert.match(pageSource, /申请结算后金额修改/);
  assert.match(pageSource, /仅可修改产品、数量、单价和施工收费/);
  assert.doesNotMatch(pageSource, /申请反审核修改/);
});

test("order commercial editor shows the selected product sales unit beside quantity", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /label="单位"/);
  assert.match(pageSource, /getSelectedCommercialProductUnitLabel/);
  assert.match(pageSource, /getProductUnitLabel\(resolveProductSalesUnit\(product\)\)/);
  assert.match(pageSource, /销售单位：/);
  assert.match(cssSource, /minmax\(72px, 0\.2fr\)/);
});

test("finance users cannot modify order business data or operate fulfillment", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.doesNotMatch(pageSource, /canOperateFulfillment/);
  assert.match(pageSource, /lifecycle\?\.capabilities/);
  assert.match(pageSource, /capability\?\.visible/);
  assert.match(pageSource, /disabled: !capability\.enabled/);
  assert.match(pageSource, /&& canManageOrderAmendment/);
  assert.match(pageSource, /lifecycle\?\.capabilities\.dispatch\?\.enabled/);
  assert.match(pageSource, /position === "FINANCE"/);
});

test("order detail limits a rejected amendment resubmission to the order owner roles", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /canManageOrderAmendment/);
  assert.match(pageSource, /"CUSTOMER_SERVICE"/);
  assert.match(pageSource, /user\.id === order\.salesPersonId/);
  assert.match(pageSource, /财务仅负责审批/);
});

test("order detail describes amendment audit outcomes and reasons in business language", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /提交本月结算订单改单申请/);
  assert.match(pageSource, /财务批准改单申请/);
  assert.match(pageSource, /财务驳回改单申请/);
  assert.match(pageSource, /订单进度状态修复/);
  assert.match(pageSource, /申请原因：/);
  assert.match(pageSource, /审批结论：已批准/);
  assert.match(pageSource, /审批结论：已驳回/);
  assert.match(pageSource, /审批意见：/);
});

test("order detail drawers avoid force rendering closed portal content", () => {
  const pageSource = readFileSync("app/orders/[id]/page.tsx", "utf8");

  assert.doesNotMatch(pageSource, /\bforceRender\b/);
});
