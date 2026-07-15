import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CREATE_ORDER_DRAFT_STORAGE_KEY,
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
