import type {
  ConstructionLocation,
  ConstructionType,
  OrderStatus,
  PaymentAccountType,
  PaymentType
} from "@mallbay/shared";
import { request } from "../../lib/request";

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
  remark?: string;
  deposit?: {
    accountId: string;
    amountCents: number;
    paymentType: PaymentType;
    paidAt: string;
  };
};

export type OrderListQuery = {
  storeId: string;
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
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

export type OrderPaymentPayload = {
  accountId: string;
  paymentType: PaymentType;
  amountCents: number;
  paidAt: string;
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

  addPayment: (id: string, payload: OrderPaymentPayload) =>
    request<unknown>(`/orders/${id}/payments`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  payments: (id: string) => request<unknown[]>(`/orders/${id}/payments`),

  createPaymentAccount: (payload: PaymentAccountPayload) =>
    request<unknown>("/payment-accounts", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  paymentAccounts: (storeId: string) =>
    request<unknown[]>(`/payment-accounts${toQueryString({ storeId })}`),

  updatePaymentAccount: (id: string, payload: Partial<Omit<PaymentAccountPayload, "storeId">>) =>
    request<unknown>(`/payment-accounts/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

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
