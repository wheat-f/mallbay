import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getInvoiceBusinessLabel,
  getInvoiceFileDisplay,
  getInvoiceOrderLabel,
  getInvoiceOrderPaymentStatus,
  getInvoiceStatusLabel
} from "./display";

test("getInvoiceStatusLabel formats invoice statuses", () => {
  assert.equal(getInvoiceStatusLabel("APPLIED"), "待开票");
  assert.equal(getInvoiceStatusLabel("ISSUED"), "已开票");
  assert.equal(getInvoiceStatusLabel("VOIDED"), "已作废");
  assert.equal(getInvoiceStatusLabel("REISSUED"), "已开票");
  assert.equal(getInvoiceStatusLabel("UNKNOWN"), "状态待确认");
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

test("getInvoiceOrderPaymentStatus derives payment filters from order amount summary", () => {
  assert.equal(getInvoiceOrderPaymentStatus({ order: { amount: { paidAmountCents: 0, outstandingCents: 120000 } } }), "UNPAID");
  assert.equal(getInvoiceOrderPaymentStatus({ order: { amount: { paidAmountCents: 50000, outstandingCents: 70000 } } }), "PARTIAL");
  assert.equal(getInvoiceOrderPaymentStatus({ order: { amount: { paidAmountCents: 120000, outstandingCents: 0 } } }), "PAID");
  assert.equal(getInvoiceOrderPaymentStatus({ order: null }), "UNKNOWN");
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
  assert.equal(getInvoiceOrderLabel({ orderId: "cm-order-technical-id", order: null }), "关联订单待确认");
});

test("getInvoiceBusinessLabel does not expose invoice technical ids", () => {
  assert.equal(getInvoiceBusinessLabel({ id: "cm-invoice-technical-id" }), "发票信息待确认");
});
