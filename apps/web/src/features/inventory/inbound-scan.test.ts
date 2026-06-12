import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseInboundScanLines } from "./inbound-scan";

test("parseInboundScanLines parses batch quantity and supplier from scanned lines", () => {
  const result = parseInboundScanLines("B001 1 3M\nB002,2,龙膜\nB003\t0.5");

  assert.deepEqual(result.batches, [
    { batchNo: "B001", quantity: 1, supplierName: "3M" },
    { batchNo: "B002", quantity: 2, supplierName: "龙膜" },
    { batchNo: "B003", quantity: 0.5 }
  ]);
  assert.deepEqual(result.errors, []);
});

test("parseInboundScanLines reports invalid scanned lines without dropping valid lines", () => {
  const result = parseInboundScanLines("B001 1\nBROKEN\nB002 -1\nB003 2");

  assert.deepEqual(result.batches, [
    { batchNo: "B001", quantity: 1 },
    { batchNo: "B003", quantity: 2 }
  ]);
  assert.deepEqual(result.errors, [
    { line: 2, message: "请按“批次号 数量 供应商”格式录入" },
    { line: 3, message: "入库数量必须大于 0" }
  ]);
});

test("inventory page exposes batch scan inbound on purchase order items", () => {
  const pageSource = readFileSync("app/inventory/page.tsx", "utf8");

  assert.match(pageSource, /parseInboundScanLines/);
  assert.match(pageSource, /receivePurchaseItemBatches/);
  assert.match(pageSource, /批量扫码入库/);
  assert.match(pageSource, /每行：批次号 数量 供应商/);
});
