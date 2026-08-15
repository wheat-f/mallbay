import { ConstructionTaskStatus, InventoryAllocationStatus, OrderStatus, QualityCheckResult, WarrantyStatus } from "@prisma/client";

export type WorkflowStage =
  | "HISTORICAL_VERIFICATION"
  | "CANCELLED"
  | "COMPLETED"
  | "REWORKING"
  | "PENDING_QUALITY"
  | "IN_CONSTRUCTION"
  | "PENDING_MATERIAL_PICKUP"
  | "READY_TO_START"
  | "PENDING_DISPATCH"
  | "PENDING_OUTBOUND"
  | "PENDING_INVENTORY_CONFIRM"
  | "PENDING_WARRANTY"
  | "PENDING_BALANCE"
  | "PENDING_DELIVERY";

export type OrderWorkflow = {
  currentStage: WorkflowStage;
  paymentStatus: "UNPAID" | "PARTIAL" | "PAID";
  inventoryStatus: "NONE" | "LOCKED" | "OUTBOUND";
  qualityStatus: "NOT_CHECKED" | "PASSED" | "FAILED";
  warrantyStatus: "NONE" | "PENDING_ACTIVATION" | "ACTIVE" | "EXPIRED" | "VOIDED";
  blockingReasons: string[];
  capabilities: {
    canCollectBalance: boolean;
    canGenerateWarranty: boolean;
    canStartRework: boolean;
    canCompleteOrder: boolean;
  };
};

type WorkflowInput = {
  status: OrderStatus;
  amount?: { paidAmountCents: number; outstandingCents: number } | null;
  constructionRecord?: {
    status: ConstructionTaskStatus;
    qualityResult: QualityCheckResult | null;
  } | null;
  inventoryAllocations?: Array<{
    id?: string;
    status: InventoryAllocationStatus;
    outboundQuantity?: unknown;
  }>;
  pickedAllocationIds?: string[];
  warranty?: { status: WarrantyStatus } | null;
  historicalQualityMissing?: boolean;
  historicalQualityResolved?: boolean;
};

export function deriveOrderWorkflow(input: WorkflowInput): OrderWorkflow {
  const paid = input.amount?.paidAmountCents ?? 0;
  const outstanding = input.amount?.outstandingCents ?? 0;
  const paymentStatus = outstanding <= 0 ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID";
  const allocations = input.inventoryAllocations ?? [];
  const hasOutbound = allocations.some((allocation) =>
    allocation.status === InventoryAllocationStatus.OUTBOUND || Number(allocation.outboundQuantity ?? 0) > 0
  );
  const hasLocked = allocations.some((allocation) => allocation.status === InventoryAllocationStatus.LOCKED);
  const pickedAllocationIds = new Set(input.pickedAllocationIds ?? []);
  const lockedAllocationsPicked = allocations
    .filter((allocation) => allocation.status === InventoryAllocationStatus.LOCKED)
    .every((allocation) => Boolean(allocation.id && pickedAllocationIds.has(allocation.id)));
  const inventoryStatus = hasOutbound ? "OUTBOUND" : hasLocked ? "LOCKED" : "NONE";
  const qualityStatus = input.constructionRecord?.qualityResult === QualityCheckResult.PASS
    ? "PASSED"
    : input.constructionRecord?.qualityResult === QualityCheckResult.REWORK_REQUIRED
      ? "FAILED"
      : "NOT_CHECKED";
  const warrantyStatus = input.warranty?.status ?? "NONE";

  const legacyQualityMissing = !input.historicalQualityResolved &&
    (input.status === OrderStatus.COMPLETED || input.status === OrderStatus.WARRANTIED) && qualityStatus !== "PASSED";
  let currentStage: WorkflowStage;
  if (input.status === OrderStatus.CANCELLED) currentStage = "CANCELLED";
  else if (input.historicalQualityMissing || legacyQualityMissing) currentStage = "HISTORICAL_VERIFICATION";
  else if ((input.status === OrderStatus.COMPLETED || input.status === OrderStatus.WARRANTIED) &&
    (qualityStatus === "PASSED" || input.historicalQualityResolved) && outstanding <= 0) {
    currentStage = "COMPLETED";
  } else if (qualityStatus === "FAILED") currentStage = "REWORKING";
  else if (input.constructionRecord?.status === ConstructionTaskStatus.COMPLETED && qualityStatus === "NOT_CHECKED") currentStage = "PENDING_QUALITY";
  else if (input.constructionRecord?.status === ConstructionTaskStatus.IN_CONSTRUCTION) currentStage = "IN_CONSTRUCTION";
  else if (input.constructionRecord?.status === ConstructionTaskStatus.DISPATCHED && hasLocked && !hasOutbound && !lockedAllocationsPicked) currentStage = "PENDING_MATERIAL_PICKUP";
  else if (input.constructionRecord?.status === ConstructionTaskStatus.DISPATCHED) currentStage = "READY_TO_START";
  else if (!input.constructionRecord && hasOutbound) currentStage = "PENDING_DISPATCH";
  else if (allocations.length > 0 && !hasOutbound) currentStage = "PENDING_OUTBOUND";
  else if (allocations.length === 0 && qualityStatus === "NOT_CHECKED") currentStage = "PENDING_INVENTORY_CONFIRM";
  else if (qualityStatus === "PASSED" && outstanding > 0) currentStage = "PENDING_BALANCE";
  // There is no independent warranty-generation command. When quality and
  // payment are complete, final delivery owns creation/activation of the
  // warranty in the same transaction, so the order is immediately eligible
  // for the final-delivery command even when no Warranty row exists yet.
  else if (qualityStatus === "PASSED" && outstanding <= 0) currentStage = "PENDING_DELIVERY";
  else currentStage = "PENDING_DISPATCH";

  const blockingReasons: string[] = [];
  if (outstanding > 0) blockingReasons.push("BALANCE_UNPAID");
  if (qualityStatus !== "PASSED" && !input.historicalQualityResolved) blockingReasons.push("QUALITY_NOT_PASSED");
  if (currentStage === "PENDING_OUTBOUND" || currentStage === "PENDING_INVENTORY_CONFIRM") blockingReasons.push("INVENTORY_NOT_READY");

  return {
    currentStage,
    paymentStatus,
    inventoryStatus,
    qualityStatus,
    warrantyStatus,
    blockingReasons,
    capabilities: {
      canCollectBalance: !["CANCELLED", "HISTORICAL_VERIFICATION", "COMPLETED"].includes(currentStage) && outstanding > 0,
      // Kept in the result shape for compatibility; warranty creation is
      // intentionally not an independent user action (ADR-0002).
      canGenerateWarranty: false,
      canStartRework: !["CANCELLED", "HISTORICAL_VERIFICATION", "COMPLETED"].includes(currentStage) && qualityStatus === "FAILED",
      canCompleteOrder: qualityStatus === "PASSED" && outstanding <= 0 && currentStage === "PENDING_DELIVERY"
    }
  };
}
