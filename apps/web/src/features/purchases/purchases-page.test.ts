import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const purchasesPageSource = readFileSync("app/purchases/page.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");

test("purchases overview exposes purchase demand order inbound and supplier workspaces", () => {
  assert.match(purchasesPageSource, /purchaseApi\.overview/);
  assert.match(purchasesPageSource, /采购管理总览/);
  assert.match(purchasesPageSource, /采购需求/);
  assert.match(purchasesPageSource, /采购订单/);
  assert.match(purchasesPageSource, /到货验收/);
  assert.match(purchasesPageSource, /供应商档案/);
  assert.match(purchasesPageSource, /只读模式/);
  assert.match(purchasesPageSource, /canManagePurchase/);
  assert.match(purchasesPageSource, /href="\/purchases\/requirements"/);
  assert.match(purchasesPageSource, /href="\/purchases\/orders"/);
  assert.match(purchasesPageSource, /href="\/purchases\/suppliers"/);
  assert.match(cssSource, /\.purchases-overview-shell/);
});

test("purchases child routes exist under the purchases boundary", () => {
  assert.equal(existsSync("app/purchases/requirements/page.tsx"), true);
  assert.equal(existsSync("app/purchases/orders/page.tsx"), true);
  assert.equal(existsSync("app/purchases/orders/[id]/page.tsx"), true);
  assert.equal(existsSync("app/purchases/suppliers/page.tsx"), true);
});

test("purchases order list and detail use purchaseApi instead of inventoryApi", () => {
  const ordersSource = readFileSync("app/purchases/orders/page.tsx", "utf8");
  const detailSource = readFileSync("app/purchases/orders/[id]/page.tsx", "utf8");

  assert.match(ordersSource, /purchaseApi\.orders/);
  assert.match(ordersSource, /router\.push\(`\/purchases\/orders\/\$\{row\.id\}`\)/);
  assert.doesNotMatch(ordersSource, /inventoryApi\./);
  assert.match(detailSource, /purchaseApi\.orders/);
  assert.match(detailSource, /purchaseApi\.receiveOrderItemBatches/);
  assert.match(detailSource, /router\.push\("\/purchases\/orders"\)/);
  assert.doesNotMatch(detailSource, /inventoryApi\./);
});

test("purchases supplier page is read-only aware and uses purchaseApi", () => {
  const suppliersSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(suppliersSource, /purchaseApi\.suppliers/);
  assert.match(suppliersSource, /purchaseApi\.createSupplier/);
  assert.match(suppliersSource, /purchaseApi\.updateSupplier/);
  assert.match(suppliersSource, /canManagePurchase/);
  assert.match(suppliersSource, /只读模式/);
  assert.doesNotMatch(suppliersSource, /inventoryApi\./);
});
