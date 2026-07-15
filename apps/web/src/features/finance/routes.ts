export const financeRoutes = {
  overview: "/finance",
  expenses: "/finance/expenses",
  reimbursements: "/finance/reimbursements",
  accounts: "/finance/accounts",
  ledger: "/finance/ledger"
} as const;

export type FinanceRouteKey = keyof typeof financeRoutes;

export function getFinanceRoute(key: FinanceRouteKey) {
  return financeRoutes[key];
}
