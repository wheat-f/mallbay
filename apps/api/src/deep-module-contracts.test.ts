import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";
import path from "node:path";
import { CustomerAccount } from "./customers/domain/customer-account";
import { SettlementView } from "./customer-settlements/domain/settlement-view";
import { FinancialDocumentQuery } from "./finance/domain/financial-document-query";
import { NotificationDispatcher } from "./notifications/notification-dispatcher";
import { PricingDecision } from "./pricing/domain/pricing-decision";
import { ProcurementFlow } from "./inventory/procurement-flow";
import { ProcurementImplementation } from "./inventory/procurement-implementation";
import { InventoryCatalog } from "./inventory/inventory-catalog";
import { InventoryLedger } from "./inventory/domain/inventory-ledger";
import { ConstructionFulfillment } from "./construction/construction-fulfillment";
import { FinanceService } from "./finance/finance.service";
import { CashFactWriter } from "./finance/domain/cash-fact-writer";
import { SettlementWorkflow } from "./customer-settlements/domain/settlement-workflow";
import { InventoryModule } from "./inventory/inventory.module";
import { InventoryService } from "./inventory/inventory.service";
import { ConstructionModule } from "./construction/construction.module";
import { ConstructionService } from "./construction/construction.service";
import { CrossStoreConstructionService } from "./construction/cross-store-construction.service";
import { CustomerSettlementsModule } from "./customer-settlements/customer-settlements.module";
import { CustomerSettlementsService } from "./customer-settlements/customer-settlements.service";
import { FinanceModule } from "./finance/finance.module";
import { FinanceQueryService } from "./finance/finance-query.service";
import { ReportsModule } from "./reports/reports.module";
import { ReportsService } from "./reports/reports.service";
import { OrdersModule } from "./orders/orders.module";
import { OrderLifecycle } from "./orders/domain/order-lifecycle";
import { CreateOrderUseCase } from "./orders/use-cases/create-order.use-case";

