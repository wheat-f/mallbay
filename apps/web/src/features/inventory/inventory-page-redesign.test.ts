import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync("app/inventory/page.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");

test("inventory page follows the prototype fulfillment workspace layout", () => {
  assert.match(pageSource, /inventory-fulfillment-shell/);
  assert.match(pageSource, /inventory-fulfillment-board/);
  assert.match(pageSource, /inventory-prototype-card/);
  assert.match(pageSource, /inventory-tab-workspace-card/);
  assert.match(pageSource, /inventory-board-rail/);
  assert.match(pageSource, /inventory-board-center/);
  assert.match(pageSource, /inventory-rail-stack/);
  assert.match(pageSource, /inventory-main-stack/);
  assert.match(pageSource, /搜索订单、批次或客户/);
  assert.match(pageSource, /inventory-workspace-grid/);
  assert.match(pageSource, /待匹配订单/);
  assert.match(pageSource, /订单产品需求/);
  assert.match(pageSource, /可用库存匹配/);
  assert.match(pageSource, /出库操作/);
  assert.match(pageSource, /锁定库存并出库/);
  assert.match(pageSource, /生成采购需求单/);
  assert.doesNotMatch(pageSource, /inventory-fulfillment-toolbar/);
  assert.doesNotMatch(pageSource, /StorePageHeader/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
  assert.doesNotMatch(pageSource, /<Alert/);
  assert.doesNotMatch(pageSource, /operation-panel/);
  assert.match(cssSource, /\.inventory-prototype-card/);
  assert.match(cssSource, /\.inventory-tab-workspace-card/);
});

test("inventory page exposes prototype operation shortcuts without hiding existing tabs", () => {
  assert.match(pageSource, /inventory-inline-shortcuts/);
  assert.match(pageSource, /批次入库/);
  assert.match(pageSource, /采购入库/);
  assert.match(pageSource, /批次拆分/);
  assert.match(pageSource, /其他出入库/);
  assert.match(pageSource, /<Tabs/);
});

test("inventory pending order tab uses mobile cards instead of squeezing the desktop table", () => {
  assert.match(pageSource, /inventory-mobile-order-cards/);
  assert.match(pageSource, /inventory-mobile-order-card/);
  assert.match(pageSource, /inventory-desktop-table/);
  assert.match(cssSource, /\.inventory-mobile-order-cards/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.inventory-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.inventory-mobile-order-cards\s*\{[\s\S]*display: grid;/);
}
);

test("inventory nested panels use tokenized prototype surfaces", () => {
  assert.match(pageSource, /inventory-nested-panel/);
  assert.match(pageSource, /inventory-movement-filter/);
  assert.match(pageSource, /inventory-summary-tile/);
  assert.match(pageSource, /inventory-summary-value/);
  assert.doesNotMatch(pageSource, /border-gray-200|bg-white|text-gray-900/);
});

test("inventory supplier editor uses a prototype right-side drawer", () => {
  assert.match(pageSource, /\bDrawer\b/);
  assert.match(pageSource, /rootClassName="inventory-supplier-drawer"/);
  assert.match(pageSource, /className="inventory-supplier-panel"/);
  assert.match(pageSource, /inventory-supplier-footer/);
  assert.match(cssSource, /\.inventory-supplier-drawer\s+\.ant-drawer-content-wrapper/);
  assert.match(cssSource, /width:\s*min\(520px,\s*calc\(100vw - 24px\)\)/);
  assert.doesNotMatch(pageSource, /<Modal\s/);
  assert.doesNotMatch(pageSource, /\bModal\b/);
  assert.doesNotMatch(pageSource, /width=\{520\}/);
});

test("inventory page links to the dedicated supplier archive workspace", () => {
  assert.match(pageSource, /href="\/inventory\/suppliers"/);
  assert.match(pageSource, /供应商档案/);
});

test("inventory page links to the dedicated adjustment workspace", () => {
  assert.match(pageSource, /href="\/inventory\/adjustments"/);
  assert.match(pageSource, /库存调整工作台/);
});

test("inventory page links to the dedicated movement ledger workspace", () => {
  assert.match(pageSource, /href="\/inventory\/movements"/);
  assert.match(pageSource, /库存流水/);
});

test("supplier archive page follows the prototype supplier management layout", () => {
  const suppliersPath = "app/inventory/suppliers/page.tsx";

  assert.equal(existsSync(suppliersPath), true);

  const suppliersSource = readFileSync(suppliersPath, "utf8");

  assert.match(suppliersSource, /inventoryApi\.suppliers/);
  assert.match(suppliersSource, /inventoryApi\.createSupplier/);
  assert.match(suppliersSource, /inventoryApi\.updateSupplier/);
  assert.match(suppliersSource, /inventoryApi\.createSupplierContact/);
  assert.match(suppliersSource, /inventoryApi\.createSupplierRatingHistory/);
  assert.match(suppliersSource, /supplier-archive-page/);
  assert.match(suppliersSource, /supplier-command-bar/);
  assert.match(suppliersSource, /supplier-table-card/);
  assert.match(suppliersSource, /supplier-detail-drawer/);
  assert.match(suppliersSource, /supplier-metric-grid/);
  assert.match(suppliersSource, /supplier-audit-timeline/);
  assert.match(suppliersSource, /新增供应商/);
  assert.match(suppliersSource, /导出列表/);
  assert.match(suppliersSource, /全部状态/);
  assert.match(suppliersSource, /所有分类/);
  assert.match(suppliersSource, /基本信息/);
  assert.match(suppliersSource, /批次历史/);
  assert.match(suppliersSource, /审计日志/);

  assert.match(cssSource, /\.supplier-archive-page/);
  assert.match(cssSource, /\.supplier-command-bar/);
  assert.match(cssSource, /\.supplier-table-card/);
  assert.match(cssSource, /\.supplier-detail-drawer/);
  assert.match(cssSource, /\.supplier-audit-timeline/);
});

test("supplier archive page uses mobile cards for supplier rows", () => {
  const suppliersSource = readFileSync("app/inventory/suppliers/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const baseHiddenIndex = cssSource.indexOf(".supplier-mobile-cards {\n  display: none");
  const desktopTableIndex = cssSource.indexOf(".supplier-desktop-table");
  const mobileDisplayIndex = cssSource.indexOf(".supplier-mobile-cards", desktopTableIndex);

  assert.match(suppliersSource, /supplier-mobile-cards/);
  assert.match(suppliersSource, /supplier-mobile-card/);
  assert.match(suppliersSource, /supplier-desktop-table/);
  assert.match(cssSource, /\.supplier-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.supplier-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.supplier-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.ok(desktopTableIndex > baseHiddenIndex, "mobile breakpoint must come after the base hidden rule");
  assert.ok(mobileDisplayIndex > baseHiddenIndex, "mobile display override must come after the base hidden rule");
});

test("inventory adjustment page follows the prototype stock adjustment layout", () => {
  const adjustmentPath = "app/inventory/adjustments/page.tsx";

  assert.equal(existsSync(adjustmentPath), true);

  const adjustmentSource = readFileSync(adjustmentPath, "utf8");

  assert.match(adjustmentSource, /inventoryApi\.batches/);
  assert.match(adjustmentSource, /inventoryApi\.convertBatch/);
  assert.match(adjustmentSource, /inventoryApi\.splitBatch/);
  assert.match(adjustmentSource, /inventoryApi\.createStockOperation/);
  assert.match(adjustmentSource, /库存调整操作/);
  assert.match(adjustmentSource, /单位转换与拆分/);
  assert.match(adjustmentSource, /库存盘点与报损/);
  assert.match(adjustmentSource, /调拨管理/);
  assert.match(adjustmentSource, /确认提交/);
  assert.match(adjustmentSource, /adjustment-workspace-page/);
  assert.match(adjustmentSource, /adjustment-conversion-panel/);
  assert.match(adjustmentSource, /adjustment-count-table/);
  assert.match(adjustmentSource, /adjustment-transfer-panel/);
  assert.match(adjustmentSource, /adjustment-unit-input/);
  assert.doesNotMatch(adjustmentSource, /addonAfter=/);

  assert.match(cssSource, /\.adjustment-workspace-page/);
  assert.match(cssSource, /\.adjustment-conversion-panel/);
  assert.match(cssSource, /\.adjustment-count-table/);
  assert.match(cssSource, /\.adjustment-transfer-panel/);
  assert.match(cssSource, /\.adjustment-unit-input/);
});

test("inventory adjustment page uses mobile cards for stock count rows", () => {
  const adjustmentSource = readFileSync("app/inventory/adjustments/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");
  const baseHiddenIndex = cssSource.indexOf(".adjustment-count-mobile-cards {\n  display: none");
  const desktopTableIndex = cssSource.indexOf(".adjustment-count-desktop-table");
  const mobileDisplayIndex = cssSource.indexOf(".adjustment-count-mobile-cards", desktopTableIndex);
  const adjustmentMobileCss = cssSource.slice(
    cssSource.lastIndexOf("@media (max-width: 720px)", desktopTableIndex),
    cssSource.indexOf(".movement-ledger-page")
  );

  assert.match(adjustmentSource, /adjustment-count-mobile-cards/);
  assert.match(adjustmentSource, /adjustment-count-mobile-card/);
  assert.match(adjustmentSource, /adjustment-count-desktop-table/);
  assert.match(cssSource, /\.adjustment-count-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.adjustment-count-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.adjustment-count-mobile-cards\s*\{[\s\S]*display: grid;/);
  assert.ok(desktopTableIndex > baseHiddenIndex, "mobile breakpoint must come after the base hidden rule");
  assert.ok(mobileDisplayIndex > baseHiddenIndex, "mobile display override must come after the base hidden rule");
  assert.match(adjustmentMobileCss, /\.adjustment-topbar\s*\{[\s\S]*flex-direction: column;/);
  assert.match(adjustmentMobileCss, /\.adjustment-canvas\s*\{[\s\S]*padding: 16px;/);
  assert.match(adjustmentMobileCss, /\.adjustment-metric-strip\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(adjustmentMobileCss, /\.adjustment-conversion-grid,\s*[\s\S]*\.adjustment-form,\s*[\s\S]*\.adjustment-stock-form\.ant-form,\s*[\s\S]*\.adjustment-transfer-form\s*\{[\s\S]*grid-template-columns: minmax\(0, 1fr\);/);
});

test("inventory movement ledger page follows the prototype movement workspace", () => {
  const movementsPath = "app/inventory/movements/page.tsx";

  assert.equal(existsSync(movementsPath), true);

  const movementsSource = readFileSync(movementsPath, "utf8");

  assert.match(movementsSource, /inventoryApi\.movements/);
  assert.match(movementsSource, /inventoryApi\.batches/);
  assert.match(movementsSource, /productApi\.list/);
  assert.match(movementsSource, /userApi\.searchUsers/);
  assert.match(movementsSource, /库存流水/);
  assert.match(movementsSource, /今日入库总量/);
  assert.match(movementsSource, /今日出库总量/);
  assert.match(movementsSource, /异常波动笔数/);
  assert.match(movementsSource, /产品名称 \/ 规格/);
  assert.match(movementsSource, /批次号/);
  assert.match(movementsSource, /关联单号/);
  assert.match(movementsSource, /操作人/);
  assert.match(movementsSource, /近期异常提醒/);
  assert.match(movementsSource, /批次追踪/);
  assert.match(movementsSource, /movement-ledger-page/);
  assert.match(movementsSource, /movement-kpi-grid/);
  assert.match(movementsSource, /movement-filter-panel/);
  assert.match(movementsSource, /movement-ledger-table/);
  assert.match(movementsSource, /movement-alert-panel/);
  assert.match(movementsSource, /movement-trace-panel/);

  assert.match(cssSource, /\.movement-ledger-page/);
  assert.match(cssSource, /\.movement-kpi-grid/);
  assert.match(cssSource, /\.movement-filter-panel/);
  assert.match(cssSource, /\.movement-ledger-table/);
  assert.match(cssSource, /\.movement-alert-panel/);
  assert.match(cssSource, /\.movement-trace-panel/);
  assert.match(cssSource, /\.movement-workspace-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(cssSource, /@media \(min-width:\s*1680px\)[\s\S]*\.movement-workspace-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(300px,\s*360px\);/);
});

test("inventory movement ledger page uses mobile cards for movement rows", () => {
  const movementsSource = readFileSync("app/inventory/movements/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(movementsSource, /movement-ledger-mobile-cards/);
  assert.match(movementsSource, /movement-ledger-mobile-card/);
  assert.match(movementsSource, /movement-ledger-desktop-table/);
  assert.match(cssSource, /\.movement-ledger-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.movement-ledger-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.movement-ledger-mobile-cards\s*\{[\s\S]*display: grid;/);
});
