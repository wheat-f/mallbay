export type ReceiptAllocationCandidate = {
  orderId: string;
  orderNo: string;
  outstandingCents: number;
  completedAt: Date | null;
  createdAt: Date;
};

export type ReceiptAllocation = {
  orderId: string;
  amountCents: number;
};

export function buildAutomaticReceiptAllocation(
  amountCents: number,
  candidates: ReceiptAllocationCandidate[]
): ReceiptAllocation[] {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new Error("收款金额必须是大于 0 的整数分");
  }

  const availableCents = candidates.reduce(
    (sum, candidate) => sum + Math.max(0, candidate.outstandingCents),
    0
  );
  if (amountCents > availableCents) {
    throw new Error("收款金额不能超过所选订单待收总额");
  }

  let remainingCents = amountCents;
  const allocations: ReceiptAllocation[] = [];
  const ordered = [...candidates].sort(compareAllocationCandidate);

  for (const candidate of ordered) {
    if (remainingCents <= 0) break;
    if (candidate.outstandingCents <= 0) continue;
    const allocatedCents = Math.min(candidate.outstandingCents, remainingCents);
    allocations.push({ orderId: candidate.orderId, amountCents: allocatedCents });
    remainingCents -= allocatedCents;
  }

  return allocations;
}

function compareAllocationCandidate(
  left: ReceiptAllocationCandidate,
  right: ReceiptAllocationCandidate
) {
  const leftCompletedAt = left.completedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  const rightCompletedAt = right.completedAt?.getTime() ?? Number.POSITIVE_INFINITY;
  if (leftCompletedAt !== rightCompletedAt) return leftCompletedAt - rightCompletedAt;

  const createdAtDifference = left.createdAt.getTime() - right.createdAt.getTime();
  if (createdAtDifference !== 0) return createdAtDifference;

  const orderNoDifference = left.orderNo.localeCompare(right.orderNo);
  return orderNoDifference !== 0
    ? orderNoDifference
    : left.orderId.localeCompare(right.orderId);
}