test("P1/P2 module seams delegate business calls without exposing implementations", async () => {
  const pricing = new PricingDecision({
    calculate: async () => ({ snapshotId: "snapshot-1" }),
    validateOrder: async (_user: unknown, input: unknown) => ({ validated: true, input })
  } as never);
  assert.deepEqual(await pricing.decide({} as never, {} as never), { snapshotId: "snapshot-1" });
  assert.deepEqual(
    await pricing.validateOrder({} as never, { pricingCalculationId: "calculation-1" } as never),
    { validated: true, input: { pricingCalculationId: "calculation-1" } }
  );

  const customer = new CustomerAccount({ detail: async () => ({ id: "customer-1" }) } as never);
  assert.deepEqual(await customer.getCustomerSummary({} as never, "customer-1"), { id: "customer-1" });

  const settlement = new SettlementView({ listStatements: async () => [] } as never);
  const settlementView = await settlement.getSettlementView({} as never, {} as never);
  assert.deepEqual(settlementView.items, []);
  assert.equal(settlementView.semantics.dateBasis, "ORDER_CREATED_AT");
  assert.equal(typeof settlementView.generatedAt, "string");
  const projected = await new SettlementView({
    listStatements: async () => [{
      id: "statement-1",
      statementNo: "STM-1",
      storeId: "store-1",
      customerId: "customer-1",
      periodStart: new Date("2026-08-01T00:00:00.000Z"),
      periodEnd: new Date("2026-08-31T23:59:59.999Z"),
      receivableCents: 10000,
      receivedCents: 3000,
      outstandingCents: 7000,
      status: "DRAFT",
      confirmedAt: null,
      voidReason: null,
      createdAt: new Date("2026-08-10T00:00:00.000Z"),
      customer: { id: "customer-1", name: "企业客户", companyName: "企业客户", customerType: "COMPANY" },
      confirmedBy: null,
      items: [{
        id: "statement-item-1",
        orderAmountCents: 10000,
        paidAmountCents: 3000,
        outstandingCents: 7000,
        order: {
          id: "order-1",
          orderNo: "ORD-1",
          status: "COMPLETED",
          createdAt: new Date("2026-08-02T00:00:00.000Z"),
          vehicle: { id: "vehicle-1", carPlate: "京A00001", brand: "宝马", model: "5系", department: null },
          contactSnapshot: { contactName: "联系人", role: null, department: null }
        }
      }]
    }]
  } as never).getSettlementView({} as never, {} as never);
  assert.deepEqual(projected.items[0]?.settlement, {
    settlementPeriod: { start: "2026-08-01T00:00:00.000Z", end: "2026-08-31T23:59:59.999Z" },
    includedOrderIds: ["order-1"],
    receivableCents: 10000,
    collectedCents: 3000,
    outstandingCents: 7000,
    allocationIds: ["statement-item-1"]
  });
  const candidateView = await new SettlementView({
    listStatementCandidates: async () => [{
      id: "order-1",
      orderNo: "ORD-1",
      status: "COMPLETED",
      createdAt: new Date("2026-08-02T00:00:00.000Z"),
      appointmentDate: null,
      vehicle: { id: "vehicle-1", carPlate: "京A00001", carModel: "宝马5系", department: null },
      contactSnapshot: { contactName: "联系人", role: null, department: null },
      amount: { totalAmountCents: 10000, paidAmountCents: 3000, outstandingCents: 7000 },
      constructionRecord: { completedAt: new Date("2026-08-03T00:00:00.000Z") }
    }]
  } as never).listCandidateOrders({} as never, {} as never);
  assert.equal(candidateView.items[0]?.createdAt, "2026-08-02T00:00:00.000Z");
  assert.equal(candidateView.semantics.amountTypes.outstanding, "ORDER_OUTSTANDING");

  const finance = new FinancialDocumentQuery({
    getExpenseDetail: async () => ({ kind: "expense" }),
    getReimbursementDetail: async () => ({ kind: "reimbursement" }),
    listPaymentRecords: async () => ({ items: [] })
    } as never, {} as never, { can: async () => true } as never);
  assert.deepEqual(await finance.getDocumentView({} as never, { kind: "expense", id: "expense-1" }), { kind: "expense" });
  const document = await finance.getDocument({} as never, { kind: "expense", id: "expense-1" });
  assert.equal(document.kind, "expense");
  assert.equal(typeof document.generatedAt, "string");
  assert.deepEqual(await finance.listCashFacts({} as never, {} as never), { items: [] });
  const tracedFinance = new FinancialDocumentQuery({
    getExpenseDetail: async () => ({ id: "expense-1", createdAt: new Date("2026-08-09T00:00:00.000Z"), status: "APPROVED", applicantId: "user-1", approvalRecords: [{ id: "approval-1", createdAt: new Date("2026-08-09T01:00:00.000Z"), action: "APPROVED", operatorId: "manager-1" }], reimbursements: [{ id: "reimbursement-1", amountCents: 100, status: "PAID", paymentRecordId: "payment-1" }] }),
    getReimbursementDetail: async () => ({ expenseId: "expense-1", paymentRecord: { id: "payment-1" } })
    } as never, undefined, { can: async () => true } as never);
  assert.deepEqual(await tracedFinance.traceSource({} as never, { kind: "expense", id: "expense-1" }), {
    document: { kind: "expense", id: "expense-1" },
    source: { kind: "expense", id: "expense-1" },
    reimbursements: [{ id: "reimbursement-1", amountCents: 100, status: "PAID", paymentRecordId: "payment-1" }],
    cashFacts: []
  });
  const timeline = await tracedFinance.getTimeline({} as never, { kind: "expense", id: "expense-1" });
  assert.deepEqual(timeline.events.map((event) => event.type), ["DOCUMENT", "APPROVAL"]);

  const notifications = new NotificationDispatcher({
    send: async () => ({ id: "notification-1" })
  } as never);
  assert.deepEqual(
    await notifications.dispatch({ userId: "user-1", type: "ORDER_BALANCE_DUE" as never, payload: { orderId: "order-1" } }),
    { id: "notification-1" }
  );
});

