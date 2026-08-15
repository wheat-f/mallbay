import { request } from "../../lib/request";

export type SalesQuoteRow = {
  id: string;
  quoteNo: string;
  storeId: string;
  executionStoreId: string;
  customerId: string;
  status: "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "EXPIRED" | "CONVERTED" | "WITHDRAWN";
  suggestedTotalCents: number;
  finalTotalCents: number;
  estimatedMarginBps?: number | null;
  validUntil: string;
  items?: Array<{ id?: string; productId: string; quantity: number; salesUnit?: string; suggestedUnitPriceCents?: number; finalUnitPriceCents: number; finalAmountCents?: number; productSnapshot?: { brand?: string; name?: string; model?: string } }>;
  approvals?: Array<{ id: string; status: string; approvalType: string; reviewNote?: string | null; submittedAt: string; reviewedAt?: string | null }>;
  finalLaborCostCents?: number;
  finalConstructionChargeCents?: number;
  suggestedConstructionChargeCents?: number;
  estimatedMaterialCostCents?: number | null;
  estimatedConstructionCostCents?: number | null;
  estimatedTotalCostCents?: number | null;
  costCompleteness?: "COMPLETE" | "TEMPORARY" | "MISSING" | null;
  temporaryCostCents?: number | null;
  temporaryCostReason?: string | null;
  suggestedProductAmountCents?: number;
  suggestedLaborCostCents?: number;
  customer?: { id?: string; name?: string | null; companyName?: string | null; contactPerson?: string | null };
  vehicle?: { carPlate?: string; carModel?: string; color?: string };
  convertedOrder?: { id: string; orderNo: string } | null;
  pricingCalculation?: { ruleSetVersion: number; inputHash: string; outputSnapshot: unknown };
};

export type RecalculateSalesQuotePayload = {
  storeId: string;
  executionStoreId?: string;
  pricingCalculationId: string;
  items: Array<{ productId: string; finalUnitPriceCents: number }>;
  finalConstructionChargeCents?: number;
  /** @deprecated compatibility alias for finalConstructionChargeCents. */
  finalLaborCostCents?: number;
  estimatedCostCents?: number;
  temporaryCostCents?: number;
  temporaryCostReason?: string;
  adjustmentReasonCode?: string;
  adjustmentReasonText?: string;
  validHours?: number;
};

export type SalesQuoteExportDimension = "customer" | "date" | "product";

export type SalesQuoteExportDetail = {
  quoteId: string;
  quoteNo: string;
  customerName: string;
  vehicle: string;
  status: SalesQuoteRow["status"];
  createdAt: string;
  validUntil: string;
  productId: string;
  productBrand: string;
  productName: string;
  productModel: string;
  productSpecification: string;
  quantity: number;
  salesUnit: string;
  suggestedUnitPriceCents: number;
  finalUnitPriceCents: number;
  finalAmountCents: number;
  suggestedConstructionChargeCents: number;
  finalConstructionChargeCents: number;
  quoteTotalCents: number;
  estimatedMaterialCostCents?: number | null;
  estimatedConstructionCostCents?: number | null;
  estimatedTotalCostCents?: number | null;
  costCompleteness?: "COMPLETE" | "TEMPORARY" | "MISSING" | null;
  temporaryCostCents?: number | null;
  temporaryCostReason?: string | null;
  estimatedMarginBps?: number | null;
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
  create: (payload: CreateSalesQuotePayload, commandId: string) =>
    request<SalesQuoteRow>("/sales-quotes", {
      method: "POST",
      headers: { "Idempotency-Key": commandId },
      body: JSON.stringify(payload)
    }),
  list: (storeId: string) => request<SalesQuoteRow[]>(`/sales-quotes?storeId=${encodeURIComponent(storeId)}`),
  exportDetails: (storeId: string, exportDimension: SalesQuoteExportDimension = "date") =>
    request<SalesQuoteExportDetail[]>(`/sales-quotes/export-details?storeId=${encodeURIComponent(storeId)}&exportDimension=${exportDimension}`),
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
  convertToOrder: (id: string, commandId: string) =>
    request<{ quoteId: string; orderId: string }>(`/sales-quotes/${id}/convert-to-order`, {
      method: "POST",
      headers: { "Idempotency-Key": commandId }
    })
};

export function getQuoteConversionCommandId(quoteId: string, actorId = "anonymous", storeId = "global") {
  const key = `mallbay-quote-conversion-command:v2:${actorId}:${storeId}:${quoteId}`;
  if (typeof localStorage !== "undefined") {
    const existing = localStorage.getItem(key);
    if (existing) return existing;
  }
  const value = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const commandId = `quote_convert_${value}`;
  if (typeof localStorage !== "undefined") localStorage.setItem(key, commandId);
  return commandId;
}

export function getQuoteCreationCommandId(draftId: string) {
  const key = `mallbay-quote-creation-command:${draftId}`;
  const existing = typeof window === "undefined" ? null : window.localStorage.getItem(key);
  if (existing) return existing;
  const commandId = globalThis.crypto?.randomUUID?.() ?? `quote-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (typeof window !== "undefined") window.localStorage.setItem(key, commandId);
  return commandId;
}

export function clearQuoteCreationCommandId(draftId: string) {
  if (typeof window !== "undefined") window.localStorage.removeItem(`mallbay-quote-creation-command:${draftId}`);
}

export function clearQuoteConversionCommandId(quoteId: string, actorId = "anonymous", storeId = "global") {
  if (typeof localStorage !== "undefined") localStorage.removeItem(`mallbay-quote-conversion-command:v2:${actorId}:${storeId}:${quoteId}`);
}

