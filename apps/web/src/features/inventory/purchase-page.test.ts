import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("purchase order table exposes expected arrival reminders in the purchase domain", () => {
  const purchaseOrdersSource = readFileSync("app/purchases/orders/page.tsx", "utf8");

  assert.match(purchaseOrdersSource, /getPurchaseOrderArrivalReminder/);
  assert.match(purchaseOrdersSource, /预计到货/);
  assert.match(purchaseOrdersSource, /到货验收/);
});

test("purchase requirement list uses source order business labels in the purchase domain", () => {
  const requirementsSource = readFileSync("app/purchases/requirements/page.tsx", "utf8");

  assert.match(requirementsSource, /getPurchaseRequirementSourceOrderLabel/);
  assert.doesNotMatch(requirementsSource, /dataIndex: "sourceOrderId"/);
});

test("purchase requirement list shows product demand instead of requirement ids", () => {
  const requirementsSource = readFileSync("app/purchases/requirements/page.tsx", "utf8");

  assert.match(requirementsSource, /getPurchaseRequirementItemsSummary/);
  assert.doesNotMatch(requirementsSource, /\{ title: "需求单", dataIndex: "id" \}/);
});

test("inventory matching and purchase pages format their own statuses as business labels", () => {
  const matchingSource = readFileSync("app/inventory/matching/page.tsx", "utf8");
  const purchaseOrdersSource = readFileSync("app/purchases/orders/page.tsx", "utf8");
  const requirementsSource = readFileSync("app/purchases/requirements/page.tsx", "utf8");

  assert.match(matchingSource, /getInventoryAllocationStatusLabel/);
  assert.match(requirementsSource, /getPurchaseRequirementStatusLabel/);
  assert.match(purchaseOrdersSource, /getPurchaseOrderStatusLabel/);
  assert.doesNotMatch(matchingSource, /getPurchaseOrderStatusLabel/);
  assert.doesNotMatch(matchingSource, /\{ title: "状态", dataIndex: "status" \}/);
});

test("inventory matching page only links into purchase workspaces instead of embedding them", () => {
  const matchingSource = readFileSync("app/inventory/matching/page.tsx", "utf8");

  assert.match(matchingSource, /href="\/purchases\/requirements"/);
  assert.doesNotMatch(matchingSource, /href="\/purchases"/);
  assert.doesNotMatch(matchingSource, /href="\/purchases\/suppliers"/);
  assert.doesNotMatch(matchingSource, /purchaseOrdersQuery/);
  assert.doesNotMatch(matchingSource, /approvePurchaseOrder/);
  assert.doesNotMatch(matchingSource, /cancelPurchaseOrder/);
  assert.doesNotMatch(matchingSource, /receivePurchaseItem/);
});
