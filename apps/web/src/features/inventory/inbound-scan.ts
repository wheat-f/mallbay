import type { ReceivePurchaseItemPayload } from "./api";

export type InboundScanParseResult = {
  batches: ReceivePurchaseItemPayload[];
  errors: Array<{ line: number; message: string }>;
};

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
