export const STORE_POSITION_LABELS = {
  MANAGER: "店长",
  SALES: "销售",
  CUSTOMER_SERVICE: "客服",
  PURCHASING: "采购",
  FINANCE: "财务",
  SCHEDULER: "施工主管",
  CONSTRUCTION: "施工员",
  APPRENTICE: "学徒"
} as const;

export function getStorePositionLabel(position: string | null | undefined) {
  if (!position) return "";
  return STORE_POSITION_LABELS[position as keyof typeof STORE_POSITION_LABELS] ?? position;
}
