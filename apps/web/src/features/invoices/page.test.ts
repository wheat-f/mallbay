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
  assert.match(pageSource, /invoiceable: true/);
  assert.match(pageSource, /paymentStatus: "PAID"/);
  assert.match(pageSource, /const invoiceOrderOptions =/);
  assert.match(pageSource, /const invoiceOptions =/);
  assert.match(pageSource, /可选择同一企业客户的多笔订单/);
  assert.match(pageSource, /mode="multiple"/);
  assert.match(pageSource, /逐单开票金额/);
  assert.match(pageSource, /可开票/);
  assert.match(pageSource, /options=\{invoiceOrderOptions\}/);
  assert.match(pageSource, /placeholder="选择发票"/);
  assert.match(pageSource, /options=\{invoiceOptions\}/);
  assert.doesNotMatch(pageSource, /order\.orderNo \?\? order\.id/);
  assert.match(pageSource, /order\.orderNo \?\? "未编号订单"/);
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

  assert.match(pageSource, /StorePageHeader[\s\S]*新增开票申请[\s\S]*<\/StorePageHeader>/);
  assert.match(pageSource, /StorePageHeader[\s\S]*导出报表[\s\S]*<\/StorePageHeader>/);
  assert.doesNotMatch(pageSource, /invoice-command-bar/);
  assert.match(pageSource, /invoice-metric-grid/);
  assert.match(pageSource, /invoice-filter-panel/);
  assert.match(pageSource, /invoice-workspace/);
  assert.match(pageSource, /invoice-record-list/);
  assert.match(pageSource, /invoice-process-panel/);
  assert.match(pageSource, /invoice-application-drawer/);
  assert.match(pageSource, /发票列表/);
  assert.doesNotMatch(pageSource, /title="发票记录"/);
  assert.doesNotMatch(pageSource, /暂无发票记录/);
  assert.match(pageSource, /开票处理/);
  assert.match(pageSource, /新增开票申请/);
  assert.match(pageSource, /orderStatusFilter/);
  assert.match(pageSource, /paymentStatusFilter/);
  assert.match(pageSource, /<span>订单状态<\/span>/);
  assert.match(pageSource, /<span>收款状态<\/span>/);
  assert.match(pageSource, /\{ value: "PAID", label: "已到款" \}/);
  assert.match(pageSource, /\{ value: "PARTIAL", label: "部分到款" \}/);
  assert.doesNotMatch(pageSource, /\{ value: "PAID", label: "已收齐" \}/);
  assert.doesNotMatch(pageSource, /\{ value: "PARTIAL", label: "部分收款" \}/);
  assert.match(pageSource, /getInvoiceOrderPaymentStatus/);
  assert.match(pageSource, /\{ value: "APPLIED", label: "未开票 \/ 待开票" \}/);
  assert.match(pageSource, /\{ value: "ISSUED", label: "已开票" \}/);
  assert.match(pageSource, /\{ value: "VOIDED", label: "已作废" \}/);
  assert.doesNotMatch(pageSource, /\{ value: "ISSUED", label: "已开具" \}/);
  assert.doesNotMatch(pageSource, /\{ value: "REISSUED", label: "已重开" \}/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
});

test("invoices application drawer includes the prototype recipient information section", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /invoice-drawer-section/);
  assert.match(pageSource, /invoiceType/);
  assert.match(pageSource, /发票类型/);
  assert.match(pageSource, /增值税专用发票/);
  assert.match(pageSource, /增值税普通发票/);
  assert.match(pageSource, /抬头信息/);
  assert.match(pageSource, /收票信息/);
  assert.match(pageSource, /收票人/);
  assert.match(pageSource, /联系电话/);
  assert.match(pageSource, /接收邮箱 \(电子发票必填\)/);
  assert.match(pageSource, /邮寄地址 \(纸质发票必填\)/);
  assert.match(pageSource, /备注/);
  assert.doesNotMatch(pageSource, /invoiceType: values\.invoiceType/);
  assert.match(cssSource, /\.invoice-drawer-section/);
  assert.match(cssSource, /\.invoice-application-drawer \.invoice-drawer-form\s*\{\r?\n\s*display: grid;\r?\n\s*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(cssSource, /\.invoice-application-drawer \.ant-drawer-body\s*\{[\s\S]*overflow-x: hidden;/);
});

test("invoices page uses issued status wording in process success messages", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /message\.success\("发票已开票"\)/);
  assert.match(pageSource, /message\.success\("重新开票已完成"\)/);
  assert.doesNotMatch(pageSource, /message\.success\("发票已开具"\)/);
  assert.doesNotMatch(pageSource, /message\.success\("发票已重开"\)/);
});

