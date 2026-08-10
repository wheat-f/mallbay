export const FINANCE_CAPABILITIES = {
  application: { capability: "finance.application", submit: "submit" },
  document: { capability: "finance.document", read: "read", attach: "attach" },
  expense: { capability: "finance.expense", review: "review" },
  reimbursement: { capability: "finance.reimbursement", review: "review", pay: "pay" }
} as const;
