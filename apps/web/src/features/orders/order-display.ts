export const ORDER_STATUS_LABEL: Record<string, string> = {
  PENDING_DISPATCH: "待派工",
  DISPATCHED: "已派工",
  IN_CONSTRUCTION: "施工中",
  COMPLETED: "已完成",
  WARRANTIED: "已质保",
  CANCELLED: "已取消"
};

export const CONSTRUCTION_TYPE_LABEL: Record<string, string> = {
  PPF: "漆面保护膜",
  COLOR_FILM: "改色膜",
  HEAT_FILM: "隔热膜",
  MODIFICATION: "改装",
  INSPECTION: "检查"
};

export const CONSTRUCTION_LOCATION_LABEL: Record<string, string> = {
  IN_STORE: "到店",
  OUTSIDE: "外出"
};

export const CONSTRUCTION_TYPE_OPTIONS = Object.entries(CONSTRUCTION_TYPE_LABEL).map(([value, label]) => ({
  value,
  label
}));

export const CONSTRUCTION_LOCATION_OPTIONS = Object.entries(CONSTRUCTION_LOCATION_LABEL).map(([value, label]) => ({
  value,
  label
}));

export const PAYMENT_TYPE_LABEL: Record<string, string> = {
  DEPOSIT: "定金",
  BALANCE: "尾款",
  FULL: "全款"
};

export function getOrderStatusLabel(value?: string | null) {
  if (!value) return "-";
  return ORDER_STATUS_LABEL[value] ?? "订单状态待确认";
}

export function getConstructionTypeLabel(value?: string | null) {
  if (!value) return "-";
  return CONSTRUCTION_TYPE_LABEL[value] ?? "施工类型待确认";
}

export function getConstructionLocationLabel(value?: string | null) {
  if (!value) return "-";
  return CONSTRUCTION_LOCATION_LABEL[value] ?? "施工地点待确认";
}

export function getPaymentTypeLabel(value?: string | null) {
  if (!value) return "-";
  return PAYMENT_TYPE_LABEL[value] ?? "付款类型待确认";
}

export function yuanCurrency(value?: number | null) {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY"
  }).format(value / 100);
}
