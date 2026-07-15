import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseInboundFileRows, parseInboundScanLines } from "./inbound-scan";

test("parseInboundScanLines parses batch quantity and supplier from scanned lines", () => {
  const result = parseInboundScanLines("B001 1 3M\nB002,2,龙膜\nB003\t0.5");

  assert.deepEqual(result.batches, [
    { batchNo: "B001", quantity: 1, supplierName: "3M" },
    { batchNo: "B002", quantity: 2, supplierName: "龙膜" },
    { batchNo: "B003", quantity: 0.5 }
  ]);
  assert.deepEqual(result.errors, []);
});

test("parseInboundScanLines reports invalid scanned quantities without dropping valid lines", () => {
  const result = parseInboundScanLines("B001 1\nB002 -1\nB003 2");

  assert.deepEqual(result.batches, [
    { batchNo: "B001", quantity: 1 },
    { batchNo: "B003", quantity: 2 }
  ]);
  assert.deepEqual(result.errors, [
    { line: 2, message: "入库数量必须大于 0" }
  ]);
});

test("parseInboundScanLines treats one scanned batch number per line as one roll", () => {
  const result = parseInboundScanLines("B001\nB002\nB003");

  assert.deepEqual(result.batches, [
    { batchNo: "B001", quantity: 1 },
    { batchNo: "B002", quantity: 1 },
    { batchNo: "B003", quantity: 1 }
  ]);
  assert.deepEqual(result.errors, []);
});

test("parseInboundFileRows reads Chinese spreadsheet headers and defaults empty quantity", () => {
  const result = parseInboundFileRows([
    { 批次号: "B001", 数量: 2, 供应商: "3M" },
    { 批次号: "B002", 数量: "", 供应商: "" }
  ]);

  assert.deepEqual(result.batches, [
    { batchNo: "B001", quantity: 2, supplierName: "3M" },
    { batchNo: "B002", quantity: 1 }
  ]);
  assert.deepEqual(result.errors, []);
});

test("inventory page exposes batch scan inbound on purchase order items", () => {
  const pageSource = readFileSync("app/purchases/orders/[id]/page.tsx", "utf8");

  assert.match(pageSource, /parseInboundScanLines/);
  assert.match(pageSource, /receivePurchaseItemBatches/);
  assert.match(pageSource, /图片识别/);
  assert.match(pageSource, /手动输入/);
  assert.match(pageSource, /文件导入/);
  assert.match(pageSource, /parseInboundFileRows/);
  assert.match(pageSource, /parseInboundImageCodes/);
  assert.match(pageSource, /每行：批次号 数量 供应商/);
  assert.match(pageSource, /setScanImportOpen\(true\)/);
  assert.match(pageSource, /已导入 \$\{importedBatches\.length\} 行批次明细/);
  assert.doesNotMatch(pageSource, /purchase-scan-panel-inline/);
});
