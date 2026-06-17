import type { BusinessOrderSummary } from "@mallbay/shared";

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  APPLIED: "待开票",
  ISSUED: "已开票",
  VOIDED: "已作废",
  REISSUED: "已开票"
};

export function getInvoiceStatusLabel(status?: string | null) {
  if (!status) return "-";
  return INVOICE_STATUS_LABELS[status] ?? "状态待确认";
}

export function getInvoiceFileDisplay(fileUrl?: string | null) {
  if (!fileUrl) {
    return { label: "未上传", href: undefined, available: false };
  }
  return { label: "查看电子文件", href: fileUrl, available: true };
}

export type InvoiceOrderPaymentStatus = "UNPAID" | "PARTIAL" | "PAID" | "UNKNOWN";

export function getInvoiceOrderPaymentStatus(invoice: { order?: BusinessOrderSummary | null }): InvoiceOrderPaymentStatus {
  const amount = invoice.order?.amount;
  if (!amount) return "UNKNOWN";
  const paid = amount.paidAmountCents ?? 0;
  const outstanding = amount.outstandingCents ?? 0;
  if (outstanding <= 0) return "PAID";
  if (paid > 0) return "PARTIAL";
  return "UNPAID";
}

type InvoiceLabelInput = {
  id?: string | null;
  invoiceNo?: string | null;
  title?: string | null;
  order?: BusinessOrderSummary | null;
};

export function getInvoiceBusinessLabel(invoice: InvoiceLabelInput) {
  return [invoice.invoiceNo, invoice.title, invoice.order ? getInvoiceOrderLabel(invoice) : undefined]
    .filter(Boolean)
    .join(" / ") || "发票信息待确认";
}

export function getInvoiceOrderLabel(invoice: { order?: BusinessOrderSummary | null; orderId?: string | null }) {
  const order = invoice.order;
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