test("deep modules do not re-export compatibility implementations", () => {
  const exported = (moduleType: unknown) => new Set((Reflect.getMetadata("exports", moduleType) ?? []) as unknown[]);

  assert.equal(exported(InventoryModule).has(InventoryService), false);
  assert.equal(exported(ConstructionModule).has(ConstructionService), false);
  assert.equal(exported(ConstructionModule).has(CrossStoreConstructionService), false);
  assert.equal(exported(CustomerSettlementsModule).has(CustomerSettlementsService), false);
  assert.equal(exported(FinanceModule).has(FinanceQueryService), false);
  assert.equal(exported(FinanceModule).has(CashFactWriter), true);
  assert.equal(exported(ReportsModule).has(ReportsService), false);
});

test("OrdersModule exposes only OrderLifecycle for lifecycle writes", () => {
  const exports = new Set((Reflect.getMetadata("exports", OrdersModule) ?? []) as unknown[]);
  assert.equal(exports.has(OrderLifecycle), true);
  assert.equal(exports.has(CreateOrderUseCase), false);
});

test("production source keeps CreateOrderUseCase behind the OrderLifecycle seam", () => {
  const sourceRoot = path.resolve(__dirname);
  const allowed = new Set([
    path.join(sourceRoot, "orders", "domain", "order-lifecycle.ts"),
    path.join(sourceRoot, "orders", "orders.module.ts"),
    path.join(sourceRoot, "orders", "use-cases", "create-order.use-case.ts")
  ]);
  const violations: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      const source = readFileSync(absolute, "utf8");
      if (source.includes("CreateOrderUseCase") && !allowed.has(absolute)) violations.push(path.relative(sourceRoot, absolute));
      if (source.includes("registerConstructionHandler") || /orderLifecycle\s*\?/.test(source)) violations.push(path.relative(sourceRoot, absolute));
    }
  };
  visit(sourceRoot);
  assert.deepEqual(violations, []);
});

test("order cash-fact callers use CashFactWriter instead of PaymentRecord directly", () => {
  const sourceRoot = path.resolve(__dirname);
  const allowed = new Set([
    path.join(sourceRoot, "finance", "domain", "cash-fact-writer.ts"),
    path.join(sourceRoot, "returns", "returns.service.ts")
  ]);
  const violations: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts") || allowed.has(absolute)) continue;
      const source = readFileSync(absolute, "utf8");
      if (source.includes("paymentRecord.create")) violations.push(path.relative(sourceRoot, absolute));
    }
  };
    visit(path.join(sourceRoot, "orders"));
    visit(path.join(sourceRoot, "finance"));
    visit(path.join(sourceRoot, "returns"));
  assert.deepEqual(violations, []);
});

test("cross-module stock-fact callers use InventoryLedger instead of direct writes", () => {
  const sourceRoot = path.resolve(__dirname);
  const callers = [
    path.join(sourceRoot, "orders"),
    path.join(sourceRoot, "construction"),
    path.join(sourceRoot, "returns")
  ];
  const violations: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!entry.name.endsWith(".ts") || entry.name.endsWith(".test.ts")) continue;
      const source = readFileSync(absolute, "utf8");
      if (/inventoryBatch\.(create|update|upsert|delete)|inventoryMovement\.create(?:Many)?|orderInventoryAllocation\.(create|update|delete)/.test(source)) {
        violations.push(path.relative(sourceRoot, absolute));
      }
    }
  };
  callers.forEach(visit);
  assert.deepEqual(violations, []);
  assert.equal(new Set((Reflect.getMetadata("exports", InventoryModule) ?? []) as unknown[]).has(InventoryLedger), true);
});

