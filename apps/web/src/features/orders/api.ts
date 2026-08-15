import type {
  ConstructionLocation,
  ConstructionType,
  OrderStatus,
  PaymentAccountType,
  PaymentType,
  ProductUnit
} from "@mallbay/shared";
import { request } from "../../lib/request";

export type OrderPaymentStatus = "UNPAID" | "PARTIAL" | "PAID";

export type CreateOrderPayload = {
  storeId: string;
  executionStoreId?: string;
  customerId: string;
  vehicleId: string;
  salesPersonId?: string;
  constructionType: ConstructionType;
  constructionLocation: ConstructionLocation;
  constructionAddress?: string;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  items: { productId: string; quantity: number; unitPriceCents: number; salesUnit?: ProductUnit }[];
  /** Customer-facing construction service charge. */
  constructionChargeCents?: number;
  suggestedConstructionChargeCents?: number;
  constructionChargeAdjustmentReason?: string;
  /** @deprecated compatibility aliases for historic clients. */
  laborCostCents?: number;
  suggestedLaborCostCents?: number;
  laborCostAdjustmentReason?: string;
  pricingCalculationId?: string;
  estimatedCostCents?: number;
  remark?: string;
  deposit?: {
    accountId: string;
    amountCents: number;
    paymentType: PaymentType;
    paidAt: string;
  };
};

export type UpdateOrderCommercialsPayload = {
  items: Array<CreateOrderPayload["items"][number] & { id?: string }>;
  /** Customer-facing construction charge. */
  constructionChargeCents: number;
  /** Compatibility alias for API nodes not yet upgraded to constructionChargeCents. */
  laborCostCents?: number;
  remark?: string;
  changeReason: string;
};

export type ReturnOrderPayload = {
  reason: string;
};

export type LifecycleCommandOptions = {
  commandId: string;
  expectedVersion: number;
};

export type OrderLifecycleClientEventPayload = {
  event: "RESULT_UNKNOWN" | "ORIGINAL_COMMAND_RETRY_RECOVERED" | "VIEW_LATEST_VERSION" | "CREATE_NEW_INTENT";
  surface: "ORDER_CREATE" | "ORDER_LIST" | "CONSTRUCTION_OFFLINE";
  commandType?: "CREATE_ORDER" | "DISPATCH" | "START_CONSTRUCTION" | "COMPLETE_CONSTRUCTION" | "QUALITY_CHECK" | "FINAL_DELIVERY" | "CANCEL" | "RETURN_TO_PENDING" | "OFFLINE_SYNC";
};

export type OrderAmendmentRequestPayload = { reason: string };
export type ReviewOrderAmendmentRequestPayload = { action: "APPROVE" | "REJECT"; reviewNote: string };

export type OrderListQuery = {
  storeId: string;
  page?: number;
  pageSize?: number;
  status?: OrderStatus;
  constructionType?: ConstructionType;
  paymentStatus?: OrderPaymentStatus;
  /** 已完工或已质保且可进入开票流程的订单。 */
  invoiceable?: boolean;
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
  isActive?: boolean;
};

export type SalesOrderExportDimension = "customer" | "date" | "product";

export type SalesOrderExportDetail = {
  orderId: string;
  orderNo: string;
  customerName: string;
  vehicle: string;
  status: OrderStatus;
  constructionType: ConstructionType;
  appointmentDate?: string | null;
  appointmentTimeSlot?: string | null;
  createdAt: string;
  productId: string;
  productBrand: string;
  productName: string;
  productModel: string;
  productSpecification?: string | null;
  quantity: number;
  salesUnit?: ProductUnit | null;
  unitPriceCents: number;
  itemAmountCents: number;
  productAmountCents: number;
  constructionChargeCents: number;
  orderTotalCents: number;
  paidAmountCents: number;
  outstandingCents: number;
  estimatedMaterialCostCents?: number | null;
  estimatedConstructionCostCents?: number | null;
  estimatedTotalCostCents?: number | null;
  costCompleteness?: "COMPLETE" | "TEMPORARY" | "MISSING" | null;
  actualMaterialCostCents?: number | null;
  actualConstructionCostCents?: number | null;
  actualTotalCostCents?: number | null;
  actualGrossProfitCents?: number | null;
  actualGrossMarginBps?: number | null;
  costSettlementStatus?: string | null;
};

export type SalesOrderExportQuery = Omit<OrderListQuery, "page" | "pageSize"> & {
  exportDimension: SalesOrderExportDimension;
};

export type OrderPaymentPayload = {
  accountId: string;
  paymentType: PaymentType;
  amountCents: number;
  paidAt: string;
  idempotencyKey?: string;
};

export type CopyOrderToDraftPayload = {
  vehicleId: string;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  idempotencyKey: string;
};

