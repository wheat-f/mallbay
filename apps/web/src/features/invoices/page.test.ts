import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

test("invoices page exposes invoice sending form", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /sendForm/);
  assert.match(pageSource, /invoicesApi\.send/);
  assert.match(pageSource, /发送发票/);
  assert.match(pageSource, /接收人/);
  assert.match(pageSource, /发送渠道/);
});

test("invoices page uses business selectors instead of manual ids", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /orderApi\.list\(\{/);
  assert.match(pageSource, /const invoiceOrderOptions =/);
  assert.match(pageSource, /const invoiceOptions =/);
  assert.match(pageSource, /placeholder="选择可开票订单"/);
  assert.match(pageSource, /options=\{invoiceOrderOptions\}/);
  assert.match(pageSource, /placeholder="选择发票"/);
  assert.match(pageSource, /options=\{invoiceOptions\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="订单 ID"/);
  assert.doesNotMatch(pageSource, /<Input placeholder="发票 ID"/);
});

test("invoices page table uses business labels instead of technical id columns", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /getInvoiceBusinessLabel/);
  assert.match(pageSource, /getInvoiceOrderLabel/);
  assert.doesNotMatch(pageSource, /title: "发票 ID"/);
  assert.doesNotMatch(pageSource, /dataIndex: "orderId"/);
});

test("invoices page follows the prototype billing center layout", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /invoice-command-bar/);
  assert.match(pageSource, /invoice-metric-grid/);
  assert.match(pageSource, /invoice-filter-panel/);
  assert.match(pageSource, /invoice-workspace/);
  assert.match(pageSource, /invoice-record-list/);
  assert.match(pageSource, /invoice-process-panel/);
  assert.match(pageSource, /invoice-application-drawer/);
  assert.match(pageSource, /发票记录/);
  assert.match(pageSource, /开票处理/);
  assert.match(pageSource, /新增开票申请/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
});

test("invoices page handles issue void reissue and send in one process panel", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /selectedInvoiceId/);
  assert.match(pageSource, /invoiceProcessForm/);
  assert.match(pageSource, /作废原因/);
  assert.match(pageSource, /发送电子发票/);
  assert.match(pageSource, /重开发票/);
  assert.doesNotMatch(pageSource, /operation-action-grid/);
});

test("invoices list links records to the prototype invoice detail page", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /useRouter/);
  assert.equal(pageSource.includes("router.push(`/invoices/${row.id}`)"), true);
  assert.match(pageSource, /查看详情/);
});

test("invoices page uses mobile invoice cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /invoice-mobile-cards/);
  assert.match(pageSource, /invoice-mobile-card/);
  assert.match(pageSource, /invoice-desktop-table/);
  assert.match(cssSource, /\.invoice-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.invoice-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.invoice-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("invoices mobile metrics stack to keep money values readable", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(
    cssSource,
    /@media \(max-width: 720px\) \{[\s\S]*\.invoice-mobile-cards\s*\{[\s\S]*\}\n\n {2}\.invoice-metric-grid\s*\{\n {4}grid-template-columns: minmax\(0, 1fr\);\n {2}\}/
  );
});

test("invoice detail page follows the prototype invoice detail and operation log layout", () => {
  const detailPath = "app/invoices/[id]/page.tsx";

  assert.equal(existsSync(detailPath), true);

  const pageSource = readFileSync(detailPath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /invoicesApi\.list/);
  assert.match(pageSource, /发票详情/);
  assert.match(pageSource, /基本信息/);
  assert.match(pageSource, /关联订单/);
  assert.match(pageSource, /发票明细项目/);
  assert.match(pageSource, /状态变迁历史/);
  assert.match(pageSource, /内部备注/);
  assert.equal(pageSource.includes("废弃/取消发票"), true);
  assert.match(pageSource, /重新开具/);
  assert.match(pageSource, /getInvoiceDetailTimeline/);
  assert.match(pageSource, /invoice-detail-page/);
  assert.match(pageSource, /invoice-detail-status-card/);
  assert.match(pageSource, /invoice-detail-line-items/);
  assert.match(pageSource, /invoice-detail-timeline/);

  assert.match(cssSource, /\.invoice-detail-page/);
  assert.match(cssSource, /\.invoice-detail-status-card/);
  assert.match(cssSource, /\.invoice-detail-line-items/);
  assert.match(cssSource, /\.invoice-detail-timeline/);
});
