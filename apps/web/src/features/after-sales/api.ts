import type { AfterSaleResponsibility, AfterSaleSummary } from "@mallbay/shared";
import { request } from "../../lib/request";

export type CreateAfterSalePayload = {
  orderId: string;
  description: string;
  issuePhotoUrls?: string[];
  issuePhotos?: AfterSalePhotoInputPayload[];
};

export type AfterSalePhotoInputPayload = {
  url: string;
  note?: string;
};

export type JudgeAfterSalePayload = {
  responsibility: AfterSaleResponsibility;
  penaltyWorkerUserId?: string;
  constructionIssueCategory?: string;
  penaltyAmountCents?: number;
  penaltyReason?: string;
  resolutionNote?: string;
};

export type SubmitAfterSaleEvidencePayload = {
  constructionPhotos?: AfterSalePhotoInputPayload[];
  supplementPhotos?: AfterSalePhotoInputPayload[];
};

export const afterSalesApi = {
  list: (storeId: string) =>
    request<AfterSaleSummary[]>(`/after-sales${toQueryString({ storeId })}`),

  detail: (id: string) => request<AfterSaleSummary>(`/after-sales/${id}`),

  create: (payload: CreateAfterSalePayload) =>
    request<AfterSaleSummary>("/after-sales", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  assign: (id: string, workerUserIds: string[]) =>
    request<AfterSaleSummary>(`/after-sales/${id}/assign`, {
      method: "POST",
      body: JSON.stringify({ workerUserIds })
    }),

  judge: (id: string, payload: JudgeAfterSalePayload) =>
    request<AfterSaleSummary>(`/after-sales/${id}/responsibility`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  submitEvidence: (id: string, payload: SubmitAfterSaleEvidencePayload) =>
    request<AfterSaleSummary>(`/after-sales/${id}/evidence`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  close: (id: string) =>
    request<AfterSaleSummary>(`/after-sales/${id}/close`, {
      method: "POST"
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
