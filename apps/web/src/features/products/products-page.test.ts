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
  assert.match(pageSource, /StorePageHeader title="产品档案管理"/);
  assert.match(pageSource, /管理并维护车膜产品的核心参数、规格及换算规则/);
  assert.match(pageSource, /批量导入/);
  assert.match(pageSource, /新增产品档案/);
  assert.match(pageSource, /总档案数/);
  assert.match(pageSource, /分类数量/);
  assert.match(pageSource, /库存预警/);
  assert.match(pageSource, /本月新增/);
  assert.doesNotMatch(pageSource, /启用产品/);
  assert.doesNotMatch(pageSource, /质保产品/);
  assert.match(pageSource, /products-filter-card/);
  assert.match(pageSource, /products-filter-grid/);
  assert.match(pageSource, /快速搜索/);
  assert.match(pageSource, /产品类别/);
  assert.match(pageSource, /启用状态/);
  assert.match(pageSource, /库存单位/);
  assert.match(pageSource, /产品信息/);
  assert.match(pageSource, /规格与换算/);
  assert.match(pageSource, /质保年限/);
  assert.match(pageSource, /产品建议价/);
});

test("products page avoids implementation-phase import copy", () => {
  assert.match(pageSource, /parseProductWorkbook/);
  assert.match(pageSource, /executeProductImport/);
  assert.match(pageSource, /type="file"/);
  assert.match(pageSource, /accept="\.xlsx,\.xls"/);
  assert.match(pageSource, /批量导入产品/);
  assert.match(pageSource, /校验通过/);
  assert.match(pageSource, /需修正的数据/);
  assert.match(pageSource, /重试失败项/);
  assert.doesNotMatch(pageSource, /批量导入将在产品模板校验完成后接入/);
  assert.doesNotMatch(pageSource, /请按产品模板整理品牌、型号、价格和单位换算后再导入/);
});

test("products page uses mobile catalog cards instead of squeezing the desktop table", () => {
  assert.match(pageSource, /products-mobile-cards/);
  assert.match(pageSource, /products-mobile-card/);
  assert.match(pageSource, /products-desktop-table/);
  assert.match(cssSource, /\.products-mobile-cards/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{\r?\n\s{2}\.products-desktop-table \{\r?\n\s{4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 900px\) \{[\s\S]*\.products-mobile-cards \{\r?\n\s{4}display: grid;/);
});

test("products mobile catalog cards can shrink within the management content column", () => {
  const cardBlock = cssBlock(".products-mobile-card");
  assert.match(cardBlock, /min-width:\s*0;/);
  assert.match(cardBlock, /width:\s*100%;/);
  assert.match(cardBlock, /max-width:\s*100%;/);
  assert.match(cssBlock(".products-mobile-card-head"), /min-width:\s*0;/);
  assert.match(cssBlock(".products-mobile-card-head .products-product-cell"), /min-width:\s*0;/);
});

test("products page uses business-safe product display labels", () => {
  assert.match(pageSource, /getProductDisplayName/);
  assert.doesNotMatch(pageSource, /row\.brand\} \/ \{row\.name/);
  assert.doesNotMatch(pageSource, /型号：\{row\.model\}/);
});

test("products page wires catalog filters to the product list query", () => {
  assert.match(pageSource, /productApi\.list\(\{\s*storeId: storeId!,\s*page: 1,\s*pageSize: 100,\s*q: search/);
  assert.match(pageSource, /category: categoryFilter/);
  assert.match(pageSource, /status: statusFilter/);
  assert.match(pageSource, /const rows = useMemo\(/);
  assert.match(pageSource, /\[productsQuery\.data\]/);
});

test("products page guards product saving when no store is selected", () => {
  assert.match(pageSource, /if \(!storeId\) throw new Error\("当前账号未加入门店"\);/);
  assert.doesNotMatch(pageSource, /toProductPayload\(storeId!, values\)/);
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