test("InventoryService is only a compatibility adapter after the deletion gate", () => {
  const sourceRoot = path.resolve(__dirname);
  const adapterSource = readFileSync(path.join(sourceRoot, "inventory", "inventory.service.ts"), "utf8");

  assert.match(adapterSource, /InventoryImplementation/);
  assert.doesNotMatch(
    adapterSource,
    /inventoryBatch\.(create|update|upsert|delete)|inventoryMovement\.create(?:Many)?|orderInventoryAllocation\.(create|update|delete)/
  );
});

test("ProcurementFlow exposes the purchase seam for receipt operations", async () => {
  const flow = new ProcurementFlow({
    receivePurchaseItem: async (_user: unknown, itemId: string, input: unknown) => ({ itemId, input })
  } as never);

  assert.deepEqual(await flow.receive({} as never, "item-1", { quantity: 2 } as never), {
    itemId: "item-1",
    input: { quantity: 2 }
  });
});

test("ProcurementFlow owns the purchase lifecycle boundary including cancellation", async () => {
  const flow = new ProcurementFlow({
    cancelPurchaseOrder: async (_user: unknown, orderId: string, input: unknown) => ({ orderId, input })
  } as never);

  assert.deepEqual(await flow.cancelOrder({} as never, "po-1", { reason: "duplicate" } as never), {
    orderId: "po-1",
    input: { reason: "duplicate" }
  });
});

test("ProcurementFlow is the sole procurement execution seam", () => {
  const sourceRoot = path.resolve(__dirname);
  const flowSource = readFileSync(path.join(sourceRoot, "inventory", "procurement-flow.ts"), "utf8");
  const procurementSource = readFileSync(path.join(sourceRoot, "inventory", "procurement-implementation.ts"), "utf8");
  const inventorySource = readFileSync(path.join(sourceRoot, "inventory", "inventory-implementation.ts"), "utf8");
  const serviceSource = readFileSync(path.join(sourceRoot, "inventory", "inventory.service.ts"), "utf8");
  const providers = new Set((Reflect.getMetadata("providers", InventoryModule) ?? []) as unknown[]);

  assert.match(flowSource, /ProcurementImplementation/);
  assert.doesNotMatch(flowSource, /InventoryService/);
  assert.doesNotMatch(procurementSource, /inventoryBatch\.(create|update|upsert|delete)|inventoryMovement\.create(?:Many)?/);
  assert.doesNotMatch(inventorySource, /async (createPurchaseOrder|approvePurchaseOrder|cancelPurchaseOrder|receivePurchaseItem|receivePurchaseItemBatches)\b/);
  assert.doesNotMatch(serviceSource, /createPurchaseOrder|approvePurchaseOrder|cancelPurchaseOrder|receivePurchaseItem/);
  assert.equal(providers.has(ProcurementImplementation), true);
});

test("InventoryCatalog owns inventory and supplier master-data access", async () => {
  const calls: string[] = [];
  const implementation = {
    listWarehouses: async () => { calls.push("list-warehouses"); return []; },
    createWarehouse: async () => { calls.push("create-warehouse"); return {}; },
    updateWarehouse: async () => { calls.push("update-warehouse"); return {}; },
    listSuppliers: async () => { calls.push("list-suppliers"); return []; },
    createSupplier: async () => { calls.push("create-supplier"); return {}; },
    updateSupplier: async () => { calls.push("update-supplier"); return {}; },
    createSupplierContact: async () => { calls.push("create-contact"); return {}; },
    createSupplierRatingHistory: async () => { calls.push("create-rating"); return {}; }
  } as never;
  const catalog = new InventoryCatalog(implementation);

  await catalog.listWarehouses({} as never, "store-1");
  await catalog.createWarehouse({} as never, {} as never);
  await catalog.updateWarehouse({} as never, "warehouse-1", {} as never);
  await catalog.listSuppliers({} as never, "store-1");
  await catalog.createSupplier({} as never, {} as never);
  await catalog.updateSupplier({} as never, "supplier-1", {} as never);
  await catalog.createSupplierContact({} as never, "supplier-1", {} as never);
  await catalog.createSupplierRatingHistory({} as never, "supplier-1", {} as never);

  assert.deepEqual(calls, [
    "list-warehouses", "create-warehouse", "update-warehouse", "list-suppliers",
    "create-supplier", "update-supplier", "create-contact", "create-rating"
  ]);
});

