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
  items?: Array<{ id?: string; productId: string; quantity: number; salesUnit?: string; suggestedUnitPriceCents?: number; finalUnitPriceCents: number; finalAmountCents?: number; productSnapshot?: { brand?: string; name?: string; model?: string } }>;
  approvals?: Array<{ id: string; status: string; approvalType: string; reviewNote?: string | null; submittedAt: string; reviewedAt?: string | null }>;
  finalLaborCostCents?: number;
  suggestedProductAmountCents?: number;
  suggestedLaborCostCents?: number;
  customer?: { id?: string; name?: string | null; companyName?: string | null; contactPerson?: string | null };
  vehicle?: { carPlate?: string; carModel?: string; color?: string };
  convertedOrder?: { id: string; orderNo: string } | null;
  pricingCalculation?: { ruleSetVersion: number; inputHash: string; outputSnapshot: unknown };
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
  submitForApproval?: boolean;
};

export const salesQuoteApi = {
  create: (payload: CreateSalesQuotePayload) =>
    request<SalesQuoteRow>("/sales-quotes", { method: "POST", body: JSON.stringify(payload) }),
  list: (storeId: string) => request<SalesQuoteRow[]>(`/sales-quotes?storeId=${encodeURIComponent(storeId)}`),
  get: (id: string, storeId: string) => request<SalesQuoteRow>(`/sales-quotes/${id}?storeId=${encodeURIComponent(storeId)}`),
  submit: (id: string, storeId: string) => request<SalesQuoteRow>(`/sales-quotes/${id}/submit`, { method: "POST", body: JSON.stringify({ storeId }) }),
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
