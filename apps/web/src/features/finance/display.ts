import type { FinanceApprovalStatus } from "@mallbay/shared";
export { getAuditActorLabel } from "../audit/display";

export const FINANCE_APPROVAL_STATUS_LABELS: Record<string, string> = {
  PENDING: "待审批",
  APPROVED: "已通过",
  REJECTED: "已拒绝",
  PAID: "已打款",
  CANCELLED: "已取消"
};

export const FINANCE_REVIEW_OPTIONS: Array<{ value: FinanceApprovalStatus; label: string }> = [
  { value: "APPROVED", label: FINANCE_APPROVAL_STATUS_LABELS.APPROVED },
  { value: "REJECTED", label: FINANCE_APPROVAL_STATUS_LABELS.REJECTED },
  { value: "PAID", label: FINANCE_APPROVAL_STATUS_LABELS.PAID }
];

export const PAYMENT_RECORD_TYPE_LABELS: Record<string, string> = {
  ORDER_PAYMENT: "订单收款",
  EXPENSE: "费用付款",
  REIMBURSEMENT: "报销打款",
  REBATE: "返利打款",
  OTHER: "其他"
};

export const PAYMENT_ACCOUNT_TYPE_LABELS: Record<string, string> = {
  CORPORATE: "对公账户",
  PERSONAL: "个人账户",
  WECHAT: "微信",
  ALIPAY: "支付宝",
  OTHER: "其他"
};

export const FINANCE_AUDIT_ACTION_LABELS: Record<string, string> = {
  PAYMENT_ACCOUNT_UPDATED: "收款账户变更"
};

export function getFinanceApprovalStatusLabel(status?: string | null) {
  if (!status) return "-";
  return FINANCE_APPROVAL_STATUS_LABELS[status] ?? status;
}

type FinanceApplicationLike = {
  id?: string | null;
  title?: string | null;
  amountCents?: number | null;
  status?: string | null;
  reason?: string | null;
};

type PaymentRecordSourceInput = {
  type?: string | null;
  sourceId?: string | null;
  referenceId?: string | null;
  note?: string | null;
};

type PaymentRecordSourceLookup = {
  expenses?: FinanceApplicationLike[];
  reimbursements?: FinanceApplicationLike[];
};

export function getFinanceApplicationLabel(application: FinanceApplicationLike) {
  const parts = [
    application.title,
    application.amountCents === undefined || application.amountCents === null
      ? undefined
      : formatCentsAsYuan(application.amountCents),
    application.status ? getFinanceApprovalStatusLabel(application.status) : undefined
  ].filter(Boolean);

  return parts.join(" / ") || application.id || "-";
}

export function getPaymentRecordSourceLabel(record: PaymentRecordSourceInput, lookup: PaymentRecordSourceLookup) {
  const sourceId = record.sourceId ?? record.referenceId;
  const applications = record.type === "REIMBURSEMENT" ? lookup.reimbursements : record.type === "EXPENSE" ? lookup.expenses : undefined;
  const application = applications?.find((item) => item.id === sourceId);

  if (application) return getFinanceApplicationLabel(application);
  return record.note || (sourceId ? "来源未加载" : "-");
}

export function getPaymentRecordTypeLabel(type?: string | null) {
  if (!type) return "-";
  return PAYMENT_RECORD_TYPE_LABELS[type] ?? type;
}

export function getPaymentAccountTypeLabel(type?: string | null) {
  if (!type) return "-";
  return PAYMENT_ACCOUNT_TYPE_LABELS[type] ?? type;
}

export function getFinanceAuditActionLabel(action?: string | null) {
  if (!action) return "-";
  return FINANCE_AUDIT_ACTION_LABELS[action] ?? action;
}

export function getAuditReasonText(metadata?: Record<string, unknown> | null) {
  return typeof metadata?.reason === "string" ? `原因：${metadata.reason}` : "-";
}

export function yuanToCents(value?: number | null) {
  return Math.round((value ?? 0) * 100);
}

export function centsToYuan(value?: number | null) {
  return value === undefined || value === null ? undefined : value / 100;
}

export function formatCentsAsYuan(value?: number | null) {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY"
  }).format(value / 100);
}
