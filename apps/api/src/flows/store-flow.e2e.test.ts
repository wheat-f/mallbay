import assert from "node:assert/strict";
import { test } from "node:test";
import { createStoreFlowFixture } from "../testing/store-flow.fixture";

test("store flow fixture creates stable cross-module identities", () => {
  const fixture = createStoreFlowFixture();

  assert.equal(fixture.store.id, "store-flow-1");
  assert.equal(fixture.customer.id, "customer-flow-1");
  assert.equal(fixture.vehicle.customerId, fixture.customer.id);
  assert.equal(fixture.order.customerId, fixture.customer.id);
  assert.equal(fixture.order.vehicleId, fixture.vehicle.id);
  assert.equal(fixture.filmProduct.baseUnit, "METER");
});
