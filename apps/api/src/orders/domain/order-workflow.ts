import { ConstructionTaskStatus, InventoryAllocationStatus, OrderStatus, QualityCheckResult, WarrantyStatus } from "@prisma/client";

export type WorkflowStage =
  | "HISTORICAL_VERIFICATION"
  | "CANCELLED"
  | "COMPLETED"
  | "REWORKING"
  | "PENDING_QUALITY"
  | "IN_CONSTRUCTION"
  | "PENDING_MATERIAL_PICKUP"
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
    status: InventoryAllocationStatus;
    outboundQuantity?: unknown;
  }>;
  warranty?: { status: WarrantyStatus } | null;
  historicalQualityMissing?: boolean;
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
  const inventoryStatus = hasOutbound ? "OUTBOUND" : hasLocked ? "LOCKED" : "NONE";
  const qualityStatus = input.constructionRecord?.qualityResult === QualityCheckResult.PASS
    ? "PASSED"
    : input.constructionRecord?.qualityResult === QualityCheckResult.REWORK_REQUIRED
      ? "FAILED"
      : "NOT_CHECKED";
  const warrantyStatus = input.warranty?.status ?? "NONE";

  const legacyQualityMissing = (input.status === OrderStatus.COMPLETED || input.status === OrderStatus.WARRANTIED) &&
    qualityStatus !== "PASSED";
  let currentStage: WorkflowStage;
  if (input.status === OrderStatus.CANCELLED) currentStage = "CANCELLED";
  else if (input.historicalQualityMissing || legacyQualityMissing) currentStage = "HISTORICAL_VERIFICATION";
  else if ((input.status === OrderStatus.COMPLETED || input.status === OrderStatus.WARRANTIED) &&
    qualityStatus === "PASSED" && outstanding <= 0) {
    currentStage = "COMPLETED";
  } else if (qualityStatus === "FAILED") currentStage = "REWORKING";
  else if (input.constructionRecord?.status === ConstructionTaskStatus.COMPLETED && qualityStatus === "NOT_CHECKED") currentStage = "PENDING_QUALITY";
  else if (input.constructionRecord?.status === ConstructionTaskStatus.IN_CONSTRUCTION) currentStage = "IN_CONSTRUCTION";
  else if (input.constructionRecord?.status === ConstructionTaskStatus.DISPATCHED && !hasOutbound) currentStage = "PENDING_MATERIAL_PICKUP";
  else if (!input.constructionRecord && hasOutbound) currentStage = "PENDING_DISPATCH";
  else if (allocations.length > 0 && !hasOutbound) currentStage = "PENDING_OUTBOUND";
  else if (allocations.length === 0 && qualityStatus === "NOT_CHECKED") currentStage = "PENDING_INVENTORY_CONFIRM";
  else if (qualityStatus === "PASSED" && outstanding > 0) currentStage = "PENDING_BALANCE";
  else if (qualityStatus === "PASSED" && !input.warranty) currentStage = "PENDING_WARRANTY";
  else if (qualityStatus === "PASSED" && outstanding <= 0) currentStage = "PENDING_DELIVERY";
  else currentStage = "PENDING_DISPATCH";

  const blockingReasons: string[] = [];
  if (outstanding > 0) blockingReasons.push("BALANCE_UNPAID");
  if (qualityStatus !== "PASSED") blockingReasons.push("QUALITY_NOT_PASSED");
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
      canGenerateWarranty: !["CANCELLED", "HISTORICAL_VERIFICATION", "COMPLETED"].includes(currentStage) && qualityStatus === "PASSED" && !input.warranty,
      canStartRework: !["CANCELLED", "HISTORICAL_VERIFICATION", "COMPLETED"].includes(currentStage) && qualityStatus === "FAILED",
      canCompleteOrder: qualityStatus === "PASSED" && outstanding <= 0 && currentStage === "PENDING_DELIVERY"
    }
  };
}
