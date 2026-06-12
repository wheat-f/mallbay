import type { AfterSaleResponsibility, BusinessOrderSummary } from "@mallbay/shared";

export const AFTER_SALE_STATUS_LABELS: Record<string, string> = {
  OPEN: "待处理",
  ASSIGNED: "已派单",
  RESOLVED: "已解决",
  CLOSED: "已关闭",
  CANCELLED: "已取消"
};

export const AFTER_SALE_RESPONSIBILITY_LABELS: Record<string, string> = {
  PENDING: "待判责",
  CUSTOMER: "客户责任",
  CONSTRUCTION: "施工责任",
  MATERIAL: "材料责任",
  STORE: "门店责任"
};

export const AFTER_SALE_RESPONSIBILITY_OPTIONS: Array<{ value: AfterSaleResponsibility; label: string }> = [
  { value: "CUSTOMER", label: AFTER_SALE_RESPONSIBILITY_LABELS.CUSTOMER },
  { value: "CONSTRUCTION", label: AFTER_SALE_RESPONSIBILITY_LABELS.CONSTRUCTION },
  { value: "MATERIAL", label: AFTER_SALE_RESPONSIBILITY_LABELS.MATERIAL },
  { value: "STORE", label: AFTER_SALE_RESPONSIBILITY_LABELS.STORE }
];

export function getAfterSaleStatusLabel(status?: string | null) {
  if (!status) return "-";
  return AFTER_SALE_STATUS_LABELS[status] ?? status;
}

export function getAfterSaleResponsibilityLabel(responsibility?: string | null) {
  if (!responsibility) return "-";
  return AFTER_SALE_RESPONSIBILITY_LABELS[responsibility] ?? responsibility;
}

export function yuanToCents(value?: number | null) {
  if (value === undefined || value === null) return undefined;
  return Math.round(value * 100);
}

export function centsToYuan(value?: number | null) {
  if (value === undefined || value === null) return undefined;
  return Number((value / 100).toFixed(2));
}

type AfterSaleLabelInput = {
  id?: string | null;
  orderId?: string | null;
  description?: string | null;
  status?: string | null;
  order?: BusinessOrderSummary | null;
};

export function getAfterSaleBusinessLabel(afterSale: AfterSaleLabelInput) {
  return [getAfterSaleOrderLabel(afterSale), afterSale.description, getAfterSaleStatusLabel(afterSale.status)]
    .filter(Boolean)
    .join(" / ") || afterSale.id || "-";
}

export function getAfterSaleOrderLabel(afterSale: AfterSaleLabelInput) {
  const order = afterSale.order;
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
