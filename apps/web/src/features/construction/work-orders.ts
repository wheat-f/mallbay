export type ConstructionWorkOrderTab = "all" | "pending" | "dispatched" | "active" | "completed";

export type ConstructionPendingOrderInput = {
  id: string;
  orderNo?: string | null;
  status?: string | null;
  appointmentDate?: string | null;
  appointmentTimeSlot?: string | null;
  constructionLocation?: string | null;
  constructionType?: string | null;
  note?: string | null;
  outsideAddress?: string | null;
  laborCostCents?: number | null;
  totalAmountCents?: number | null;
  customer?: { name?: string | null; companyName?: string | null } | null;
  items?: unknown[];
  vehicle?: { plateNo?: string | null; brand?: string | null; model?: string | null; color?: string | null } | null;
};

export type ConstructionRecordInput = {
  id: string;
  orderId: string;
  status: string;
  order?: (Partial<ConstructionPendingOrderInput> & { id?: string | null; orderNo?: string | null }) | null;
  assignments?: { workerUserId: string }[];
  photos?: { id: string; stage: string; url: string; uploadedById: string }[];
  qualityResult?: string | null;
  qualityNote?: string | null;
};

export type ConstructionWorkItem =
  | {
      kind: "pending";
      status: "PENDING_DISPATCH";
      orderId: string;
      orderNo: string;
      order: ConstructionPendingOrderInput;
    }
  | {
      kind: "record";
      status: "DISPATCHED" | "IN_CONSTRUCTION" | "COMPLETED" | string;
      orderId: string;
      orderNo: string;
      record: ConstructionRecordInput;
      order?: (Partial<ConstructionPendingOrderInput> & { id?: string | null; orderNo?: string | null }) | null;
    };

export function buildConstructionWorkItems(input: {
  pendingOrders: ConstructionPendingOrderInput[];
  records: ConstructionRecordInput[];
}) {
  const pendingItems: ConstructionWorkItem[] = input.pendingOrders.map((order) => ({
    kind: "pending",
    status: "PENDING_DISPATCH",
    orderId: order.id,
    orderNo: order.orderNo ?? "未编号订单",
    order
  }));

  const recordItems: ConstructionWorkItem[] = input.records.map((record) => ({
    kind: "record",
    status: record.status,
    orderId: record.orderId,
    orderNo: record.order?.orderNo ?? "订单信息待确认",
    record,
    order: record.order
  }));

  return [...pendingItems, ...recordItems].sort(compareConstructionWorkItems);
}

export function getVisibleConstructionWorkItems(items: ConstructionWorkItem[], tab: ConstructionWorkOrderTab) {
  if (tab === "pending") return items.filter((item) => item.status === "PENDING_DISPATCH");
  if (tab === "dispatched") return items.filter((item) => item.status === "DISPATCHED");
  if (tab === "active") return items.filter((item) => item.status === "IN_CONSTRUCTION");
  if (tab === "completed") return items.filter((item) => item.status === "COMPLETED");
  return items;
}

export function getConstructionWorkOrderCounts(items: ConstructionWorkItem[]) {
  return {
    all: items.length,
    pending: items.filter((item) => item.status === "PENDING_DISPATCH").length,
    dispatched: items.filter((item) => item.status === "DISPATCHED").length,
    active: items.filter((item) => item.status === "IN_CONSTRUCTION").length,
    completed: items.filter((item) => item.status === "COMPLETED").length
  };
}

function compareConstructionWorkItems(a: ConstructionWorkItem, b: ConstructionWorkItem) {
  const aDate = getWorkItemDate(a);
  const bDate = getWorkItemDate(b);
  return bDate.localeCompare(aDate);
}

function getWorkItemDate(item: ConstructionWorkItem) {
  if (item.kind === "pending") return item.order.appointmentDate ?? "";
  return item.order?.appointmentDate ?? "";
}
