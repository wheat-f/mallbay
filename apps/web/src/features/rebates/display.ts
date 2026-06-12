import type { BusinessOrderSummary, RebateStatus, StorePosition } from "@mallbay/shared";

export const REBATE_STATUS_LABELS: Record<string, string> = {
  APPLIED: "已申请",
  REVIEWED: "业务已审核",
  APPROVED: "财务已审批",
  REJECTED: "已拒绝",
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
  return REBATE_STATUS_LABELS[status] ?? status;
}

type RebateLabelInput = {
  id?: string | null;
  reason?: string | null;
  status?: string | null;
  order?: BusinessOrderSummary | null;
  orderId?: string | null;
};

export function getRebateBusinessLabel(rebate: RebateLabelInput) {
  return [getRebateOrderLabel(rebate), rebate.reason, getRebateStatusLabel(rebate.status)]
    .filter(Boolean)
    .join(" / ") || rebate.id || "-";
}

export function getRebateOrderLabel(rebate: RebateLabelInput) {
  const order = rebate.order;
  if (!order) return "订单未加载";
  return [order.orderNo, getBusinessCustomerLabel(order.customer), getBusinessVehicleLabel(order.vehicle)]
    .filter(Boolean)
    .join(" / ") || "订单未加载";
}

function getBusinessCustomerLabel(orderCustomer?: BusinessOrderSummary["customer"]) {
  return orderCustomer?.companyName ?? orderCustomer?.personalName ?? orderCustomer?.name ?? orderCustomer?.contactPerson ?? undefined;
}

function getBusinessVehicleLabel(orderVehicle?: BusinessOrderSummary["vehicle"]) {
  return orderVehicle?.plateNo ?? orderVehicle?.carPlate ?? orderVehicle?.model ?? orderVehicle?.carModel ?? undefined;
}
