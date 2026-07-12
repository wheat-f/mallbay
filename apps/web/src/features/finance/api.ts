import type { ExpenseApplicationSummary, FinanceApprovalStatus } from "@mallbay/shared";
import { request } from "../../lib/request";

export type CreateExpensePayload = {
  storeId: string;
  title: string;
  amountCents: number;
  reason: string;
};

export type CreateReimbursementPayload = CreateExpensePayload & {
  expenseId?: string;
};

export const financeApi = {
  expenses: (storeId: string) =>
    request<ExpenseApplicationSummary[]>(`/finance/expenses${toQueryString({ storeId })}`),

  createExpense: (payload: CreateExpensePayload) =>
    request<ExpenseApplicationSummary>("/finance/expenses", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  reimbursements: (storeId: string) =>
    request<ExpenseApplicationSummary[]>(`/finance/reimbursements${toQueryString({ storeId })}`),

  createReimbursement: (payload: CreateReimbursementPayload) =>
    request<ExpenseApplicationSummary>("/finance/reimbursements", {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  reviewReimbursement: (id: string, payload: { status: FinanceApprovalStatus; note?: string }) =>
    request<ExpenseApplicationSummary>(`/finance/reimbursements/${id}/review`, {
      method: "POST",
      body: JSON.stringify(payload)
    }),

  paymentRecords: (storeId: string) =>
    request<unknown[]>(`/finance/payment-records${toQueryString({ storeId })}`)
};

function toQueryString(query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}