test("ConstructionFulfillment returns a stable task view without exposing Prisma records", async () => {
  const facts = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        orderNo: "ORD-1",
        storeId: "store-1",
        executionStoreId: null,
        status: "IN_CONSTRUCTION",
        appointmentDate: new Date("2026-08-09T00:00:00.000Z"),
        appointmentTimeSlot: "09:00-10:00",
        constructionLocation: "STORE",
        outsideAddress: null,
        amount: { paidAmountCents: 100, outstandingCents: 0 },
        inventoryAllocations: [],
        constructionRecord: {
          id: "record-1",
          status: "IN_CONSTRUCTION",
          startedAt: new Date("2026-08-09T01:00:00.000Z"),
          completedAt: null,
          actualMinutes: 20,
          overtimeMinutes: 0,
          qualityResult: null,
          qualityCheckedAt: null,
          photos: [{ id: "photo-1", stage: "BEFORE", url: "/photo.jpg", uploadedById: "worker-1" }]
        },
        warranty: null
      })
    }
  };
  const fulfillment = new ConstructionFulfillment({} as never, {} as never, {
    getLifecycle: () => ({ currentStage: "IN_CONSTRUCTION", paymentStatus: "PAID", inventoryStatus: "NONE", qualityStatus: "NOT_CHECKED", warrantyStatus: "NONE", blockingReasons: [], capabilities: { canCollectBalance: false, canGenerateWarranty: false, canStartRework: false, canCompleteOrder: false } }),
    getAuthoritativeLifecycle: async () => ({ orderId: "order-1", lifecycleVersion: 1, currentStage: "IN_CONSTRUCTION", blockingReasonCodes: [], capabilities: {} })
  } as never, facts as never, { can: async () => true } as never);

  const view = await fulfillment.getFulfillmentView({ id: "auditor-1", isAuditor: true } as never, "order-1");
  assert.equal(view.order.executionStoreId, "store-1");
  assert.equal(view.order.appointmentDate, "2026-08-09T00:00:00.000Z");
  assert.equal(view.construction?.startedAt, "2026-08-09T01:00:00.000Z");
  assert.deepEqual(view.construction?.photos, [{ id: "photo-1", stage: "BEFORE", url: "/photo.jpg", uploadedById: "worker-1" }]);
  assert.equal(view.workflow.currentStage, "IN_CONSTRUCTION");
});

