export type ReturnKind = "SALES" | "PURCHASE";
export type ReturnRole = "MANAGER" | "PURCHASING" | "FINANCE";

export function canViewReturnAudit(role: string): boolean {
  return ["MANAGER", "FINANCE"].includes(role);
}

export function canOperateSalesReturn(role: string): boolean {
  return ["MANAGER", "SALES", "CUSTOMER_SERVICE", "FINANCE"].includes(role);
}

export function canOperatePurchaseReturn(role: string): boolean {
  return ["MANAGER", "PURCHASING", "FINANCE"].includes(role);
}

export function canCancelReturn(
  kind: ReturnKind,
  status: string,
  role: ReturnRole,
): boolean {
  if (kind === "SALES") {
    return role === "MANAGER" && ["DRAFT", "SUBMITTED", "PARTIAL_RECEIVED", "PARTIAL_REFUND"].includes(status);
  }

  return ["MANAGER", "PURCHASING"].includes(role) && ["DRAFT", "SUBMITTED", "PARTIAL_OUTBOUND", "PARTIAL_SETTLEMENT"].includes(status);
}

export function canConfirmSupplierSettlement(role: ReturnRole): boolean {
  return role === "FINANCE";
}

export function getPurchaseReturnStatusAfterReversal(remainingCents: number):
  "OUTBOUND_WAIT_SETTLEMENT" | "PARTIAL_SETTLEMENT" {
  return remainingCents > 0 ? "PARTIAL_SETTLEMENT" : "OUTBOUND_WAIT_SETTLEMENT";
}

export function sumConfirmedSettlement(
  records: Array<{
    status: string;
    refundAmountCents: number;
    payableOffsetAmountCents: number;
  }>,
): number {
  return records
    .filter((record) => record.status === "CONFIRMED")
    .reduce(
      (total, record) => total + record.refundAmountCents + record.payableOffsetAmountCents,
      0,
    );
}
