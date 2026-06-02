import type { InvoiceSummary } from "@mallbay/shared";
import { request } from "../../lib/request";

export type ApplyInvoicePayload = {
  orderId: string;
  title: string;
  taxNo?: string;
  amountCents: number;
};

export const invoicesApi = {
  list: (storeId: string) =>
    request<InvoiceSummary[]>(`/invoices${toQueryString({ storeId })}`),

  apply: (payload: ApplyInvoicePayload) =>
    request<InvoiceSummary>("/invoices", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  issue: (id: string, payload: { invoiceNo: string; note?: string }) =>
    request<InvoiceSummary>(`/invoices/${id}/issue`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  void: (id: string, note?: string) =>
    request<InvoiceSummary>(`/invoices/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ note })
    }),

  reissue: (id: string, payload: { invoiceNo: string; note?: string }) =>
    request<InvoiceSummary>(`/invoices/${id}/reissue`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

function toQueryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
