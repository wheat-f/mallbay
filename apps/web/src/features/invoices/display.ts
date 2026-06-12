import type { BusinessOrderSummary } from "@mallbay/shared";

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  APPLIED: "已申请",
  ISSUED: "已开具",
  VOIDED: "已作废",
  REISSUED: "已重开"
};

export function getInvoiceStatusLabel(status?: string | null) {
  if (!status) return "-";
  return INVOICE_STATUS_LABELS[status] ?? status;
}

export function getInvoiceFileDisplay(fileUrl?: string | null) {
  if (!fileUrl) {
    return { label: "未上传", href: undefined, available: false };
  }
  return { label: "查看电子文件", href: fileUrl, available: true };
}

type InvoiceLabelInput = {
  id?: string | null;
  invoiceNo?: string | null;
  title?: string | null;
  order?: BusinessOrderSummary | null;
};

export function getInvoiceBusinessLabel(invoice: InvoiceLabelInput) {
  return [invoice.invoiceNo, invoice.title, getInvoiceOrderLabel(invoice)]
    .filter(Boolean)
    .join(" / ") || invoice.id || "-";
}

export function getInvoiceOrderLabel(invoice: { order?: BusinessOrderSummary | null; orderId?: string | null }) {
  const order = invoice.order;
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
