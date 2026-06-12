import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
