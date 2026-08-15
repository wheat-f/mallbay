import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CREATE_ORDER_DRAFT_STORAGE_KEY,
  acquireCreateOrderDraftLease,
  renewCreateOrderDraftLease,
  releaseCreateOrderDraftLease,
  loadCreateOrderDraft,
  removeCreateOrderDraft,
  saveCreateOrderDraft
} from "./create-order-draft";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

test("create order draft persists normalized values for the active store", () => {
  const storage = new MemoryStorage();
  const dateValue = { format: () => "2026-07-15" };

  saveCreateOrderDraft(storage, {
    storeId: "store-1",
    savedAt: "2026-07-15T10:00:00.000Z",
    values: {
      customerId: "customer-1",
      constructionType: "PPF",
      constructionLocation: "IN_STORE",
      appointmentDate: dateValue,
      appointmentTimeSlot: [
        { format: () => "09:00" },
        { format: () => "12:00" }
      ],
      items: [{ productId: "product-1", quantity: 2, unitPriceYuan: 6800 }]
    },
    summary: { customerName: "张三", productCount: 1, totalAmountYuan: 13600 }
  });

  const draft = loadCreateOrderDraft(storage, "store-1");
  assert.equal(draft?.values.appointmentDate, "2026-07-15");
  assert.equal(draft?.values.appointmentTimeSlot, "09:00-12:00");
  assert.equal(draft?.summary.customerName, "张三");
  assert.equal(loadCreateOrderDraft(storage, "store-2"), null);
});

test("create order draft removal clears the versioned storage entry", () => {
  const storage = new MemoryStorage();
  storage.setItem(CREATE_ORDER_DRAFT_STORAGE_KEY, "draft");

  removeCreateOrderDraft(storage);

  assert.equal(storage.getItem(CREATE_ORDER_DRAFT_STORAGE_KEY), null);
});

test("create order draft keeps the server pricing snapshot for an explicit restore choice", () => {
  const storage = new MemoryStorage();
  saveCreateOrderDraft(storage, {
    storeId: "store-1",
    savedAt: "2026-07-15T10:00:00.000Z",
    values: {
      customerId: "customer-1",
      constructionType: "PPF",
      constructionLocation: "IN_STORE",
      items: [{ productId: "product-1", quantity: 1, unitPriceYuan: 6800 }]
    },
    pricingSnapshot: {
      mode: "SIMULATION",
      ruleSetId: "rule-set-1",
      pricingCalculationId: "calc-1",
      calculation: {
        ruleSetVersion: 2,
        lines: [],
        suggestedProductAmountCents: 680000,
        suggestedLaborCostCents: 10000,
        suggestedTotalCents: 690000,
        calculationSteps: []
      },
      guard: { decision: "NORMAL" }
    },
    summary: { customerName: "张三", productCount: 1, totalAmountYuan: 6800 }
  });

  assert.equal(loadCreateOrderDraft(storage, "store-1")?.pricingSnapshot?.pricingCalculationId, "calc-1");
});

test("create order draft lease prevents two tabs from submitting the same actor/store draft", () => {
  const storage = new MemoryStorage();
  assert.equal(acquireCreateOrderDraftLease(storage, "store-1", "draft-1", "tab-a", 1000, 15000, "actor-1"), true);
  assert.equal(acquireCreateOrderDraftLease(storage, "store-1", "draft-1", "tab-b", 2000, 15000, "actor-1"), false);
  assert.equal(acquireCreateOrderDraftLease(storage, "store-1", "draft-1", "tab-b", 2000, 15000, "actor-2"), true);
  assert.equal(renewCreateOrderDraftLease(storage, "store-1", "draft-1", "tab-a", 2000, 15000, "actor-1"), true);
  releaseCreateOrderDraftLease(storage, "store-1", "draft-1", "tab-a", "actor-1");
  assert.equal(renewCreateOrderDraftLease(storage, "store-1", "draft-1", "tab-a", 3000, 15000, "actor-1"), false);
});
