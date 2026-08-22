---
status: accepted
---

# Finance owns the cash-fact write seam

`PaymentRecord` cash facts are written through the `CashFactWriter` module so order payments, customer receipts, reversals, rebates, reimbursements, and supplier refunds share one provenance and idempotency implementation. The owning workflow continues to write its own business facts in the same transaction; initial deposits and normal order payments migrated first, and ADR-0015 records the completed Returns follow-up.

The seam returns a small business result and accepts a narrow transaction context. Existing `FinanceService` writer methods remain compatibility adapters during and after migration; no new direct `PaymentRecord` writes are permitted.
