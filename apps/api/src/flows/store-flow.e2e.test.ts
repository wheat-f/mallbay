import assert from "node:assert/strict";
import { test } from "node:test";
import { createStoreFlowFixture, createStoreFlowScenario } from "../testing/store-flow.fixture";
import { assertInventoryBalance, assertOrderState } from "../testing/store-flow.assertions";

test("store flow fixture creates stable cross-module identities", () => {
  const fixture = createStoreFlowFixture();

  assert.equal(fixture.store.id, "store-flow-1");
  assert.equal(fixture.customer.id, "customer-flow-1");
  assert.equal(fixture.vehicle.customerId, fixture.customer.id);
  assert.equal(fixture.order.customerId, fixture.customer.id);
  assert.equal(fixture.order.vehicleId, fixture.vehicle.id);
  assert.equal(fixture.filmProduct.baseUnit, "METER");
});

test("in-stock order flows through outbound construction quality warranty and after-sales closure", () => {
  const scenario = createStoreFlowScenario();

  scenario.lockInventory();
  scenario.outboundInventory(18);
  scenario.dispatchConstruction();
  scenario.pickupMaterials();
  scenario.startConstruction();
  scenario.completeConstruction();
  scenario.passQualityCheck();
  scenario.generateWarranty();
  scenario.createAfterSale();
  scenario.assignAfterSale();
  scenario.submitAfterSaleEvidence(3, "客户确认施工后状态");
  scenario.judgeAfterSale();
  scenario.closeAfterSale();

  assertOrderState({ status: scenario.state.orderStatus }, "WARRANTIED");
  assertInventoryBalance({ availableQuantity: scenario.state.inventoryAvailableBaseQuantity }, 0);
  assert.equal(scenario.state.warrantyStatus, "ACTIVE");
  assert.equal(scenario.state.afterSaleStatus, "CLOSED");
  assert.equal(scenario.state.afterSaleEvidenceCount, 3);
  assert.equal(scenario.state.afterSaleEvidenceNote, "客户确认施工后状态");
  assert.equal(scenario.state.auditEvents.length, 13);

  scenario.lockInventory();
  scenario.outboundInventory(18);
  scenario.completeConstruction();
  scenario.generateWarranty();
  scenario.closeAfterSale();
  assert.equal(scenario.state.inventoryAvailableBaseQuantity, 0);
  assert.equal(scenario.state.auditEvents.length, 13);
});

test("flow rejects skipping required inventory and evidence gates", () => {
  const scenario = createStoreFlowScenario();

  assert.throws(() => scenario.dispatchConstruction(), /库存出库完成后/);
  scenario.lockInventory();
  assert.throws(() => scenario.startConstruction(), /领取物料后/);
  scenario.outboundInventory(18);
  scenario.dispatchConstruction();
  scenario.pickupMaterials();
  scenario.startConstruction();
  scenario.completeConstruction();
  scenario.passQualityCheck();
  scenario.generateWarranty();
  scenario.createAfterSale();
  scenario.assignAfterSale();
  assert.throws(() => scenario.judgeAfterSale(), /证据齐全后/);
});

test("partial outbound keeps six meters from an eighteen-meter roll available", () => {
  const scenario = createStoreFlowScenario();

  scenario.lockInventory();
  scenario.outboundInventory(12);

  assertInventoryBalance({ availableQuantity: scenario.state.inventoryAvailableBaseQuantity }, 6);
  assert.equal(scenario.state.inventoryLockedBaseQuantity, 6);
  assert.throws(() => scenario.dispatchConstruction(), /库存出库完成后/);
});

test("shortage procurement split across suppliers restores inventory matching", () => {
  const scenario = createStoreFlowScenario({ initialInventoryBaseQuantity: 0 });

  scenario.lockInventory();
  assert.equal(scenario.state.purchaseRequirementStatus, "OPEN");
  scenario.createPurchaseOrders([
    { supplierName: "供应商A", quantity: 10, expectedAt: "2026-07-20" },
    { supplierName: "供应商B", quantity: 8, expectedAt: "2026-07-22" }
  ]);

  assert.equal(scenario.state.purchaseRequirementStatus, "ORDERED");
  assert.deepEqual(scenario.state.purchaseOrders, [
    { supplierName: "供应商A", quantity: 10, expectedAt: "2026-07-20", receivedQuantity: 0 },
    { supplierName: "供应商B", quantity: 8, expectedAt: "2026-07-22", receivedQuantity: 0 }
  ]);

  scenario.receivePurchaseOrder("供应商A");
  assert.equal(scenario.state.purchaseRequirementStatus, "PARTIAL_RECEIVED");
  assert.equal(scenario.state.inventoryAvailableBaseQuantity, 10);

  scenario.receivePurchaseOrder("供应商B");
  assert.equal(scenario.state.purchaseRequirementStatus, "FULFILLED");
  assert.equal(scenario.state.inventoryAvailableBaseQuantity, 18);

  scenario.lockInventory();
  assert.equal(scenario.state.inventoryLockedBaseQuantity, 18);
  scenario.outboundInventory(18);
  assert.equal(scenario.state.inventoryAvailableBaseQuantity, 0);
});
