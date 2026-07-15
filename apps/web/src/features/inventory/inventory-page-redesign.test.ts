import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync("app/inventory/page.tsx", "utf8");
const matchingPageSource = readFileSync("app/inventory/matching/page.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");

test("inventory page is an operations overview instead of an outbound matching homepage", () => {
  assert.match(pageSource, /inventory-overview-shell/);
  assert.match(pageSource, /库存运营总览/);
  assert.match(pageSource, /库存健康/);
  assert.match(pageSource, /待匹配订单/);
  assert.match(pageSource, /低库存与异常批次/);
  assert.match(pageSource, /锁库待出库/);
  assert.match(pageSource, /库存流水/);
  assert.match(pageSource, /只读模式/);
  assert.match(pageSource, /canManageInventory/);
  assert.doesNotMatch(pageSource, /锁定库存并出库/);
  assert.doesNotMatch(pageSource, /生成采购需求单/);
  assert.doesNotMatch(pageSource, /采购需求与审批/);
  assert.doesNotMatch(pageSource, /供应商档案/);
  assert.doesNotMatch(pageSource, /inventory-tab-workspace-card/);
  assert.match(cssSource, /\.inventory-prototype-card/);
  assert.match(cssSource, /\.inventory-overview-shell/);
});

test("inventory demand panel does not expose technical product ids", () => {
  assert.match(matchingPageSource, /订单产品需求/);
  assert.match(matchingPageSource, /INVENTORY_PRODUCT_MISSING_LABEL/);
  assert.doesNotMatch(matchingPageSource, /item\.product \? getProductDisplayName\(item\.product\) : item\.productId/);
});

test("inventory matching page has a clear return to the inventory overview", () => {
  assert.match(matchingPageSource, /href="\/inventory"/);
  assert.match(matchingPageSource, /aria-label="返回库存总览"/);
  assert.match(matchingPageSource, /返回库存总览/);
});

