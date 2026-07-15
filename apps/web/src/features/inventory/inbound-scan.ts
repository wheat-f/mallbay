import type { ReceivePurchaseItemPayload } from "./api";

export type InboundScanParseResult = {
  batches: ReceivePurchaseItemPayload[];
  errors: Array<{ line: number; message: string }>;
};

export type InboundImportRow = Record<string, unknown>;

const BATCH_NO_KEYS = ["batchNo", "batch_no", "批次号", "批次"];
const QUANTITY_KEYS = ["quantity", "数量", "入库数量"];
const SUPPLIER_KEYS = ["supplierName", "supplier_name", "供应商名称", "供应商"];

function readImportValue(row: InboundImportRow, keys: string[]) {
  const entry = Object.entries(row).find(([key]) => keys.includes(key.trim()));
  return entry?.[1];
}

function parseQuantity(value: unknown) {
  if (value === undefined || value === null || value === "") return 1;
  return Number(String(value).replace(/,/g, "").trim());
}

export function parseInboundScanLines(text: string): InboundScanParseResult {
  const batches: ReceivePurchaseItemPayload[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const parts = line.split(/[,\t ]+/).filter(Boolean);
    const quantity = parts.length === 1 ? 1 : Number(parts[1]);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({ line: index + 1, message: "入库数量必须大于 0" });
      return;
    }

    batches.push({
      batchNo: parts[0],
      quantity,
      ...(parts[2] ? { supplierName: parts[2] } : {})
    });
  });

  return { batches, errors };
}

export function parseInboundFileRows(rows: InboundImportRow[]): InboundScanParseResult {
  const batches: ReceivePurchaseItemPayload[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  rows.forEach((row, index) => {
    const batchNo = String(readImportValue(row, BATCH_NO_KEYS) ?? "").trim();
    if (!batchNo) {
      errors.push({ line: index + 2, message: "缺少批次号列或批次号为空" });
      return;
    }

    const quantity = parseQuantity(readImportValue(row, QUANTITY_KEYS));
    if (!Number.isFinite(quantity) || quantity <= 0) {
      errors.push({ line: index + 2, message: "入库数量必须大于 0" });
      return;
    }

    const supplier = String(readImportValue(row, SUPPLIER_KEYS) ?? "").trim();
    batches.push({
      batchNo,
      quantity,
      ...(supplier ? { supplierName: supplier } : {})
    });
  });

  return { batches, errors };
}

export function parseInboundImageCodes(codes: string[]): InboundScanParseResult {
  return parseInboundScanLines(codes.map((code) => code.trim()).filter(Boolean).join("\n"));
}
