import assert from "node:assert/strict";
import test from "node:test";
import {
  canCancelReturn,
  canConfirmSupplierSettlement,
  canOperatePurchaseReturn,
  canOperateSalesReturn,
  canViewReturnAudit,
  getPurchaseReturnStatusAfterReversal,
  sumConfirmedSettlement
} from "./return-domain";

test("partial sales return can only cancel remaining quantity", () => {
  assert.equal(canCancelReturn("SALES", "PARTIAL_RECEIVED", "MANAGER"), true);
  assert.equal(canCancelReturn("SALES", "PARTIAL_RECEIVED", "PURCHASING"), false);
  assert.equal(canCancelReturn("PURCHASE", "PARTIAL_OUTBOUND", "PURCHASING"), true);
  assert.equal(canCancelReturn("PURCHASE", "PARTIAL_OUTBOUND", "FINANCE"), false);
});

test("only finance can confirm a supplier settlement", () => {
  assert.equal(canConfirmSupplierSettlement("FINANCE"), true);
  assert.equal(canConfirmSupplierSettlement("MANAGER"), false);
  assert.equal(canConfirmSupplierSettlement("PURCHASING"), false);
});

test("reversal recalculates the purchase return settlement status", () => {
  assert.equal(getPurchaseReturnStatusAfterReversal(0), "OUTBOUND_WAIT_SETTLEMENT");
  assert.equal(getPurchaseReturnStatusAfterReversal(800), "PARTIAL_SETTLEMENT");
});

test("only confirmed settlement adjustments contribute to the aggregate", () => {
  assert.equal(sumConfirmedSettlement([
    { status: "CONFIRMED", refundAmountCents: 300, payableOffsetAmountCents: 500 },
    { status: "PENDING", refundAmountCents: 200, payableOffsetAmountCents: 0 },
    { status: "REVERSED", refundAmountCents: 100, payableOffsetAmountCents: 0 }
  ]), 800);
});

test("return audit is limited to manager and finance", () => {
  assert.equal(canViewReturnAudit("MANAGER"), true);
  assert.equal(canViewReturnAudit("FINANCE"), true);
  assert.equal(canViewReturnAudit("PURCHASING"), false);
  assert.equal(canViewReturnAudit("CONSTRUCTION"), false);
});

test("sales and purchase return operations use separate role boundaries", () => {
  assert.equal(canOperateSalesReturn("SALES"), true);
  assert.equal(canOperateSalesReturn("PURCHASING"), false);
  assert.equal(canOperatePurchaseReturn("PURCHASING"), true);
  assert.equal(canOperatePurchaseReturn("CONSTRUCTION"), false);
});
