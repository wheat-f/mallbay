import { request } from "../../lib/request";

export type SalesQuoteRow = {
  id: string;
  quoteNo: string;
  storeId: string;
  customerId: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXPIRED" | "CONVERTED" | "WITHDRAWN";
  suggestedTotalCents: number;
  finalTotalCents: number;
  estimatedMarginBps?: number | null;
  validUntil: string;
  customer?: { name?: string | null; companyName?: string | null; contactPerson?: string | null };
  items?: Array<{ productId: string; quantity: number; finalUnitPriceCents: number }>;
};

export type RecalculateSalesQuotePayload = {
  storeId: string;
  pricingCalculationId: string;
  items: Array<{ productId: string; finalUnitPriceCents: number }>;
  finalLaborCostCents: number;
  estimatedCostCents?: number;
  adjustmentReasonCode?: string;
  adjustmentReasonText?: string;
  validHours?: number;
};

export type CreateSalesQuotePayload = RecalculateSalesQuotePayload & {
  customerId: string;
  vehicleId?: string;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  constructionAddress?: string;
  constructionType: string;
  constructionLocation: string;
};

export const salesQuoteApi = {
  create: (payload: CreateSalesQuotePayload) =>
    request<SalesQuoteRow>("/sales-quotes", { method: "POST", body: JSON.stringify(payload) }),
  list: (storeId: string) => request<SalesQuoteRow[]>(`/sales-quotes?storeId=${encodeURIComponent(storeId)}`),
  approve: (id: string, storeId: string, reviewNote?: string) =>
    request<SalesQuoteRow>(`/sales-quotes/${id}/approve`, { method: "POST", body: JSON.stringify({ storeId, reviewNote }) }),
  reject: (id: string, storeId: string, reviewNote?: string) =>
    request<SalesQuoteRow>(`/sales-quotes/${id}/reject`, { method: "POST", body: JSON.stringify({ storeId, reviewNote }) }),
  withdraw: (id: string, storeId: string, reason?: string) =>
    request<SalesQuoteRow>(`/sales-quotes/${id}/withdraw`, { method: "POST", body: JSON.stringify({ storeId, reason }) }),
  recalculate: (id: string, payload: RecalculateSalesQuotePayload) =>
    request<{ previousQuoteId: string; quote: SalesQuoteRow }>(`/sales-quotes/${id}/recalculate`, { method: "POST", body: JSON.stringify(payload) }),
  convertToOrder: (id: string) =>
    request<{ quoteId: string; orderId: string }>(`/sales-quotes/${id}/convert-to-order`, { method: "POST" })
};
