import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("inventory purchase order table exposes expected arrival reminders", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /getPurchaseOrderArrivalReminder/);
  assert.match(pageSource, /预计到货/);
  assert.match(pageSource, /到货提醒/);
});

test("inventory purchase requirement table uses source order business labels", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /getPurchaseRequirementSourceOrderLabel/);
  assert.doesNotMatch(pageSource, /dataIndex: "sourceOrderId"/);
});

test("inventory purchase requirement table shows product demand summary instead of requirement ids", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /getPurchaseRequirementItemsSummary/);
  assert.doesNotMatch(pageSource, /\{ title: "需求单", dataIndex: "id" \}/);
});

test("inventory page formats order purchase and allocation statuses as business labels", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /getOrderStatusLabel/);
  assert.match(pageSource, /getInventoryAllocationStatusLabel/);
  assert.match(pageSource, /getPurchaseRequirementStatusLabel/);
  assert.match(pageSource, /getPurchaseOrderStatusLabel/);
  assert.doesNotMatch(pageSource, /\{ title: "状态", dataIndex: "status" \}/);
});
