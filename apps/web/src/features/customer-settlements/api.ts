import { request } from "../../lib/request";

export type CustomerStatementStatus = "DRAFT" | "CONFIRMED" | "VOIDED";
export type CustomerReceiptStatus = "DRAFT" | "POSTED" | "REVERSED";

export type SettlementOrder = {
  id: string;
  orderNo: string;
  status: string;
  createdAt: string;
  appointmentDate?: string | null;
  vehicle?: {
    id: string;
    carPlate?: string | null;
    carModel?: string | null;
    department?: string | null;
  } | null;
  contactSnapshot?: {
    contactName?: string | null;
    role?: string | null;
    department?: string | null;
  } | null;
  amount?: {
    totalAmountCents: number;
    paidAmountCents: number;
    outstandingCents: number;
  } | null;
  constructionRecord?: { completedAt?: string | null } | null;
};

export type CustomerStatement = {
  id: string;
  statementNo: string;
  storeId: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  receivableCents: number;
  receivedCents: number;
  outstandingCents: number;
  status: CustomerStatementStatus;
  confirmedAt?: string | null;
  voidReason?: string | null;
  createdAt: string;
  items: Array<{
    id: string;
    orderAmountCents: number;
    paidAmountCents: number;
    outstandingCents: number;
    order: SettlementOrder;
  }>;
  settlement: {
    settlementPeriod: { start: string; end: string };
    includedOrderIds: string[];
    receivableCents: number;
    collectedCents: number;
    outstandingCents: number;
    allocationIds: string[];
  };
};

export type SettlementViewResult = {
  items: CustomerStatement[];
  semantics: {
    dateBasis: "ORDER_CREATED_AT";
    includedOrderKinds: ["COMPLETED", "WARRANTIED"];
    amountTypes: {
      receivable: "ORDER_TOTAL";
      collected: "ORDER_PAID";
      outstanding: "ORDER_OUTSTANDING";
    };
    allocationType: "CUSTOMER_STATEMENT_ITEM";
  };
  generatedAt: string;
};

export type SettlementCandidateViewResult = {
  items: SettlementOrder[];
  semantics: {
    dateBasis: "ORDER_CREATED_AT";
    includedOrderKinds: ["COMPLETED", "WARRANTIED"];
    amountTypes: {
      receivable: "ORDER_TOTAL";
      collected: "ORDER_PAID";
      outstanding: "ORDER_OUTSTANDING";
    };
  };
  generatedAt: string;
};

export type SettlementReceiptViewResult = {
  items: CustomerReceipt[];
  semantics: {
    dateBasis: "RECEIVED_AT";
    includedOrderKinds: ["COMPLETED", "WARRANTIED"];
    amountTypes: {
      collected: "RECEIPT_AMOUNT";
      allocated: "ORDER_PAYMENT";
      reversed: "REVERSAL_AMOUNT";
    };
    allocationType: "ORDER_PAYMENT";
  };
  generatedAt: string;
};

export type ReceiptAllocationPreview = {
  amountCents: number;
  availableCents: number;
  allocations: Array<{
    orderId: string;
    orderNo: string;
    amountCents: number;
  }>;
};

export type CustomerReceipt = {
  id: string;
  receiptNo: string;
  storeId: string;
  customerId: string;
  accountId: string;
  amountCents: number;
  receivedAt: string;
  payerName?: string | null;
  bankSerialNo?: string | null;
  note?: string | null;
  status: CustomerReceiptStatus;
  createdAt: string;
  reversedAmountCents: number;
  reversibleAmountCents: number;
  account?: { id: string; name: string; type: string } | null;
  createdBy?: { username?: string | null; nickname?: string | null } | null;
  allocations: Array<{
    id: string;
    orderId: string;
    amountCents: number;
    order: {
      id: string;
      orderNo: string;
      vehicle?: { carPlate?: string | null; carModel?: string | null } | null;
    };
    reversalAllocations: Array<{ amountCents: number }>;
  }>;
  reversals: Array<{
    id: string;
    amountCents: number;
    reason: string;
    createdAt: string;
    createdBy?: { username?: string | null; nickname?: string | null } | null;
  }>;
};

export type CreateStatementPayload = {
  storeId: string;
  customerId: string;
  periodStart: string;
  periodEnd: string;
  orderIds: string[];
};

export type ReceiptAllocationInput = {
  orderId: string;
  amountCents: number;
};

export type CreateReceiptPayload = {
  storeId: string;
  customerId: string;
  accountId: string;
  amountCents: number;
  receivedAt: string;
  payerName?: string;
  bankSerialNo?: string;
  note?: string;
  orderIds?: string[];
  allocations?: ReceiptAllocationInput[];
};

export const customerSettlementApi = {
  statementCandidates: (query: {
    storeId: string;
    customerId: string;
    periodStart?: string;
    periodEnd?: string;
  }) =>
    request<SettlementCandidateViewResult>(
      `/customer-statements/candidate-orders${toQueryString(query)}`
    ),

  statements: (query: {
    storeId: string;
    customerId?: string;
    status?: CustomerStatementStatus;
  }) =>
    request<SettlementViewResult>(
      `/customer-statements${toQueryString(query)}`
    ),

  createStatement: (payload: CreateStatementPayload) =>
    request<CustomerStatement>("/customer-statements", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  confirmStatement: (id: string) =>
    request<CustomerStatement>(`/customer-statements/${id}/confirm`, {
      method: "POST",
      body: JSON.stringify({})
    }),

  voidStatement: (id: string, reason: string) =>
    request<CustomerStatement>(`/customer-statements/${id}/void`, {
      method: "POST",
      body: JSON.stringify({ reason })
    }),

  previewReceipt: (payload: {
    storeId: string;
    customerId: string;
    amountCents: number;
    orderIds?: string[];
  }) =>
    request<ReceiptAllocationPreview>("/customer-receipts/preview-allocation", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  receipts: (query: {
    storeId: string;
    customerId?: string;
    status?: CustomerReceiptStatus;
  }) =>
    request<SettlementReceiptViewResult>(
      `/customer-receipts${toQueryString(query)}`
    ),

  createReceipt: (payload: CreateReceiptPayload) =>
    request<CustomerReceipt>("/customer-receipts", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  reverseReceipt: (
    id: string,
    payload: {
      amountCents: number;
      reason: string;
      allocations?: ReceiptAllocationInput[];
    }
  ) =>
    request<CustomerReceipt>(`/customer-receipts/${id}/reverse`, {
      method: "POST",
      body: JSON.stringify(payload)
    })
};

function toQueryString(
  query: Record<string, string | number | boolean | undefined>
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
