export type FulfillmentInventoryItem = {
  quantity?: number | string | null;
  inventoryAllocations?: Array<{
    lockedQuantity?: number | string | null;
    outboundQuantity?: number | string | null;
    status?: string | null;
  }>;
};

export function getFulfillmentInventoryStatus(item: FulfillmentInventoryItem) {
  const requiredQuantity = toNumber(item.quantity);
  const fulfilledQuantity = (item.inventoryAllocations ?? [])
    .filter((allocation) => allocation.status === "LOCKED" || allocation.status === "OUTBOUND")
    .reduce((sum, allocation) => {
      if (allocation.status === "OUTBOUND") {
        return sum + Math.max(toNumber(allocation.outboundQuantity), toNumber(allocation.lockedQuantity));
      }
      return sum + Math.max(0, toNumber(allocation.lockedQuantity) - toNumber(allocation.outboundQuantity));
    }, 0);
  const outboundQuantity = (item.inventoryAllocations ?? [])
    .filter((allocation) => allocation.status === "OUTBOUND")
    .reduce((sum, allocation) => sum + Math.max(toNumber(allocation.outboundQuantity), toNumber(allocation.lockedQuantity)), 0);

  if (requiredQuantity > 0 && outboundQuantity >= requiredQuantity) {
    return { label: "已出库", color: "success" as const };
  }

  if (requiredQuantity > 0 && fulfilledQuantity >= requiredQuantity) {
    return { label: "已匹配", color: "success" as const };
  }

  if (fulfilledQuantity > 0) {
    return { label: "部分匹配", color: "warning" as const };
  }

  return { label: "待库房匹配", color: "processing" as const };
}

function toNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
}
