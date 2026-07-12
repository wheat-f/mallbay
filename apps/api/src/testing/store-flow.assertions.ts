import assert from "node:assert/strict";

export function assertOrderState(
  order: { status?: string | null },
  expectedStatus: string
) {
  assert.equal(order.status, expectedStatus);
}

export function assertInventoryBalance(
  batch: { availableQuantity?: number | string | null },
  expectedBaseQuantity: number
) {
  assert.equal(Number(batch.availableQuantity), expectedBaseQuantity);
}
