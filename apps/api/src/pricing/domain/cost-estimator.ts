export type CostSource = "INVENTORY_WEIGHTED_AVERAGE" | "RECENT_RECEIPT" | "STANDARD_COST" | "MISSING";

export type CostEstimateLine = {
  productId: string;
  quantity: number;
  unitCostCents?: number;
  source: CostSource;
  estimatedCostCents: number;
  warning?: string;
};

export type CostEstimateResult = {
  lines: CostEstimateLine[];
  materialCostCents: number;
  /** Explicit replacement for the ambiguous legacy estimatedCostCents field. */
  estimatedMaterialCostCents: number;
  /**
   * Backward-compatible alias. It is material-only and MUST NOT include any
   * customer-facing construction charge.
   */
  estimatedCostCents: number;
  hasMissingCost: boolean;
  costCompleteness: "COMPLETE" | "MISSING";
};

/**
 * Cost precedence is intentionally explicit and deterministic. Inventory
 * weighted average is preferred, then the most recent receipt, then the
 * product's maintained standard cost. Missing cost never silently becomes 0.
 */
export function estimateCosts(input: {
  lines: Array<{ productId: string; quantity: number }>;
  costs: Record<string, { weightedAverageCents?: number; recentCents?: number; standardCents?: number }>;
  /** @deprecated ignored for compatibility; customer charges are not costs. */
  laborCostCents?: number;
}): CostEstimateResult {
  const lines = input.lines.map((line) => {
    if (!Number.isFinite(line.quantity) || line.quantity <= 0) throw new Error(`产品 ${line.productId} 数量必须为正数`);
    const source = input.costs[line.productId] ?? {};
    const selected = source.weightedAverageCents ?? source.recentCents ?? source.standardCents;
    const costSource: CostSource = source.weightedAverageCents !== undefined
      ? "INVENTORY_WEIGHTED_AVERAGE"
      : source.recentCents !== undefined
        ? "RECENT_RECEIPT"
        : source.standardCents !== undefined
          ? "STANDARD_COST"
          : "MISSING";
    return {
      productId: line.productId,
      quantity: line.quantity,
      unitCostCents: selected,
      source: costSource,
      estimatedCostCents: selected === undefined ? 0 : selected * line.quantity,
      warning: selected === undefined ? "缺少库存、最近入库或标准成本" : undefined
    };
  });
  const materialCostCents = lines.reduce((sum, line) => sum + line.estimatedCostCents, 0);
  const hasMissingCost = lines.some((line) => line.source === "MISSING");
  return {
    lines,
    materialCostCents,
    estimatedMaterialCostCents: materialCostCents,
    estimatedCostCents: materialCostCents,
    hasMissingCost,
    costCompleteness: hasMissingCost ? "MISSING" : "COMPLETE"
  };
}
