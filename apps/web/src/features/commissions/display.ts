import type { CommissionRuleType } from "@mallbay/shared";

export const COMMISSION_RULE_TYPE_LABELS: Record<string, string> = {
  FIXED_RATE: "固定比例",
  FIXED_AMOUNT: "固定金额",
  SALES_TIER: "销售阶梯",
  CONSTRUCTION_TYPE: "施工类型"
};

export const COMMISSION_RULE_TYPE_OPTIONS: Array<{ value: CommissionRuleType; label: string }> = [
  { value: "FIXED_RATE", label: COMMISSION_RULE_TYPE_LABELS.FIXED_RATE },
  { value: "FIXED_AMOUNT", label: COMMISSION_RULE_TYPE_LABELS.FIXED_AMOUNT },
  { value: "SALES_TIER", label: COMMISSION_RULE_TYPE_LABELS.SALES_TIER },
  { value: "CONSTRUCTION_TYPE", label: COMMISSION_RULE_TYPE_LABELS.CONSTRUCTION_TYPE }
];

export function getCommissionRuleTypeLabel(type?: string | null) {
  if (!type) return "-";
  return COMMISSION_RULE_TYPE_LABELS[type] ?? type;
}