export type CopyOrderToDraftResponse = {
  idempotencyKey: string;
  source: { orderId: string; orderNo: string };
  values: import("./create-order-form").CreateOrderFormValues;
  validation: {
    pricingRecalculationRequired: true;
    capacityChecked: boolean;
    copiedFields: string[];
    excludedFields: string[];
  };
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

export type LifecycleActionCapability = {
  visible: boolean;
  enabled: boolean;
  blockingReasonCodes: string[];
};

export type AuthoritativeLifecycleResult = {
  orderId: string;
  lifecycleVersion: number;
  currentStage: string;
  blockingReasonCodes: string[];
  capabilities: Record<string, LifecycleActionCapability>;
  actionImpactSummaries: Record<string, string>;
  generatedAt: string;
};

export type HistoricalVerificationOrder = {
  id: string;
  orderNo: string;
  status: string;
  storeId: string;
  lifecycleVersion: number;
  historicalWarning?: string | null;
  verified: boolean;
  customer?: { name?: string | null; companyName?: string | null } | null;
  vehicle?: { carPlate?: string | null; carModel?: string | null } | null;
  constructionRecord?: { id: string; qualityResult?: string | null } | null;
  verification?: { id: string; issueCodes: string[]; status: string; detectedAt: string; resolutionSummary?: unknown } | null;
};

export const orderApi = {
  recordLifecycleClientEvent: (payload: OrderLifecycleClientEventPayload) =>
    request<{ accepted: true }>("/orders/lifecycle/client-events", {
      method: "POST",
      body: JSON.stringify({ ...payload, source: "WEB" })
    }).catch(() => ({ accepted: true as const })),

  create: (payload: CreateOrderPayload, commandId: string) =>
    request<{ id: string; orderNo: string }>("/orders", {
      method: "POST",
      headers: { "Idempotency-Key": commandId },
      body: JSON.stringify(payload)
    }),

  list: (query: OrderListQuery) =>
    request<{ items: unknown[]; total: number; page: number; pageSize: number }>(
      `/orders${toQueryString(query)}`
    ),

  exportDetails: (query: SalesOrderExportQuery) =>
    request<SalesOrderExportDetail[]>(`/orders/export-details${toQueryString(query)}`),

  detail: (id: string) => request<unknown>(`/orders/${id}`),

  lifecycle: (id: string) => request<AuthoritativeLifecycleResult>(`/orders/${id}/lifecycle`),

  lifecycleBatch: (orderIds: string[]) =>
    request<Record<string, { ok: true; value: AuthoritativeLifecycleResult } | { ok: false; error: { code: string } }>>(
      `/orders/lifecycle/batch${toQueryString({ orderIds: orderIds.join(",") })}`
    ),

  historicalVerification: (storeId: string, q?: string) =>
    request<HistoricalVerificationOrder[]>(`/orders/historical-verification${toQueryString({ storeId, ...(q ? { q } : {}) })}`),

  resolveHistoricalVerification: (id: string, payload: { summary: string; factRefs: string[] }, command: LifecycleCommandOptions) =>
    request<{ orderId: string; verificationCaseId: string; status: string }>(`/orders/${id}/historical-verification`, {
      method: "POST",
      headers: lifecycleCommandHeaders(command),
      body: JSON.stringify(payload)
    }),

  copyToDraft: (id: string, payload: CopyOrderToDraftPayload) =>
    request<CopyOrderToDraftResponse>(`/orders/${id}/copy`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  auditEvents: (id: string) => request<OrderAuditEvent[]>(`/orders/${id}/audit-events`),

  updateCommercials: (id: string, payload: UpdateOrderCommercialsPayload) =>
    request<{ id: string }>(`/orders/${id}/commercials`, {
      method: "PATCH",
      body: JSON.stringify(payload)
    }),

  cancel: (id: string, payload: ReturnOrderPayload, command: LifecycleCommandOptions) =>
    request<{ id: string; status: OrderStatus }>(`/orders/${id}/cancel`, {
      method: "POST",
      headers: lifecycleCommandHeaders(command),
      body: JSON.stringify(payload)
    }),

  returnToPendingDispatch: (id: string, payload: ReturnOrderPayload, command: LifecycleCommandOptions) =>
    request<{ id: string; status: OrderStatus }>(`/orders/${id}/return-to-pending`, {
      method: "POST",
      headers: lifecycleCommandHeaders(command),
      body: JSON.stringify(payload)
    }),

  finalizeDelivery: (id: string, command: LifecycleCommandOptions) =>
    request<{ orderId: string; warrantyId: string; status: string }>(`/orders/${id}/final-delivery`, {
      method: "POST",
      headers: lifecycleCommandHeaders(command)
    }),

  createAmendmentRequest: (id: string, payload: OrderAmendmentRequestPayload) =>
    request<{ id: string; status: string }>(`/orders/${id}/amendment-requests`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  reviewAmendmentRequest: (id: string, requestId: string, payload: ReviewOrderAmendmentRequestPayload) =>
    request<{ id: string; status: string }>(`/orders/${id}/amendment-requests/${requestId}/review`, {
      method: "POST",
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

function lifecycleCommandHeaders(command: LifecycleCommandOptions) {
  return {
    "Idempotency-Key": command.commandId,
    "X-Lifecycle-Version": String(command.expectedVersion)
  };
}

function toQueryString(query: Record<string, string | number | boolean | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
