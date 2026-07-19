import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const exportPages = [
  ["app/after-sales/[id]/page.tsx", "exportAfterSaleReport"],
  ["app/warranties/page.tsx", "exportWarrantyRecords"],
  ["app/warranties/[id]/page.tsx", "downloadWarrantyCard"],
  ["app/finance/payment-records/[id]/page.tsx", "exportPaymentVoucher"],
  ["app/invoices/page.tsx", "exportInvoiceReport"],
  ["app/reports/page.tsx", "exportCurrentView"],
  ["app/inventory/movements/page.tsx", "exportMovementReport"],
  ["app/construction/capacities/page.tsx", "exportCapacityReport"],
  ["app/commissions/page.tsx", "exportCommissionReport"],
  ["app/commissions/settlements/page.tsx", "exportSettlementReport"]
] as const;

test("every previously placeholder export has a concrete workbook handler", () => {
  for (const [file, handler] of exportPages) {
    const source = readFileSync(file, "utf8");
    assert.match(source, new RegExp(`const ${handler} = async`), file);
    assert.match(source, new RegExp(`onClick=\\{\\(\\) => void ${handler}\\(\\)\\}`), file);
    assert.match(source, /exportRowsToExcel|exportWorkbookToExcel/, file);
  }
});

test("the shared Excel exporter applies the unified mallbay workbook template", () => {
  const source = readFileSync("src/lib/export-excel.ts", "utf8");

  assert.match(source, /import\("exceljs"\)/);
  assert.match(source, /state: "frozen"/);
  assert.match(source, /showGridLines: false/);
  assert.match(source, /worksheet\.autoFilter/);
  assert.match(source, /HEADER_FILL/);
  assert.match(source, /STRIPE_FILL/);
  assert.match(source, /column\.width/);
  assert.match(source, /cell\.numFmt/);
  assert.match(source, /workbook\.xlsx\.writeBuffer/);
});

test("report exports the selected business view and warranty exports include multiple worksheets", () => {
  const reportsSource = readFileSync("app/reports/page.tsx", "utf8");
  const warrantySource = readFileSync("app/warranties/[id]/page.tsx", "utf8");

  assert.match(reportsSource, /exportWorkbookToExcel\("经营分析报表\.xlsx"/);
  assert.match(reportsSource, /sheetName: currentView/);
  assert.match(warrantySource, /sheetName: "电子质保卡"/);
  assert.match(warrantySource, /sheetName: "质保日志"/);
});
