import { request } from "@/lib/request";

export type ReturnListItem = { id: string; returnNo: string; status: string; reason: string; createdAt: string };

export function listSalesReturns(storeId: string) {
  return request<ReturnListItem[]>(`/sales-returns?storeId=${encodeURIComponent(storeId)}`);
}

export function listPurchaseReturns(storeId: string) {
  return request<ReturnListItem[]>(`/purchase-returns?storeId=${encodeURIComponent(storeId)}`);
}


function key() { return crypto.randomUUID(); }
export function submitSalesReturn(id: string) { return request<ReturnListItem>(`/sales-returns/${id}/submit`, { method: "POST", body: JSON.stringify({ idempotencyKey: key() }) }); }
export function approveSalesReturn(id: string) { return request<ReturnListItem>(`/sales-returns/${id}/approve`, { method: "POST", body: JSON.stringify({ idempotencyKey: key() }) }); }
export function submitPurchaseReturn(id: string) { return request<ReturnListItem>(`/purchase-returns/${id}/submit`, { method: "POST", body: JSON.stringify({ idempotencyKey: key() }) }); }
export function approvePurchaseReturn(id: string, approvalType: "BUSINESS" | "FINANCIAL") { return request<ReturnListItem>(`/purchase-returns/${id}/approve`, { method: "POST", body: JSON.stringify({ approvalType, idempotencyKey: key() }) }); }

export type ReturnDetailItem = { id: string; quantity: number | string; approvedQuantity?: number | string | null; receivedQuantity?: number | string | null; outboundQuantity?: number | string | null; status?: string; productId?: string; batchId?: string; inventoryBatchId?: string | null; inspectionStatus?: string | null };
export type ReturnDetailResponse = ReturnListItem & { details: ReturnDetailItem[]; actions?: unknown[]; settlements?: unknown[] };

function post<T>(path: string, body: Record<string, unknown>) {
  return request<T>(path, { method: "POST", body: JSON.stringify({ ...body, idempotencyKey: key() }) });
}
export function getSalesReturn(id: string) { return request<ReturnDetailResponse>("/sales-returns/" + id); }
export function getPurchaseReturn(id: string) { return request<ReturnDetailResponse>("/purchase-returns/" + id); }
export function receiveSalesReturn(id: string, body: { detailId: string; quantity: number; targetStatus: "AVAILABLE" | "INSPECTION" | "DAMAGED" }) { return post<ReturnListItem>("/sales-returns/" + id + "/receive", body); }
export function refundSalesReturn(id: string, body: { actualRefundCents: number; refundMethod: string; voucherId: string; waiveRemaining?: boolean; waiverReason?: string }) { return post<ReturnListItem>("/sales-returns/" + id + "/refund", body); }
export function outboundPurchaseReturn(id: string, body: { detailId: string; quantity: number }) { return post<ReturnListItem>("/purchase-returns/" + id + "/outbound", body); }
export function settlePurchaseReturn(id: string, body: { settlementMode: "SUPPLIER_REFUND" | "PAYABLE_OFFSET" | "EXCHANGE" | "MIXED"; refundAmountCents?: number; payableOffsetAmountCents?: number; exchangeQuantity?: number; supplierDocumentNo?: string; differenceReason?: string }) { return post<ReturnListItem>("/purchase-returns/" + id + "/settle", body); }
export function cancelSalesReturn(id: string, reason: string) { return post<ReturnListItem>("/sales-returns/" + id + "/cancel", { reason }); }
export function cancelPurchaseReturn(id: string, reason: string) { return post<ReturnListItem>("/purchase-returns/" + id + "/cancel", { reason }); }