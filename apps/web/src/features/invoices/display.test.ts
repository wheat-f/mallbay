import assert from "node:assert/strict";
import { test } from "node:test";
import { getInvoiceBusinessLabel, getInvoiceFileDisplay, getInvoiceOrderLabel, getInvoiceStatusLabel } from "./display";

test("getInvoiceStatusLabel formats invoice statuses", () => {
  assert.equal(getInvoiceStatusLabel("APPLIED"), "已申请");
  assert.equal(getInvoiceStatusLabel("ISSUED"), "已开具");
  assert.equal(getInvoiceStatusLabel("VOIDED"), "已作废");
  assert.equal(getInvoiceStatusLabel("REISSUED"), "已重开");
  assert.equal(getInvoiceStatusLabel("UNKNOWN"), "UNKNOWN");
});

test("getInvoiceFileDisplay formats electronic invoice file state", () => {
  assert.deepEqual(
    getInvoiceFileDisplay("https://cdn.example.com/invoices/INV-1.pdf"),
    { label: "查看电子文件", href: "https://cdn.example.com/invoices/INV-1.pdf", available: true }
  );
  assert.deepEqual(
    getInvoiceFileDisplay(null),
    { label: "未上传", href: undefined, available: false }
  );
});

test("invoice display helpers use invoice number and order business fields", () => {
  const invoice = {
    id: "invoice-1",
    invoiceNo: "INV-2026-001",
    title: "客户发票",
    order: {
      orderNo: "ORD-001",
      customer: { companyName: "星河汽车", personalName: null, name: null },
      vehicle: { plateNo: "湘A10001" }
    }
  };

  assert.equal(getInvoiceBusinessLabel(invoice), "INV-2026-001 / 客户发票 / ORD-001 / 星河汽车 / 湘A10001");
  assert.equal(getInvoiceOrderLabel(invoice), "ORD-001 / 星河汽车 / 湘A10001");
});

test("getInvoiceOrderLabel does not expose technical order ids when order summary is missing", () => {
  assert.equal(getInvoiceOrderLabel({ orderId: "cm-order-technical-id", order: null }), "订单未加载");
});
