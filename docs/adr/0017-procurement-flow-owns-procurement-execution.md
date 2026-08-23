---
status: accepted
---

# ProcurementFlow owns procurement execution

`ProcurementFlow` is the cross-module seam for procurement requirements, purchase orders, approval/cancellation, receiving orchestration, receipt-cost correction, and procurement queries. `ProcurementImplementation` is its internal persistence implementation. `InventoryLedger` remains the only stock-fact write seam: receiving uses a typed transaction command from ProcurementFlow, while batch, quantity, unit, provenance, and inventory idempotency remain owned by the Ledger.

`InventoryCatalog` owns warehouse and supplier master data. `InventoryService` remains a compatibility adapter only for non-procurement inventory entry points; procurement methods are removed from that adapter after migration. Purchase state, receipt cost records, purchase audits, and requirement/order status changes remain in the ProcurementFlow transaction.

Receiving keeps per-batch atomicity: a batch request may partially succeed, but each line commits or rolls back as one transaction. A receiving idempotency key is required at the ProcurementFlow seam; replaying the same key with a different receiving payload is rejected. No new idempotency protocol is introduced for create, approve, cancel, or requirement-to-order commands in this phase.
