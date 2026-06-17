import type { BusinessOrderSummary, RebateStatus, StorePosition } from "@mallbay/shared";

export const REBATE_STATUS_LABELS: Record<string, string> = {
  APPLIED: "待审核",
  REVIEWED: "待审批",
  APPROVED: "待发放",
  REJECTED: "已驳回",
  PAID: "已发放"
};

export const REBATE_REVIEW_OPTIONS: Array<{ value: RebateStatus; label: string }> = [
  { value: "REVIEWED", label: "业务审核通过" },
  { value: "APPROVED", label: "财务审批通过" },
  { value: "REJECTED", label: REBATE_STATUS_LABELS.REJECTED }
];

export function getRebateReviewOptionsForRole(position?: StorePosition, isAuditor = false) {
  if (isAuditor) return REBATE_REVIEW_OPTIONS;
  if (position === "MANAGER") {
    return REBATE_REVIEW_OPTIONS.filter((option) => option.value === "REVIEWED" || option.value === "REJECTED");
  }
  if (position === "FINANCE") {
    return REBATE_REVIEW_OPTIONS.filter((option) => option.value === "APPROVED" || option.value === "REJECTED");
  }
  return [];
}

export function getRebateStatusLabel(status?: string | null) {
  if (!status) return "-";
  return REBATE_STATUS_LABELS[status] ?? "状态待确认";
}

type RebateLabelInput = {
  id?: string | null;
  reason?: string | null;
  status?: string | null;
  order?: BusinessOrderSummary | null;
  orderId?: string | null;
};

export function getRebateBusinessLabel(rebate: RebateLabelInput) {
  return [
    rebate.order ? getRebateOrderLabel(rebate) : undefined,
    rebate.reason,
    rebate.status ? getRebateStatusLabel(rebate.status) : undefined
  ]
    .filter(Boolean)
    .join(" / ") || "返利申请待确认";
}

export function getRebateOrderLabel(rebate: RebateLabelInput) {
  const order = rebate.order;
  if (!order) return "关联订单待确认";
  return [order.orderNo, getBusinessCustomerLabel(order.customer), getBusinessVehicleLabel(order.vehicle)]
    .filter(Boolean)
    .join(" / ") || "关联订单待确认";
}

export function getRebateCustomerLabel(rebate: RebateLabelInput) {
  const customerLabel = getBusinessCustomerLabel(rebate.order?.customer);
  return customerLabel ?? "客户信息待确认";
}

function getBusinessCustomerLabel(orderCustomer?: BusinessOrderSummary["customer"]) {
  return orderCustomer?.companyName ?? orderCustomer?.personalName ?? orderCustomer?.name ?? orderCustomer?.contactPerson ?? undefined;
}

function getBusinessVehicleLabel(orderVehicle?: BusinessOrderSummary["vehicle"]) {
  return orderVehicle?.plateNo ?? orderVehicle?.carPlate ?? orderVehicle?.model ?? orderVehicle?.carModel ?? undefined;
}
