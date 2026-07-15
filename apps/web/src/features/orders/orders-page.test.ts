import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("orders page preserves filters in the URL", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");

  assert.match(pageSource, /useSearchParams/);
  assert.match(pageSource, /searchParams\.get\("q"\)/);
  assert.match(pageSource, /searchParams\.get\("status"\)/);
  assert.match(pageSource, /searchParams\.get\("constructionType"\)/);
  assert.match(pageSource, /searchParams\.get\("paymentStatus"\)/);
  assert.match(pageSource, /searchParams\.get\("createdFrom"\)/);
  assert.match(pageSource, /searchParams\.get\("createdTo"\)/);
  assert.match(pageSource, /router\.replace/);
  assert.match(pageSource, /updateOrderListUrl/);
});

test("orders page preserves pagination in the URL", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");

  assert.match(pageSource, /searchParams\.get\("page"\)/);
  assert.match(pageSource, /searchParams\.get\("pageSize"\)/);
  assert.match(pageSource, /setPage/);
  assert.match(pageSource, /setPageSize/);
  assert.match(pageSource, /current: page/);
  assert.match(pageSource, /pageSize/);
  assert.match(pageSource, /total: ordersQuery\.data\?\.total/);
  assert.match(pageSource, /updateOrderListUrl\(\{ page: nextPage, pageSize: nextPageSize \}\)/);
});

test("orders page follows the prototype operations-list structure", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");

  assert.match(pageSource, /title="销售订单列表"/);
  assert.match(pageSource, /management-kpi-grid management-kpi-grid-five/);
  assert.match(pageSource, /orders-filter-card/);
  assert.match(pageSource, /DatePicker\.RangePicker/);
  assert.match(pageSource, /订单编号/);
  assert.match(pageSource, /车辆信息/);
  assert.match(pageSource, /预约日期/);
  assert.match(pageSource, /金额\/已收/);
  assert.match(pageSource, /支付状态/);
  assert.match(pageSource, /施工进度/);
  assert.match(pageSource, /销售员/);
  assert.match(pageSource, /scroll=\{\{ x: 1200 \}\}/);
  assert.match(pageSource, /exportRowsToExcel/);
  assert.match(pageSource, /sales-order-product-details-by-\$\{exportDimension\}\.xlsx/);
  assert.match(pageSource, /导出产品明细/);
});

test("orders page exports all filtered sales product rows through the server", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");

  assert.match(pageSource, /orderApi\.exportDetails\(\{/);
  assert.match(pageSource, /q,\s*status,\s*constructionType,\s*paymentStatus,\s*createdFrom,\s*createdTo,/);
  assert.match(pageSource, /exportDimension/);
  assert.match(pageSource, /产品行金额/);
  assert.match(pageSource, /整单金额_每行重复/);
  assert.doesNotMatch(pageSource, /const exportRows = \[\.\.\.rows\]/);
});

test("orders page exposes saved local drafts with continue and delete actions", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");

  assert.match(pageSource, /loadCreateOrderDraft\(window\.localStorage, storeId\)/);
  assert.match(pageSource, /本机草稿/);
  assert.match(pageSource, /\/orders\/create\?draft=local/);
  assert.match(pageSource, /继续编辑/);
  assert.match(pageSource, /removeCreateOrderDraft\(localStorage\)/);
  assert.match(pageSource, /删除草稿/);
});

test("orders page exposes compact icon actions like the prototype", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");

  assert.match(pageSource, /EyeOutlined/);
  assert.match(pageSource, /CreditCardOutlined/);
  assert.match(pageSource, /FileTextOutlined/);
  assert.match(pageSource, /title="查看详情"/);
  assert.match(pageSource, /title="记录收款"/);
  assert.match(pageSource, /title="申请发票"/);
});

test("orders page records payments inside the order workflow and keeps invoices in invoice module", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");
  const drawerSource = readFileSync("src/features/orders/order-payment-drawer.tsx", "utf8");

  assert.match(pageSource, /openOrderPaymentEntry/);
  assert.match(pageSource, /OrderPaymentDrawer/);
  assert.match(pageSource, /setPaymentOrder\(order\)/);
  assert.match(pageSource, /openOrderInvoiceEntry/);
  assert.doesNotMatch(pageSource, /\/finance\?section=ledger&action=record-payment/);
  assert.match(drawerSource, /orderApi\.paymentAccounts/);
  assert.match(drawerSource, /orderApi\.addPayment/);
  assert.match(drawerSource, /记录订单收款/);
  assert.match(drawerSource, /确认收款/);
  assert.match(drawerSource, /已收金额/);
  assert.match(drawerSource, /待收金额/);
  assert.match(pageSource, /\/invoices\?action=create-invoice&orderId=\$\{orderId\}/);
  assert.match(pageSource, /onClick=\{\(\) => openOrderPaymentEntry\(row\)\}/);
  assert.match(pageSource, /onClick=\{\(\) => openOrderInvoiceEntry\(row\.id\)\}/);
});

test("orders page keeps the wide table inside the management canvas", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /className="management-table-card"/);
  assert.match(pageSource, /scroll=\{\{ x: 1200 \}\}/);
  assert.match(cssSource, /\.management-table-card\.ant-card[\s\S]*max-width: 100%/);
  assert.match(cssSource, /\.management-table-card \.ant-card-body[\s\S]*overflow: hidden/);
  assert.match(cssSource, /\.management-table-card \.ant-table-wrapper[\s\S]*max-width: 100%/);
  assert.match(cssSource, /\.management-table-card \.ant-table-content[\s\S]*contain: layout paint/);
  assert.match(cssSource, /\.management-main[\s\S]*overflow-x: clip/);
  assert.match(cssSource, /\.management-content[\s\S]*overflow-x: clip/);
});

test("orders page uses mobile order cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /orders-mobile-cards/);
  assert.match(pageSource, /orders-mobile-card/);
  assert.match(pageSource, /orders-desktop-table/);
  assert.match(cssSource, /\.orders-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{\r?\n\s{2}\.orders-desktop-table \{\r?\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.orders-mobile-cards \{\r?\n\s{4}display: grid;/);
});

test("orders page formats appointment dates for table scanning", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");

  assert.match(pageSource, /formatOrderListDate/);
  assert.match(pageSource, /formatOrderListDate\(row\.appointmentDate \?\? row\.createdAt\)/);
  assert.match(pageSource, /日期待确认/);
  assert.doesNotMatch(pageSource, /row\.appointmentDate \?\? row\.createdAt\?\.slice/);
  assert.doesNotMatch(pageSource, /match\?\.\[1\] \?\? value/);
});