test("invoices page handles issue void reissue and send in one process panel", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /selectedInvoiceId/);
  assert.match(pageSource, /invoiceProcessForm/);
  assert.match(pageSource, /作废原因/);
  assert.match(pageSource, /发送电子发票/);
  assert.match(pageSource, /电子发票文件链接/);
  assert.match(pageSource, /重开发票/);
  assert.doesNotMatch(pageSource, /电子文件 URL/);
  assert.doesNotMatch(pageSource, /operation-action-grid/);
});

test("invoices list links records to the prototype invoice detail page", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /useRouter/);
  assert.equal(pageSource.includes("router.push(`/invoices/${row.id}`)"), true);
  assert.match(pageSource, /查看详情/);
});

test("invoices page opens the application drawer from order invoice links", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");

  assert.match(pageSource, /<Suspense fallback=\{<div className="management-page" \/>\}>/);
  assert.match(pageSource, /<InvoicesContent \/>/);
  assert.match(pageSource, /const invoiceActionParam = searchParams\.get\("action"\)/);
  assert.match(pageSource, /const requestedInvoiceOrderId = searchParams\.get\("orderId"\)/);
  assert.match(pageSource, /invoiceActionParam !== "create-invoice"/);
  assert.match(pageSource, /setApplicationDrawerOpen\(true\)/);
  assert.match(pageSource, /orderIds: \[requestedInvoiceOrderId\]/);
  assert.match(pageSource, /allocations: \[\{ orderId: requestedInvoiceOrderId, amountYuan \}\]/);
  assert.match(pageSource, /label: `当前订单 \$\{requestedInvoiceOrderId\} \/ 可开票/);
});
test("invoices page uses mobile invoice cards instead of squeezing the desktop table", () => {
  const pageSource = readFileSync("app/invoices/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /invoice-mobile-cards/);
  assert.match(pageSource, /invoice-mobile-card/);
  assert.match(pageSource, /invoice-desktop-table/);
  assert.match(cssSource, /\.invoice-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{\r?\n\s{2}\.invoice-desktop-table \{\r?\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.invoice-mobile-cards \{\r?\n\s{4}display: grid;/);
});

test("invoices mobile metrics stack to keep money values readable", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(
    cssSource,
    /@media \(max-width: 900px\) \{[\s\S]*\.invoice-mobile-cards\s*\{[\s\S]*\}\r?\n\r?\n {2}\.invoice-metric-grid\s*\{\r?\n {4}grid-template-columns: minmax\(0, 1fr\);\r?\n {2}\}/
  );
});

test("invoice detail page follows the prototype invoice detail and operation log layout", () => {
  const detailPath = "app/invoices/[id]/page.tsx";

  assert.equal(existsSync(detailPath), true);

  const pageSource = readFileSync(detailPath, "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /invoicesApi\.list/);
  assert.match(pageSource, /发票详情/);
  assert.match(pageSource, /返回发票列表/);
  assert.doesNotMatch(pageSource, /返回发票管理/);
  assert.doesNotMatch(pageSource, /StorePageHeader/);
  assert.match(pageSource, /invoice-detail-hero/);
  assert.match(pageSource, /invoice-detail-actions/);
  assert.match(pageSource, /查看操作日志/);
  assert.match(pageSource, /isLogModalOpen/);
  assert.match(pageSource, /\bModal\b/);
  assert.match(pageSource, /invoice-detail-log-modal/);
  assert.match(pageSource, /操作日志流水/);
  assert.match(pageSource, /财务经理修改了抬头信息/);
  assert.doesNotMatch(pageSource, /财务核对发票信息/);
  assert.match(pageSource, /基本信息/);
  assert.match(pageSource, /创建时间/);
  assert.match(pageSource, /纳税人识别号/);
  assert.match(pageSource, /增值税专用发票 \(电子版\)/);
  assert.doesNotMatch(pageSource, /value="增值税电子发票"/);
  assert.match(pageSource, /注册地址与电话/);
  assert.match(pageSource, /开票资料待补充/);
  assert.match(pageSource, /formatInvoiceDetailDate/);
  assert.match(pageSource, /getInvoiceTaxNoDisplay/);
  assert.match(pageSource, /getInvoiceBillingContactDisplay/);
  assert.match(pageSource, /关联订单/);
  assert.match(pageSource, /发票明细项目/);
  assert.match(pageSource, /<span>单价<\/span>/);
  assert.match(pageSource, /订单开票[\s\S]*formatCentsAsYuan\(invoice\.amountCents\)[\s\S]*formatCentsAsYuan\(invoice\.amountCents\)/);
  assert.match(pageSource, /状态变迁历史/);
  assert.match(pageSource, /内部备注/);
  assert.match(pageSource, /高端保时捷车主/);
  assert.match(pageSource, /先收回原纸质质保卡或作废记录/);
  assert.doesNotMatch(pageSource, /核对订单收款、发票抬头和电子文件后再发送给客户。/);
  assert.match(pageSource, /invoice-detail-note-editor/);
  assert.match(pageSource, /添加新备注\.\.\./);
  assert.match(pageSource, /累计开票总额 \(本月\)/);
  assert.doesNotMatch(pageSource, /本张发票金额/);
  assert.match(pageSource, /报表分析统计/);
  assert.doesNotMatch(pageSource, /经营报表统计/);
  assert.equal(pageSource.includes("废弃/取消发票"), true);
  assert.match(pageSource, /重新开具/);
  assert.match(pageSource, /getInvoiceDetailTimeline/);
  assert.match(pageSource, /getInvoiceStatusLabel/);
  assert.match(pageSource, /已开票/);
  assert.doesNotMatch(pageSource, /已开具/);
  assert.doesNotMatch(pageSource, /已重开/);
  assert.match(pageSource, /invoice-detail-page/);
  assert.match(pageSource, /invoice-detail-status-card/);
  assert.match(pageSource, /invoice-detail-line-items/);
  assert.match(pageSource, /invoice-detail-timeline/);

  assert.match(cssSource, /\.invoice-detail-page/);
  assert.match(cssSource, /\.invoice-detail-hero/);
  assert.match(cssSource, /\.invoice-detail-actions/);
  assert.match(cssSource, /\.invoice-detail-status-card/);
  assert.match(cssSource, /\.invoice-detail-line-items/);
  assert.match(
    cssSource,
    /\.invoice-detail-line-head,\r?\n\.invoice-detail-line-row\s*\{\r?\n\s*display: grid;\r?\n\s*grid-template-columns: minmax\(220px, 1\.5fr\) minmax\(120px, 0\.7fr\) minmax\(64px, 0\.4fr\) minmax\(100px, 0\.55fr\) minmax\(110px, 0\.6fr\);/
  );
  assert.match(cssSource, /\.invoice-detail-timeline/);
});

test("invoice detail page wires issue reissue and void actions to invoice APIs", () => {
  const pageSource = readFileSync("app/invoices/[id]/page.tsx", "utf8");

  assert.match(pageSource, /useMutation/);
  assert.match(pageSource, /invoicesApi\.issue\(invoiceId/);
  assert.match(pageSource, /invoicesApi\.reissue\(invoiceId/);
  assert.match(pageSource, /invoicesApi\.void\(invoiceId/);
  assert.match(pageSource, /openInvoiceAction\("ISSUE"\)/);
  assert.match(pageSource, /openInvoiceAction\("REISSUE"\)/);
  assert.match(pageSource, /openInvoiceAction\("VOID"\)/);
  assert.match(pageSource, /actionForm\.validateFields/);
  assert.match(pageSource, /取消申请/);
  assert.match(pageSource, /废弃\/取消发票/);
});