test("inventory matching page links only the shortage workflow into the purchase domain", () => {
  assert.match(matchingPageSource, /href="\/purchases\/requirements"/);
  assert.doesNotMatch(matchingPageSource, /href="\/purchases"/);
  assert.doesNotMatch(matchingPageSource, /href="\/purchases\/suppliers"/);
  assert.doesNotMatch(matchingPageSource, /href="\/inventory\/suppliers"/);
  assert.doesNotMatch(matchingPageSource, /href="\/inventory\/purchase-orders/);
});

test("inventory matching page disables write actions for read-only inventory users", () => {
  assert.match(matchingPageSource, /const canManageInventory =/);
  assert.match(matchingPageSource, /disabled=\{!canManageInventory \|\| !activeSelectedOrderId \|\| allocationRows\.length === 0\}/);
  assert.match(matchingPageSource, /disabled=\{!canManageInventory \|\| !hasPendingProducts \|\| isAllocating\}/);
  assert.match(matchingPageSource, /disabled=\{!canManageInventory \|\| !activeSelectedOrderId \|\| !hasPendingProducts \|\| shortageRows\.length === 0 \|\| isCreatingRequirement\}/);
});

test("inventory overview reports physical remaining stock before slicing preview rows", () => {
  assert.match(pageSource, /const attentionRows = useMemo/);
  assert.match(pageSource, /attentionRows\.length/);
  assert.match(pageSource, /const lowStockRows = attentionRows\.slice\(0, 5\)/);
  assert.match(pageSource, /lockedBatchRows\.length/);
  assert.match(pageSource, /const lockedRows = lockedBatchRows\.slice\(0, 5\)/);
  assert.match(pageSource, /formatBatchPhysicalStockLabel\(row\)/);
  assert.match(pageSource, /formatBatchStockLabel\(row\)/);
  assert.match(pageSource, /formatBatchLockedStockLabel\(row\)/);
  assert.match(pageSource, /实物剩余/);
  assert.doesNotMatch(pageSource, /if \(available <= 0\) return false/);
});

test("inventory matching page uses current Ant Design component props", () => {
  assert.doesNotMatch(matchingPageSource, /<Alert[\s\S]*message=/);
  assert.match(matchingPageSource, /<Alert[\s\S]*title="只读模式"/);
  assert.doesNotMatch(matchingPageSource, /<Space[\s\S]*direction=/);
});

test("inventory matching page no longer embeds the legacy inventory tabs workspace", () => {
  assert.doesNotMatch(matchingPageSource, /INVENTORY_TAB_NAV_ITEMS/);
  assert.doesNotMatch(matchingPageSource, /<Tabs/);
  assert.doesNotMatch(matchingPageSource, /inventory-tab-workspace-card/);
  assert.doesNotMatch(matchingPageSource, /inventoryTabsRef/);
  assert.doesNotMatch(matchingPageSource, /activeInventoryTab/);
  assert.doesNotMatch(matchingPageSource, /库存模块导航/);
});

test("inventory matching page focuses on the order matching workflow", () => {
  assert.match(matchingPageSource, /订单库存匹配/);
  assert.match(matchingPageSource, /订单产品需求/);
  assert.match(matchingPageSource, /当前订单匹配工作台/);
  assert.match(matchingPageSource, /选择批次并锁定库存/);
  assert.match(matchingPageSource, /已锁批次与出库/);
  assert.match(matchingPageSource, /相关工作区/);
  assert.match(matchingPageSource, /href="\/purchases\/requirements"/);
  assert.match(matchingPageSource, /href="\/inventory\/movements"/);
  assert.match(matchingPageSource, /href="\/inventory\/adjustments"/);
});

test("inventory matching page integrates lock and allocation results into the primary workspace", () => {
  assert.match(matchingPageSource, /inventory-current-order-workbench/);
  assert.match(matchingPageSource, /inventory-lock-and-allocation-grid/);
  assert.match(matchingPageSource, /选择批次并锁定库存/);
  assert.match(matchingPageSource, /当前订单锁库结果、出库进度和释放状态/);
  assert.doesNotMatch(matchingPageSource, /<Typography\.Title level=\{5\}>待匹配订单明细<\/Typography\.Title>/);
  assert.doesNotMatch(matchingPageSource, /inventory-desktop-table/);
});

test("inventory matching page separates order demand, lock, and result stages", () => {
  assert.match(matchingPageSource, /inventory-current-order-demand/);
  assert.match(matchingPageSource, /inventory-matching-workflow/);
  assert.match(matchingPageSource, /inventory-lock-panel/);
  assert.match(matchingPageSource, /inventory-allocation-panel/);
  assert.match(cssSource, /\.inventory-fulfillment-board\.inventory-workspace-grid/);
  assert.doesNotMatch(matchingPageSource, /inventory-demand-card/);
  assert.doesNotMatch(matchingPageSource, /inventory-board-rail/);
  assert.doesNotMatch(matchingPageSource, /title="待匹配订单"/);
  assert.doesNotMatch(
    cssSource,
    /\.inventory-lock-and-allocation-grid\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1\.08fr\)\s+minmax\(360px,\s*0\.92fr\)/
  );
});

test("inventory matching lock form presents each product as a guided allocation card", () => {
  assert.match(matchingPageSource, /inventory-allocation-editor-card/);
  assert.match(matchingPageSource, /待锁数量/);
  assert.match(matchingPageSource, /已出库/);
  assert.match(matchingPageSource, /可用批次/);
  assert.match(matchingPageSource, /showSearch/);
  assert.match(matchingPageSource, /optionFilterProp="label"/);
  assert.match(matchingPageSource, /锁定数量/);
  assert.match(matchingPageSource, /按建议数量锁定，锁定后可在下方查看出库进度。/);
  assert.doesNotMatch(matchingPageSource, /批次检索/);
  assert.doesNotMatch(matchingPageSource, /batchSearchByOrderItem/);
  assert.match(cssSource, /\.inventory-allocation-editor-card/);
  assert.match(cssSource, /\.inventory-allocation-editor-grid/);
  assert.match(cssSource, /\.inventory-allocation-editor-grid \.ant-form-item/);
  assert.match(cssSource, /\.inventory-allocation-editor-grid \.ant-input/);
  assert.doesNotMatch(cssSource, /\.inventory-allocation-editor-grid\s*\{[^}]*align-items:\s*end/);
  assert.doesNotMatch(matchingPageSource, /<Space className="w-full" align="baseline" wrap>/);
});

