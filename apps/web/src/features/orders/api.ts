import type {
  ConstructionLocation,
  ConstructionType,
  OrderStatus,
  PaymentAccountType,
  PaymentType
} from "@mallbay/shared";
import { request } from "../../lib/request";

export type OrderPaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export type CreateOrderPayload = {
  storeId: string;
  customerId: string;
  vehicleId?: string;
  constructionType: ConstructionType;
  constructionLocation: ConstructionLocation;
  constructionAddress?: string;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  items: { productId: string; quantity: number; unitPriceCents: number }[];
  laborCostCents: number;
  suggestedLaborCostCents?: number;
  laborCostAdjustmentReason?: string;
  remark?: string;
  deposit?: {
    accountId: string;
    amountCents: number;
    paymentType: PaymentType;
    paidAt: string;
  };
};

export type UpdateOrderCommercialsPayload = {
  items: CreateOrderPayload["items"];
  laborCostCents: number;
  remark?: string;
  changeReason: string;
};

export type OrderListQuery = {
  storeId: string;
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
  constructionType?: ConstructionType;
  paymentStatus?: OrderPaymentStatus;
  createdFrom?: string;
  createdTo?: string;
  q?: string;
};

export type PaymentAccountPayload = {
  storeId: string;
  name: string;
  type: PaymentAccountType;
  bankName?: string;
  accountNo?: string;
  isDefault?: boolean;
};

export type UpdatePaymentAccountPayload = Partial<Omit<PaymentAccountPayload, "storeId">> & {
  changeReason: string;
};

export type PaymentAccountOption = PaymentAccountPayload & {
  id: string;
};

export type OrderPaymentPayload = {
  accountId: string;
  paymentType: PaymentType;
  amountCents: number;
  paidAt: string;
};

export type OrderAuditEvent = {
  id: string;
  action: string;
  actorId?: string | null;
  actor?: { id: string; username?: string | null; nickname?: string | null } | null;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export const orderApi = {
  create: (payload: CreateOrderPayload) =>
    request<{ id: string; orderNo: string }>("/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  list: (query: OrderListQuery) =>
    request<{ items: unknown[]; total: number; page: number; pageSize: number }>(
      `/orders${toQueryString(query)}`
    ),

  detail: (id: string) => request<unknown>(`/orders/${id}`),

  auditEvents: (id: string) => request<OrderAuditEvent[]>(`/orders/${id}/audit-events`),

  updateCommercials: (id: string, payload: UpdateOrderCommercialsPayload) =>
    request<{ id: string }>(`/orders/${id}/commercials`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  addPayment: (id: string, payload: OrderPaymentPayload) =>
    request<unknown>(`/orders/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  payments: (id: string) => request<unknown[]>(`/orders/${id}/payments`),

  createPaymentAccount: (payload: PaymentAccountPayload) =>
    request<PaymentAccountOption>("/payment-accounts", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  paymentAccounts: (storeId: string) =>
    request<PaymentAccountOption[]>(`/payment-accounts${toQueryString({ storeId })}`),

  updatePaymentAccount: (id: string, payload: UpdatePaymentAccountPayload) =>
    request<unknown>(`/payment-accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  paymentAccountAuditEvents: (id: string) =>
    request<OrderAuditEvent[]>(`/payment-accounts/${id}/audit-events`),

  removePaymentAccount: (id: string) =>
    request<unknown>(`/payment-accounts/${id}`, { method: "DELETE" })
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
