---
status: accepted
---

# Returns cash facts use the Finance writer

Returns continues to own refund and supplier-settlement workflow state, but all new `PaymentRecord` facts go through `CashFactWriter`. Sales refunds reuse the customer-receipt reversal writer; supplier refunds and their reversals use dedicated type/direction methods so the Finance seam owns provenance, idempotency and `reversalOfId` validation while the Returns transaction still updates its adjustment and action records atomically.
