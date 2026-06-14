import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const pageSource = readFileSync("app/products/page.tsx", "utf8");
const cssSource = readFileSync("app/globals.css", "utf8");

function cssBlock(selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = cssSource.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `Missing CSS block for ${selector}`);
  return match[1];
}

test("products page follows the prototype product catalog layout", () => {
  assert.match(pageSource, /StorePageHeader title="产品管理"/);
  assert.match(pageSource, /products-filter-card/);
  assert.match(pageSource, /products-filter-grid/);
  assert.match(pageSource, /快速搜索/);
  assert.match(pageSource, /产品类别/);
  assert.match(pageSource, /启用状态/);
  assert.match(pageSource, /库存单位/);
  assert.match(pageSource, /产品信息/);
  assert.match(pageSource, /规格与换算/);
  assert.match(pageSource, /质保年限/);
  assert.match(pageSource, /基础价/);
});

test("products page uses mobile catalog cards instead of squeezing the desktop table", () => {
  assert.match(pageSource, /products-mobile-cards/);
  assert.match(pageSource, /products-mobile-card/);
  assert.match(pageSource, /products-desktop-table/);
  assert.match(cssSource, /\.products-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.products-desktop-table/);
  assert.match(cssSource, /@media \(max-width: 720px\)[\s\S]*\.products-mobile-cards\s*\{[\s\S]*display: grid;/);
});

test("products mobile catalog cards can shrink within the management content column", () => {
  const cardBlock = cssBlock(".products-mobile-card");
  assert.match(cardBlock, /min-width:\s*0;/);
  assert.match(cardBlock, /width:\s*100%;/);
  assert.match(cardBlock, /max-width:\s*100%;/);
  assert.match(cssBlock(".products-mobile-card-head"), /min-width:\s*0;/);
  assert.match(cssBlock(".products-mobile-card-head .products-product-cell"), /min-width:\s*0;/);
});

test("products page wires catalog filters to the product list query", () => {
  assert.match(pageSource, /productApi\.list\(\{\s*storeId: storeId!,\s*page: 1,\s*pageSize: 100,\s*q: search/);
  assert.match(pageSource, /category: categoryFilter/);
  assert.match(pageSource, /status: statusFilter/);
  assert.match(pageSource, /const rows = useMemo\(/);
  assert.match(pageSource, /\[productsQuery\.data\]/);
});

test("products page uses a prototype right-side drawer for create and edit forms", () => {
  assert.match(pageSource, /Drawer/);
  assert.match(pageSource, /products-form-drawer/);
  assert.match(pageSource, /open=\{open\}/);
  assert.match(pageSource, /编辑产品/);
  assert.match(pageSource, /新建产品/);
  assert.doesNotMatch(pageSource, /<Modal/);
  assert.doesNotMatch(pageSource, /width=\{/);

  assert.match(cssSource, /products-form-drawer[\s\S]*ant-drawer-content-wrapper/);
});