test("inventory matching page treats outbound products as completed instead of still pending", () => {
  assert.match(matchingPageSource, /type InventoryOrderMatchResponse = InventoryMatchInput &/);
  assert.match(matchingPageSource, /const orderMatch = orderMatchQuery\.data as InventoryOrderMatchResponse \| undefined/);
  assert.match(matchingPageSource, /pendingMatchRows\.find\(\(order\) => order\.id === activeSelectedOrderId\) \?\? orderMatch\?\.order/);
  assert.match(matchingPageSource, /const lockableRows = matchRows\.filter\(\(row\) => row\.pendingQuantity > 0\)/);
  assert.match(matchingPageSource, /const completedRows = matchRows\.filter/);
  assert.match(matchingPageSource, /已完成/);
  assert.match(matchingPageSource, /待处理产品/);
  assert.match(matchingPageSource, /已出库产品/);
  assert.match(matchingPageSource, /该订单库存流程已完成，无需继续锁库或出库。/);
  assert.match(matchingPageSource, /库存匹配、锁库和出库已完成。/);
  assert.match(matchingPageSource, /row\.pendingQuantity/);
  assert.match(matchingPageSource, /row\.outboundQuantity/);
  assert.match(matchingPageSource, /disabled=\{!canManageInventory \|\| !activeSelectedOrderId \|\| !hasPendingProducts\}/);
  assert.doesNotMatch(matchingPageSource, /待选产品/);
});

test("inventory matching page keeps only essential related workspace links", () => {
  assert.match(matchingPageSource, /href="\/purchases\/requirements"/);
  assert.match(matchingPageSource, /href="\/inventory\/movements"/);
  assert.match(matchingPageSource, /href="\/inventory\/adjustments"/);
  assert.doesNotMatch(matchingPageSource, /href="\/purchases"/);
  assert.doesNotMatch(matchingPageSource, /href="\/purchases\/suppliers"/);
  assert.doesNotMatch(matchingPageSource, /采购管理/);
  assert.doesNotMatch(matchingPageSource, /查看供应商档案/);
});

test("inventory matching page does not embed purchase supplier or adjustment management forms", () => {
  assert.doesNotMatch(matchingPageSource, /新增供应商/);
  assert.doesNotMatch(matchingPageSource, /新建采购申请/);
  assert.doesNotMatch(matchingPageSource, /审批通过/);
  assert.doesNotMatch(matchingPageSource, /取消采购单/);
  assert.doesNotMatch(matchingPageSource, /批量扫码入库/);
  assert.doesNotMatch(matchingPageSource, /新增联系人/);
  assert.doesNotMatch(matchingPageSource, /追加评级/);
  assert.doesNotMatch(matchingPageSource, /form=\{batchForm\}/);
  assert.doesNotMatch(matchingPageSource, /form=\{purchaseForm\}/);
  assert.doesNotMatch(matchingPageSource, /form=\{splitForm\}/);
  assert.doesNotMatch(matchingPageSource, /form=\{stockForm\}/);
  assert.doesNotMatch(matchingPageSource, /purchaseOrdersQuery/);
  assert.doesNotMatch(matchingPageSource, /movementFilterForm/);
});

test("inventory overview links only to inventory workspaces and purchases boundary", () => {
  assert.match(pageSource, /href="\/inventory\/matching"/);
  assert.match(pageSource, /href="\/inventory\/adjustments"/);
  assert.match(pageSource, /href="\/inventory\/warehouses"/);
  assert.match(pageSource, /href="\/inventory\/movements"/);
  assert.match(pageSource, /href="\/purchases"/);
  assert.doesNotMatch(pageSource, /href="\/inventory\/suppliers"/);
  assert.doesNotMatch(pageSource, /href="\/inventory\/purchase-orders"/);
});

