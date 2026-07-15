import type {
  ExpenseApplicationSummary,
  FinanceApprovalStatus,
  PaginatedResult,
  PaymentDirection,
  PaymentRecordType,
} from "@mallbay/shared";
import { request, requestMultipart } from "../../lib/request";

export type CreateExpensePayload = {
  storeId: string;
  title: string;
  amountCents: number;
  reason: string;
};
export type CreateReimbursementPayload = CreateExpensePayload & {
  expenseId?: string;
  exceptionReason?: string;
};
export type FinanceApplicationType = "expenses" | "reimbursements";
export type FinanceAttachmentCategory =
  | "INVOICE"
  | "CONTRACT"
  | "PAYMENT_PROOF"
  | "OTHER";
export type FinanceListQuery = {
  storeId: string;
  scope?: "mine" | "all";
  status?: FinanceApprovalStatus;
  keyword?: string;
  page?: number;
  pageSize?: number;
};
export type PaymentRecordQuery = FinanceListQuery & {
  direction?: PaymentDirection;
  type?: PaymentRecordType;
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
};

export const financeApi = {
  overview: (storeId: string) =>
    request<FinanceOverview>(`/finance/overview${toQueryString({ storeId })}`),
  expenses: (query: FinanceListQuery | string) =>
    request<PaginatedResult<ExpenseApplicationSummary>>(
      `/finance/expenses${toQueryString(normalizeListQuery(query))}`,
    ),
  expense: (id: string) =>
    request<ExpenseApplicationDetail>(`/finance/expenses/${id}`),
  createExpense: (payload: CreateExpensePayload) =>
    request<ExpenseApplicationSummary>("/finance/expenses", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reviewExpense: (
    id: string,
    payload: { decision: "APPROVE" | "REJECT"; note?: string },
  ) =>
    request<ExpenseApplicationSummary>(`/finance/expenses/${id}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  withdrawExpense: (id: string, note?: string) =>
    request<ExpenseApplicationSummary>(`/finance/expenses/${id}/withdraw`, {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  resubmitExpense: (
    id: string,
    payload: Omit<CreateExpensePayload, "storeId">,
  ) =>
    request<ExpenseApplicationSummary>(`/finance/expenses/${id}/resubmit`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reimbursements: (query: FinanceListQuery | string) =>
    request<PaginatedResult<ExpenseApplicationSummary>>(
      `/finance/reimbursements${toQueryString(normalizeListQuery(query))}`,
    ),
  reimbursement: (id: string) =>
    request<ReimbursementApplicationDetail>(`/finance/reimbursements/${id}`),
  createReimbursement: (payload: CreateReimbursementPayload) =>
    request<ExpenseApplicationSummary>("/finance/reimbursements", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  reviewReimbursement: (
    id: string,
    payload: { decision: "APPROVE" | "REJECT"; note?: string },
  ) =>
    request<ExpenseApplicationSummary>(`/finance/reimbursements/${id}/review`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  payReimbursement: (
    id: string,
    payload: { paymentAccountId: string; note?: string; paidAt?: string },
  ) =>
    request<ReimbursementPaymentResult>(`/finance/reimbursements/${id}/pay`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  withdrawReimbursement: (id: string, note?: string) =>
    request<ExpenseApplicationSummary>(
      `/finance/reimbursements/${id}/withdraw`,
      { method: "POST", body: JSON.stringify({ note }) },
    ),
  resubmitReimbursement: (
    id: string,
    payload: Omit<CreateReimbursementPayload, "storeId">,
  ) =>
    request<ExpenseApplicationSummary>(
      `/finance/reimbursements/${id}/resubmit`,
      { method: "POST", body: JSON.stringify(payload) },
    ),
  uploadAttachment: (
    applicationType: FinanceApplicationType,
    id: string,
    category: FinanceAttachmentCategory,
    file: File,
  ) => {
    const formData = new FormData();
    formData.append("category", category);
    formData.append("file", file);
    return requestMultipart<FinanceAttachment>(
      `/finance/${applicationType}/${id}/attachments`,
      formData,
    );
  },
  paymentRecords: (query: PaymentRecordQuery | string) =>
    request<PaginatedResult<PaymentRecord>>(
      `/finance/payment-records${toQueryString(typeof query === "string" ? { storeId: query } : query)}`,
    ),
};

export type FinanceOverview = {
  expenseCount: number;
  reimbursementCount: number;
  pendingExpenseCount: number;
  pendingReimbursementCount: number;
  paymentCount: number;
};
export type FinanceAttachment = {
  id: string;
  category: FinanceAttachmentCategory;
  fileName: string;
  fileUrl: string;
  url?: string;
  createdAt: string;
};
export type FinanceApprovalRecord = {
  id: string;
  action: string;
  node: string;
  note?: string | null;
  createdAt: string;
  operator?: { username?: string | null } | null;
};
export type ExpenseApplicationDetail = ExpenseApplicationSummary & {
  approvalRecords: FinanceApprovalRecord[];
  attachments: FinanceAttachment[];
};
export type ReimbursementApplicationDetail = ExpenseApplicationDetail & {
  expenseId?: string | null;
  exceptionReason?: string | null;
  paymentAccount?: { id: string; name: string } | null;
  paymentRecord?: PaymentRecord | null;
};
export type PaymentRecord = {
  id: string;
  type: PaymentRecordType;
  direction: PaymentDirection;
  amountCents: number;
  accountId?: string | null;
  sourceId?: string | null;
  note?: string | null;
  occurredAt: string;
};

export type ReimbursementPaymentResult = {
  reimbursement: {
    id: string;
    status: FinanceApprovalStatus;
    paidAt?: string | null;
    paymentRecordId?: string | null;
  };
  paymentRecord: PaymentRecord;
  alreadyPaid: boolean;
};

function normalizeListQuery(
  query: FinanceListQuery | string,
): FinanceListQuery {
  return typeof query === "string" ? { storeId: query, scope: "all" } : query;
}

function toQueryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "") params.set(key, String(value));
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
