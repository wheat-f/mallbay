import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("报价产品明细从服务端全量逐行导出并沿用统一模板", () => {
  const api = readFileSync("src/features/sales-quotes/api.ts", "utf8");
  const page = readFileSync("app/orders/quotes/page.tsx", "utf8");

  assert.match(api, /SalesQuoteExportDetail/);
  assert.match(api, /exportDetails: \(storeId: string, exportDimension/);
  assert.match(api, /\/sales-quotes\/export-details/);
  assert.match(page, /salesQuoteApi\.exportDetails/);
  assert.match(page, /服务端全量、逐产品行导出；金额单位：元/);
  assert.match(page, /exportRowsToExcel/);
});
