import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const purchasesPageSource = readFileSync("app/purchases/page.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");

test("purchases overview exposes purchase demand order receiving and supplier workspaces", () => {
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
  assert.doesNotMatch(purchasesPageSource, /purchases-overview-shortcuts/);
  assert.doesNotMatch(purchasesPageSource, /title="采购工作区"/);
  assert.match(cssSource, /\.purchases-overview-shell/);
});

test("purchases child routes exist under the purchases boundary", () => {
  assert.equal(existsSync("app/purchases/requirements/page.tsx"), true);
  assert.equal(existsSync("app/purchases/orders/page.tsx"), true);
  assert.equal(existsSync("app/purchases/orders/[id]/page.tsx"), true);
  assert.equal(existsSync("app/purchases/inbound/page.tsx"), true);
  assert.equal(existsSync("app/purchases/suppliers/page.tsx"), true);
});

test("purchases module navigation keeps inbound acceptance inside purchase orders", () => {
  const navSource = readFileSync("src/features/purchases/purchase-module-nav.tsx", "utf8");
  const inboundSource = readFileSync("app/purchases/inbound/page.tsx", "utf8");

  assert.doesNotMatch(navSource, /href: "\/purchases\/inbound"/);
  assert.match(navSource, /pathname\.startsWith\("\/purchases\/inbound"\)\) return "orders"/);
  assert.match(inboundSource, /redirect\("\/purchases\/orders"\)/);
  assert.doesNotMatch(purchasesPageSource, /href="\/purchases\/inbound"/);
});

test("purchases order list and detail use purchaseApi instead of inventoryApi", () => {
  const ordersSource = readFileSync("app/purchases/orders/page.tsx", "utf8");
  const detailSource = readFileSync("app/purchases/orders/[id]/page.tsx", "utf8");

  assert.match(ordersSource, /purchaseApi\.orders/);
  assert.match(ordersSource, /<Alert[\s\S]*title="只读模式"/);
  assert.doesNotMatch(ordersSource, /<Alert[\s\S]*message=/);
  assert.match(ordersSource, /router\.push\(`\/purchases\/orders\/\$\{row\.id\}`\)/);
  assert.doesNotMatch(ordersSource, /inventoryApi\./);
  assert.match(detailSource, /purchaseApi\.order\(purchaseOrderId\)/);
  assert.match(detailSource, /purchaseApi\.receiveOrderItemBatches/);
  assert.match(detailSource, /router\.push\("\/purchases\/orders"\)/);
  assert.doesNotMatch(detailSource, /inventoryApi\./);
});

test("purchases order receiving form uses selectable supplier options", () => {
  const detailSource = readFileSync("app/purchases/orders/[id]/page.tsx", "utf8");

  assert.match(detailSource, /purchaseApi\.suppliers/);
  assert.match(detailSource, /const supplierOptions = /);
  assert.match(detailSource, /showSearch/);
  assert.match(detailSource, /optionFilterProp="label"/);
  assert.doesNotMatch(detailSource, /name=\{\[field\.name, "supplierName"\]\}[\s\S]*?<Input placeholder=\{purchaseOrder\.supplierName \?\? "供应商"\}/);
  assert.doesNotMatch(detailSource, /<Form\.Item name="supplierName" label="默认供应商">\s*<Input placeholder="未填批次供应商时使用该供应商" \/>/);
});

test("purchases requirements page focuses on manual demand creation", () => {
  const requirementsSource = readFileSync("app/purchases/requirements/page.tsx", "utf8");

  assert.match(requirementsSource, /purchaseApi\.createRequirement/);
  assert.match(requirementsSource, /新建采购需求/);
  assert.match(requirementsSource, /选择采购产品/);
  assert.match(requirementsSource, /requiredQuantity/);
  assert.match(requirementsSource, /requiredUnit/);
  assert.match(requirementsSource, /purchases-requirement-create-actions/);
  assert.doesNotMatch(requirementsSource, /purchaseApi\.requirements/);
  assert.doesNotMatch(requirementsSource, /purchaseApi\.suppliers/);
  assert.doesNotMatch(requirementsSource, /采购需求列表/);
  assert.doesNotMatch(requirementsSource, /PurchaseRequirementOrderAction/);
  assert.doesNotMatch(requirementsSource, /createPurchaseOrderFromRequirement/);
});

test("purchases requirements page avoids deprecated Alert message prop", () => {
  const requirementsSource = readFileSync("app/purchases/requirements/page.tsx", "utf8");

  assert.match(requirementsSource, /<Alert[\s\S]*title="只读模式"/);
  assert.doesNotMatch(requirementsSource, /<Alert[\s\S]*message=/);
});

test("purchases requirements page uses a focused form layout", () => {
  const requirementsSource = readFileSync("app/purchases/requirements/page.tsx", "utf8");

  assert.match(requirementsSource, /purchases-requirement-create-card/);
  assert.match(cssSource, /\.purchases-requirement-create-card\.ant-card/);
  assert.match(cssSource, /\.purchases-requirement-create-form/);
  assert.match(cssSource, /\.purchases-requirement-create-actions/);
  assert.doesNotMatch(requirementsSource, /purchase-requirement-list/);
  assert.doesNotMatch(requirementsSource, /purchase-requirement-card/);
  assert.doesNotMatch(requirementsSource, /purchase-requirement-action-panel/);
  assert.doesNotMatch(requirementsSource, /<Table<PurchaseRequirementRow>/);
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