test("ConstructionFulfillment maps assignment records into a stable fulfillment list", async () => {
  const fulfillment = new ConstructionFulfillment({
    listAssignments: async () => [{
      id: "record-1",
      orderId: "order-1",
      storeId: "execution-store-1",
      status: "IN_CONSTRUCTION",
      qualityResult: null,
      photos: [{ id: "photo-1", stage: "BEFORE" }],
      assignments: [{ workerUserId: "worker-1" }],
      order: {
        id: "order-1",
        orderNo: "ORD-1",
        storeId: "source-store-1",
        executionStoreId: "execution-store-1",
        status: "IN_CONSTRUCTION",
        lifecycleVersion: 1,
        appointmentDate: new Date("2026-08-09T00:00:00.000Z"),
        appointmentTimeSlot: "09:00-10:00",
        constructionLocation: "STORE",
        customer: { name: "客户", companyName: null },
        vehicle: { carPlate: "京A00001", carModel: "车型", carColor: "黑" },
        amount: { paidAmountCents: 100, outstandingCents: 0 },
        inventoryAllocations: [],
        warranty: null
      }
    }]
  } as never, {} as never, {
    getLifecycle: () => ({ currentStage: "IN_CONSTRUCTION", paymentStatus: "PAID", inventoryStatus: "NONE", qualityStatus: "NOT_CHECKED", warrantyStatus: "NONE", blockingReasons: [], capabilities: { canCollectBalance: false, canGenerateWarranty: false, canStartRework: false, canCompleteOrder: false } }),
    listAuthoritativeLifecycle: async () => ({ "order-1": { ok: true, value: { orderId: "order-1", lifecycleVersion: 1, currentStage: "IN_CONSTRUCTION", blockingReasonCodes: [], capabilities: {} } } })
  } as never, { order: { findMany: async () => [] } } as never, { can: async () => true } as never);

  const result = await fulfillment.listFulfillments({ id: "worker-1" } as never, { storeId: "execution-store-1" } as never);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], {
    id: "record-1",
    orderId: "order-1",
    orderNo: "ORD-1",
    storeId: "source-store-1",
    executionStoreId: "execution-store-1",
    status: "IN_CONSTRUCTION",
    lifecycleVersion: 1,
    constructionStatus: "IN_CONSTRUCTION",
    appointmentDate: "2026-08-09T00:00:00.000Z",
    appointmentTimeSlot: "09:00-10:00",
    constructionLocation: "STORE",
    customer: { name: "客户", companyName: null },
    vehicle: { carPlate: "京A00001", carModel: "车型", carColor: "黑" },
    assignments: [{ workerUserId: "worker-1" }],
    photoCount: 1,
    workflow: result.items[0].workflow,
    lifecycle: result.items[0].lifecycle
  });
  assert.equal(result.items[0].workflow.currentStage, "IN_CONSTRUCTION");
  assert.equal(typeof result.generatedAt, "string");
});

test("ConstructionFulfillment keeps transport pass-through operations out of its public seam", () => {
  for (const method of [
    "listAssignments",
    "recordEvidence",
    "qualityHistory",
    "getMaterials",
    "verifyMaterialBatch",
    "pickupMaterials",
    "recordMaterialLoss",
    "syncOffline"
  ]) {
    assert.equal(typeof (ConstructionFulfillment.prototype as unknown as Record<string, unknown>)[method], "undefined", `${method} must stay on its implementation adapter`);
  }
});

test("Finance owns customer cash-fact writes and preserves the business idempotency key", async () => {
  const writes: unknown[] = [];
  const finance = new FinanceService({} as never);
  await finance.recordCustomerReceipt(
    { paymentRecord: { findFirst: async () => null, create: async (args: unknown) => { writes.push(args); return { id: "payment-1" }; } } } as never,
    {
      storeId: "store-1",
      accountId: "account-1",
      amountCents: 1000,
      sourceId: "receipt-1",
      createdById: "user-1",
      occurredAt: new Date("2026-08-09T00:00:00.000Z"),
      idempotencyKey: "receipt-op-1"
    }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("CUSTOMER_RECEIPT"), true);
  assert.equal(serialized.includes("receipt-op-1"), true);
  await finance.recordRebatePayout(
    { paymentRecord: { findFirst: async () => null, create: async (args: unknown) => { writes.push(args); return { id: "payment-2" }; } } } as never,
    {
      storeId: "store-1",
      amountCents: 500,
      sourceId: "rebate-1",
      createdById: "user-1",
      idempotencyKey: "rebate:rebate-1:paid"
    }
  );
  assert.equal(serialized.includes("CUSTOMER_RECEIPT"), true);
  assert.equal(JSON.stringify(writes).includes("rebate:rebate-1:paid"), true);
});

test("SettlementWorkflow keeps settlement writes behind the workflow seam", async () => {
  const calls: string[] = [];
  const workflow = new SettlementWorkflow({
    createStatement: async () => { calls.push("statement"); return { id: "statement-1" }; },
    createReceipt: async () => { calls.push("receipt"); return { id: "receipt-1" }; }
  } as never);

  await workflow.createStatement({} as never, {} as never);
  await workflow.createReceipt({} as never, {} as never);
  assert.deepEqual(calls, ["statement", "receipt"]);
});
