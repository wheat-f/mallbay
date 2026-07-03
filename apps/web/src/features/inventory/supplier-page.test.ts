import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("purchases supplier page keeps supplier maintenance actions in their proper places", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(pageSource, /supplier-create-drawer/);
  assert.match(pageSource, /open=\{createOpen\}/);
  assert.match(pageSource, /setCreateOpen\(true\)/);
  assert.doesNotMatch(pageSource, /className="supplier-create-form"/);
  assert.match(pageSource, /批次历史/);
  assert.match(pageSource, /审计日志/);
  assert.doesNotMatch(pageSource, /createSupplierContact/);
  assert.doesNotMatch(pageSource, /createSupplierRatingHistory/);
  assert.doesNotMatch(pageSource, /新增联系人/);
  assert.doesNotMatch(pageSource, /追加评级/);
});

test("purchases supplier operation menu opens the selected supplier details", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(pageSource, /handleSupplierAction/);
  assert.match(pageSource, /setActiveDetailTab\("basic"\)/);
  assert.match(pageSource, /aria-label="编辑供应商"/);
  assert.match(pageSource, /event\.stopPropagation\(\)/);
  assert.match(pageSource, /activeKey=\{activeDetailTab\}/);
});

test("purchases supplier batch history does not expose contact editing controls", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(pageSource, /label: "批次历史"/);
  assert.match(pageSource, /采购单/);
  assert.match(pageSource, /入库批次/);
  assert.match(pageSource, /最近采购/);
  assert.match(pageSource, /最近入库/);
  assert.doesNotMatch(pageSource, /contactForm/);
  assert.doesNotMatch(pageSource, /placeholder="联系人"/);
  assert.doesNotMatch(pageSource, /placeholder="角色"/);
});

test("purchases supplier audit log does not expose rating editing controls", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(pageSource, /label: "审计日志"/);
  assert.match(pageSource, /supplier-audit-timeline/);
  assert.match(pageSource, /暂无审计日志/);
  assert.doesNotMatch(pageSource, /ratingForm/);
  assert.doesNotMatch(pageSource, /placeholder="评级说明"/);
  assert.doesNotMatch(pageSource, /placeholder="评分"/);
});

test("purchases supplier page edits supplier settlement cycle as persisted data", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");
  const apiSource = readFileSync("src/features/inventory/api.ts", "utf8");

  assert.match(apiSource, /settlementCycle\?: string/);
  assert.match(pageSource, /settlementCycle: supplier\.settlementCycle \?\? undefined/);
  assert.match(pageSource, /settlementCycle: updated\.settlementCycle \?\? undefined/);
  assert.match(pageSource, /name="settlementCycle" label="结算周期"/);
  assert.match(pageSource, /selectedSupplier\.settlementCycle \?\? "-"/);
  assert.doesNotMatch(pageSource, /月结（Net 30）/);
});

test("purchases supplier page protects desktop table columns beside the detail panel", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /scroll=\{\{ x: 940 \}\}/);
  assert.match(pageSource, /title: "联系人"[\s\S]*width: 120/);
  assert.match(pageSource, /title: "联系电话"[\s\S]*width: 140/);
  assert.match(cssSource, /\.supplier-main-stack\s*\{[\s\S]*min-width: 0;/);
  assert.match(cssSource, /\.supplier-table-card\.ant-card[\s\S]*min-width: 0;/);
  assert.match(cssSource, /\.supplier-desktop-table \.ant-table-cell\s*\{[\s\S]*white-space: nowrap;/);
});

test("purchases supplier page switches supplier rows to cards on tablet widths", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /supplier-mobile-cards/);
  assert.match(pageSource, /supplier-mobile-card/);
  assert.match(pageSource, /supplier-desktop-table/);
  assert.match(cssSource, /\.supplier-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{\r?\n\s{2}\.supplier-desktop-table \{\r?\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.supplier-mobile-cards \{\r?\n\s{4}display: grid;/);
});

test("purchases supplier page does not expose technical supplier ids in row subtitles", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(pageSource, /<small>主营：\{getSupplierCategory\(supplier\)\}<\/small>/);
  assert.match(pageSource, /<small>主营：\{getSupplierCategory\(row\)\}<\/small>/);
  assert.doesNotMatch(pageSource, /<small>ID: \{supplier\.id \?\? "历史快照"\}<\/small>/);
  assert.doesNotMatch(pageSource, /<small>ID: \{row\.id \?\? "历史快照"\}<\/small>/);
  assert.doesNotMatch(pageSource, /ID: \{/);
});

test("purchases supplier page uses prototype paused supplier status wording", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(pageSource, /type SupplierStatusFilter = "ALL" \| "ACTIVE" \| "INACTIVE" \| "PENDING"/);
  assert.match(pageSource, /label: "已暂停"/);
  assert.match(pageSource, /label: "审核中"/);
  assert.match(pageSource, /\? "已暂停" : "合作中"/);
  assert.match(pageSource, /unCheckedChildren="暂停"/);
  assert.doesNotMatch(pageSource, /已停用/);
});

test("purchases supplier page keeps the detail panel aligned with the visible paused filter", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(pageSource, /getVisibleSupplierId/);
  assert.match(pageSource, /filteredSuppliers\.some\(\(supplier\) => supplier\.id === selectedSupplierId\)/);
  assert.match(pageSource, /setSelectedSupplierId\(updated\.id\)/);
  assert.match(pageSource, /isActive: updated\.isActive !== false/);
  assert.doesNotMatch(pageSource, /const activeSupplierId = selectedSupplierId \?\? filteredSuppliers\[0\]\?\.id/);
});

test("purchases supplier page keeps prototype supplier KPI vocabulary", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(pageSource, /活跃供应商/);
  assert.match(pageSource, /月度准时交付率/);
  assert.match(pageSource, /平均采购周期/);
  assert.match(pageSource, /purchaseApi\.orders\(storeId!\)/);
  assert.match(pageSource, /calculateSupplierMetrics/);
  assert.doesNotMatch(pageSource, /onTimeDeliveryRate: "98\.5%"/);
  assert.doesNotMatch(pageSource, /averagePurchaseCycle: "4\.2 天"/);
  assert.doesNotMatch(pageSource, /采购单总量/);
  assert.doesNotMatch(pageSource, /平均评分/);
});

test("purchases supplier page guards supplier mutations with business-safe copy", () => {
  const pageSource = readFileSync("app/purchases/suppliers/page.tsx", "utf8");

  assert.match(pageSource, /请先选择供应商/);
  assert.doesNotMatch(pageSource, /inventoryApi\.updateSupplier\(selectedSupplier!\.id!/);
  assert.doesNotMatch(pageSource, /selectedSupplier!\.id!/);
});
