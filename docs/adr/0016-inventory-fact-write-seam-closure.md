---
status: accepted
---

# InventoryLedger owns cross-module stock-fact writes

`InventoryLedger` is the only cross-module stock-fact write seam. `InventoryImplementation` is the internal persistence implementation behind the seam and the legacy backoffice adapter; `InventoryService` remains only as a compatibility adapter without direct Prisma stock writes. Inventory, order lifecycle, construction, returns, and procurement workflows keep ownership of their business state, but call typed Ledger commands for batch quantity, allocation, and movement facts.

The Ledger accepts a narrow transaction context when a workflow already owns a larger atomic transaction. Standalone inventory commands open their own transaction. Callers must not provide arbitrary movement types or update inventory batches directly; the Ledger fixes movement provenance, quantity invariants, and idempotency semantics.
