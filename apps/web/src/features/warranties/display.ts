import type { BusinessOrderSummary } from "@mallbay/shared";

export const WARRANTY_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "生效中",
  EXPIRED: "已过期",
  VOIDED: "已作废"
};

export function getWarrantyStatusLabel(status?: string | null) {
  if (!status) return "-";
  return WARRANTY_STATUS_LABELS[status] ?? "状态待确认";
}

export type WarrantyLike = {
  warrantyNo?: string | null;
  status?: string | null;
  scope?: string | null;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  orderId?: string | null;
  order?: BusinessOrderSummary | null;
};

export function getWarrantyExpiryReminder(
  warranty: Pick<WarrantyLike, "status" | "endDate">,
  now = new Date()
) {
  if (warranty.status !== "ACTIVE") {
    return { label: "无需提醒", color: "default" };
  }
  if (!warranty.endDate) {
    return { label: "未设置到期日", color: "default" };
  }

  const endDate = startOfDay(new Date(warranty.endDate));
  const today = startOfDay(now);
  const remainingDays = Math.ceil((endDate.getTime() - today.getTime()) / 86_400_000);
  if (remainingDays < 0) {
    return { label: `已逾期 ${Math.abs(remainingDays)} 天`, color: "error" };
  }
  if (remainingDays <= 30) {
    return { label: `${remainingDays} 天后到期`, color: "warning" };
  }
  return { label: "正常", color: "success" };
}

export function getWarrantyCardRows(warranty: WarrantyLike) {
  return [
    { label: "质保编号", value: warranty.warrantyNo ?? "-" },
    { label: "状态", value: getWarrantyStatusLabel(warranty.status) },
    { label: "质保范围", value: warranty.scope ?? "-" },
    { label: "开始日期", value: formatDate(warranty.startDate) },
    { label: "到期日期", value: formatDate(warranty.endDate) },
    { label: "关联订单", value: getWarrantyOrderLabel(warranty) }
  ];
}

export function getWarrantyOrderLabel(warranty: Pick<WarrantyLike, "order" | "orderId">) {
  const order = warranty.order;
  if (!order) return "关联订单待确认";
  return [order.orderNo, getBusinessCustomerLabel(order.customer), getBusinessVehicleLabel(order.vehicle)]
    .filter(Boolean)
    .join(" / ") || "关联订单待确认";
}

function getBusinessCustomerLabel(orderCustomer?: BusinessOrderSummary["customer"]) {
  return orderCustomer?.companyName ?? orderCustomer?.personalName ?? orderCustomer?.name ?? orderCustomer?.contactPerson ?? undefined;
}

function getBusinessVehicleLabel(orderVehicle?: BusinessOrderSummary["vehicle"]) {
  return orderVehicle?.plateNo ?? orderVehicle?.carPlate ?? orderVehicle?.model ?? orderVehicle?.carModel ?? undefined;
}

function startOfDay(value: Date) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDate(value?: string | Date | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN").format(new Date(value));
}
