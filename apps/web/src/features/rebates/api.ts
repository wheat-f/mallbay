import type { RebateStatus, RebateSummary } from "@mallbay/shared";
import { request } from "../../lib/request";

export type ApplyRebatePayload = {
  orderId: string;
  amountCents: number;
  reason: string;
};

export const rebatesApi = {
  list: (storeId: string) =>
    request<RebateSummary[]>(`/rebates${toQueryString({ storeId })}`),

  apply: (payload: ApplyRebatePayload) =>
    request<RebateSummary>("/rebates", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  review: (id: string, payload: { status: RebateStatus; note?: string }) =>
    request<RebateSummary>(`/rebates/${id}/review`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  pay: (id: string, note?: string) =>
    request<RebateSummary>(`/rebates/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ note })
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
