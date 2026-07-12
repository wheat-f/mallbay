export type FulfillmentInventoryItem = {
  quantity?: number | string | null;
  inventoryAllocations?: Array<{
    lockedQuantity?: number | string | null;
    outboundQuantity?: number | string | null;
    status?: string | null;
  }>;
};

export type FulfillmentInventorySummaryStatus = "empty" | "unmatched" | "partial" | "matched" | "outbound";

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

export function getFulfillmentInventorySummary(items: FulfillmentInventoryItem[]) {
  if (items.length === 0) {
    return { status: "empty" as const, label: "待补齐货品", canEnterConstruction: false };
  }

  const statuses = items.map((item) => getFulfillmentInventoryStatus(item).label);

  if (statuses.every((status) => status === "已出库")) {
    return { status: "outbound" as const, label: "已出库", canEnterConstruction: true };
  }

  if (statuses.every((status) => status === "已匹配" || status === "已出库")) {
    return { status: "matched" as const, label: "已匹配", canEnterConstruction: true };
  }

  if (statuses.some((status) => status === "部分匹配" || status === "已匹配" || status === "已出库")) {
    return { status: "partial" as const, label: "部分匹配", canEnterConstruction: false };
  }

  return { status: "unmatched" as const, label: "待库房匹配", canEnterConstruction: false };
}

function toNumber(value?: number | string | null) {
  if (value === undefined || value === null || value === "") return 0;
  return Number(value);
}
