import type { CommissionRuleType, ConstructionType, SalesCommissionRuleSummary } from "@mallbay/shared";
import { request } from "../../lib/request";

export type CreateSalesCommissionRulePayload = {
  storeId: string;
  name: string;
  ruleType: CommissionRuleType;
  rateBasisPoints?: number;
  fixedAmountCents?: number;
  constructionType?: ConstructionType;
  isActive?: boolean;
};

export type GenerateWorkerCommissionsPayload = {
  baseAmountCents: number;
  adjustments?: Array<{ workerUserId: string; adjustmentCents: number }>;
};

export const commissionsApi = {
  salesRules: (storeId: string) =>
    request<SalesCommissionRuleSummary[]>(`/commissions/sales-rules${toQueryString({ storeId })}`),

  createSalesRule: (payload: CreateSalesCommissionRulePayload) =>
    request<SalesCommissionRuleSummary>("/commissions/sales-rules", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  generateSales: (orderId: string) =>
    request<unknown>(`/commissions/orders/${orderId}/sales`, { method: "POST" }),

  generateWorkers: (recordId: string, payload: GenerateWorkerCommissionsPayload) =>
    request<unknown[]>(`/commissions/records/${recordId}/workers`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

function toQueryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