test("inventory exposes a dedicated warehouse management workspace", () => {
  const warehousePath = "app/inventory/warehouses/page.tsx";

  assert.equal(existsSync(warehousePath), true);

  const warehouseSource = readFileSync(warehousePath, "utf8");

  assert.match(warehouseSource, /仓库管理/);
  assert.match(warehouseSource, /inventoryApi\.warehouses/);
  assert.match(warehouseSource, /inventoryApi\.createWarehouse/);
  assert.match(warehouseSource, /inventoryApi\.updateWarehouse/);
  assert.match(warehouseSource, /warehouse-workspace-page/);
  assert.match(warehouseSource, /name="name"/);
  assert.match(warehouseSource, /name="code"/);
  assert.match(warehouseSource, /name="area"/);
  assert.match(warehouseSource, /isActive/);
  assert.match(cssSource, /\.warehouse-workspace-page/);
});

test("inventory overview pending order queue has mobile cards instead of squeezing the desktop table", () => {
  const desktopBreakpointIndex = cssSource.indexOf(".inventory-overview-order-table");
  const mobileCardsDisplayIndex = cssSource.indexOf(".inventory-overview-order-cards", desktopBreakpointIndex);
  const mediaStartIndex = cssSource.lastIndexOf("@media", desktopBreakpointIndex);
  const mediaHeader = cssSource.slice(mediaStartIndex, cssSource.indexOf("{", mediaStartIndex) + 1);

  assert.match(pageSource, /inventory-overview-order-cards/);
  assert.match(pageSource, /inventory-overview-order-card/);
  assert.match(pageSource, /inventory-overview-order-table/);
  assert.match(cssSource, /\.inventory-overview-order-cards/);
  assert.equal(mediaHeader, "@media (max-width: 900px) {");
  assert.ok(mobileCardsDisplayIndex > desktopBreakpointIndex, "mobile order cards display override must share the table breakpoint");
  assert.match(cssSource.slice(mediaStartIndex, mobileCardsDisplayIndex + 180), /\.inventory-overview-order-cards\s*\{[\s\S]*display: grid;/);
}
);

test("inventory overview pending order queue uses row-level matching actions", () => {
  assert.match(pageSource, /inventory-overview-row-action/);
  assert.match(pageSource, /href=\{`\/inventory\/matching\?orderId=\$\{row\.id\}`\}/);
  assert.match(pageSource, /title: "操作"/);
  assert.match(cssSource, /\.inventory-overview-row-action/);
  assert.doesNotMatch(pageSource, /extra=\{<Link href="\/inventory\/matching">进入匹配<\/Link>\}/);
  assert.doesNotMatch(pageSource, /请先选择待匹配订单/);
  assert.match(matchingPageSource, /useSearchParams/);
  assert.match(matchingPageSource, /queryOrderId/);
});

test("inventory matching page wraps search params usage in Suspense for production prerender", () => {
  assert.match(matchingPageSource, /import \{ Suspense, useMemo \} from "react"/);
  assert.match(matchingPageSource, /<Suspense fallback=/);
  assert.match(matchingPageSource, /function InventoryMatchingContent\(\)/);
  assert.match(matchingPageSource, /useSearchParams\(\)/);
  assert.ok(
    matchingPageSource.indexOf("<Suspense fallback=") < matchingPageSource.indexOf("useSearchParams()"),
    "useSearchParams must stay below the Suspense boundary"
  );
});

test("inventory page formats order dates with business-safe fallbacks", () => {
  assert.match(pageSource, /function formatInventoryOrderDate/);
  assert.match(pageSource, /预约日期待确认/);
  assert.match(pageSource, /formatInventoryOrderDate\(row\.appointmentDate\)/);
  assert.doesNotMatch(pageSource, /row\.appointmentDate\?\.slice\(0, 10\)/);
});

test("inventory nested panels use tokenized prototype surfaces", () => {
  assert.match(pageSource, /inventory-overview-main/);
  assert.match(pageSource, /inventory-overview-aside/);
  assert.match(pageSource, /inventory-summary-tile/);
  assert.match(pageSource, /inventory-summary-value/);
  assert.doesNotMatch(pageSource, /border-gray-200|bg-white|text-gray-900/);
});

test("inventory selected order operations guard selection with business-safe copy", () => {
  assert.match(matchingPageSource, /请先选择待匹配订单/);
  assert.doesNotMatch(pageSource, /orderMatch\(activeSelectedOrderId!\)/);
  assert.doesNotMatch(pageSource, /outboundOrder\(activeSelectedOrderId!\)/);
  assert.doesNotMatch(pageSource, /releaseOrder\(activeSelectedOrderId!\)/);
  assert.doesNotMatch(pageSource, /createOrderAllocations\(activeSelectedOrderId!/);
});

test("inventory page links to the dedicated adjustment workspace", () => {
  assert.match(pageSource, /href="\/inventory\/adjustments"/);
  assert.match(pageSource, /库存调整工作台/);
});

test("inventory page links to the dedicated movement ledger workspace", () => {
  assert.match(pageSource, /href="\/inventory\/movements"/);
  assert.match(pageSource, /库存流水/);
});

test("legacy inventory purchase order route redirects to purchases orders", () => {
  const purchaseOrdersPath = "app/inventory/purchase-orders/page.tsx";

  assert.equal(existsSync(purchaseOrdersPath), true);

  const purchaseOrdersSource = readFileSync(purchaseOrdersPath, "utf8");

  assert.match(purchaseOrdersSource, /redirect\("\/purchases\/orders"\)/);
});

test("legacy inventory supplier route redirects to purchases suppliers", () => {
  const suppliersPath = "app/inventory/suppliers/page.tsx";

  assert.equal(existsSync(suppliersPath), true);

  const suppliersSource = readFileSync(suppliersPath, "utf8");

  assert.match(suppliersSource, /redirect\("\/purchases\/suppliers"\)/);
});

test("inventory adjustment page follows the prototype stock adjustment layout", () => {
  const adjustmentPath = "app/inventory/adjustments/page.tsx";

  assert.equal(existsSync(adjustmentPath), true);

  const adjustmentSource = readFileSync(adjustmentPath, "utf8");

  assert.match(adjustmentSource, /inventoryApi\.batches/);
  assert.match(adjustmentSource, /inventoryApi\.convertBatch/);
  assert.match(adjustmentSource, /inventoryApi\.splitBatch/);
  assert.match(adjustmentSource, /inventoryApi\.createStockOperation/);
  assert.match(adjustmentSource, /const canManageInventory =/);
  assert.match(adjustmentSource, /库存调整操作/);
  assert.match(adjustmentSource, /库存管理 \/ 单位转换与调整/);
  assert.doesNotMatch(adjustmentSource, /库存管理 \/ 库存调整与单位转换/);
  assert.match(adjustmentSource, /aria-label="返回库存总览"/);
  assert.match(adjustmentSource, /返回库存总览/);
  assert.doesNotMatch(adjustmentSource, /aria-label="返回库存首页"/);
  assert.doesNotMatch(adjustmentSource, /aria-label="返回库存管理"/);
  assert.doesNotMatch(adjustmentSource, /取消操作/);
  assert.match(adjustmentSource, /单位转换与拆分/);
  assert.match(adjustmentSource, /库存盘点与报损/);
  assert.match(adjustmentSource, /调拨管理/);
  assert.match(adjustmentSource, /确认提交/);
  assert.match(adjustmentSource, /disabled=\{!canManageInventory\}/);
  assert.match(adjustmentSource, /adjustment-workspace-page/);
  assert.match(adjustmentSource, /management-page adjustment-workspace-page/);
  assert.match(adjustmentSource, /adjustment-conversion-panel/);
  assert.match(adjustmentSource, /adjustment-count-table/);
  assert.match(adjustmentSource, /adjustment-transfer-panel/);
  assert.match(adjustmentSource, /adjustment-unit-input/);
  assert.match(adjustmentSource, /step=\{0\.001\}/);
  assert.match(adjustmentSource, /precision=\{3\}/);
  assert.match(adjustmentSource, /支持零散米数/);
  assert.doesNotMatch(adjustmentSource, /addonAfter=/);

  assert.match(cssSource, /\.adjustment-workspace-page/);
  assert.match(cssSource, /\.adjustment-conversion-panel/);
  assert.match(cssSource, /\.adjustment-count-table/);
  assert.match(cssSource, /\.adjustment-transfer-panel/);
  assert.match(cssSource, /\.adjustment-unit-input/);
});

test("inventory adjustment page uses mobile cards for stock count rows", () => {
  const adjustmentSource = readFileSync("app/inventory/adjustments/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8").replace(/\r\n/g, "\n");
  const baseHiddenIndex = cssSource.indexOf(".adjustment-count-mobile-cards {\n  display: none");
  const desktopTableIndex = cssSource.indexOf(".adjustment-count-desktop-table");
  const mobileDisplayIndex = cssSource.indexOf(".adjustment-count-mobile-cards", desktopTableIndex);
  const adjustmentMobileCss = cssSource.slice(
    cssSource.lastIndexOf("@media (max-width: 900px)", desktopTableIndex),
    cssSource.indexOf(".movement-ledger-page")
  );

  assert.match(adjustmentSource, /adjustment-count-mobile-cards/);
  assert.match(adjustmentSource, /adjustment-count-mobile-card/);
  assert.match(adjustmentSource, /adjustment-count-desktop-table/);
  assert.match(cssSource, /\.adjustment-count-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{\n\s{2}\.adjustment-topbar \{/);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*\.adjustment-count-desktop-table\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\)[\s\S]*\.adjustment-count-mobile-cards\s*\{[\s\S]*display: grid;/);
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
  assert.match(movementsSource, /movement-ledger-breadcrumb/);
  assert.match(movementsSource, /href="\/inventory"[^>]*aria-label="返回库存总览"/);
  assert.match(movementsSource, /返回库存总览/);
  assert.match(movementsSource, /<Link href="\/inventory">库存管理<\/Link>/);
  assert.match(movementsSource, /<span>库存流水<\/span>/);
  assert.doesNotMatch(movementsSource, /新增入库/);
  assert.doesNotMatch(movementsSource, /router\.push\("\/inventory"\)/);
  assert.match(movementsSource, /库存流水/);
  assert.match(movementsSource, /今日入库总量/);
  assert.match(movementsSource, /今日出库总量/);
  assert.match(movementsSource, /异常波动笔数/);
  assert.match(movementsSource, /Form\.Item label="门店"/);
  assert.match(movementsSource, /当前门店/);
  assert.match(movementsSource, /disabled value=\{currentStoreName\}/);
  assert.match(movementsSource, /产品名称 \/ 规格/);
  assert.match(movementsSource, /createdFrom/);
  assert.match(movementsSource, /createdTo/);
  assert.match(movementsSource, /formatMovementDateRange\(dateRange\)/);
  assert.match(movementsSource, /批次号/);
  assert.match(movementsSource, /关联单号/);
  assert.match(movementsSource, /操作人/);
  assert.match(movementsSource, /placeholder="全部操作人"/);
  assert.doesNotMatch(movementsSource, /placeholder="搜索操作人"/);
  assert.match(movementsSource, /近期异常提醒/);
  assert.match(movementsSource, /批次追踪/);
  assert.match(movementsSource, /movement-ledger-page/);
  assert.match(movementsSource, /management-page movement-ledger-page/);
  assert.match(movementsSource, /movement-kpi-grid/);
  assert.match(movementsSource, /movement-filter-panel/);
  assert.match(movementsSource, /movement-ledger-table/);
  assert.match(movementsSource, /movement-alert-panel/);
  assert.match(movementsSource, /movement-trace-panel/);

  assert.match(cssSource, /\.movement-ledger-page/);
  assert.match(cssSource, /\.movement-ledger-breadcrumb/);
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
  const cssSource = readFileSync("app/globals.css", "utf8").replace(/\r\n/g, "\n");

  assert.match(movementsSource, /movement-ledger-mobile-cards/);
  assert.match(movementsSource, /movement-ledger-mobile-card/);
  assert.match(movementsSource, /movement-ledger-desktop-table/);
  assert.match(cssSource, /\.movement-ledger-mobile-cards\s*\{[\s\S]*display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{\n\s{2}\.movement-ledger-desktop-table \{\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.movement-ledger-mobile-cards \{\n\s{4}display: grid;/);
});
