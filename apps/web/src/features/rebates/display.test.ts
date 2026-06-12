import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REBATE_REVIEW_OPTIONS,
  getRebateBusinessLabel,
  getRebateOrderLabel,
  getRebateReviewOptionsForRole,
  getRebateStatusLabel
} from "./display";

test("getRebateStatusLabel formats rebate statuses", () => {
  assert.equal(getRebateStatusLabel("APPLIED"), "已申请");
  assert.equal(getRebateStatusLabel("REVIEWED"), "业务已审核");
  assert.equal(getRebateStatusLabel("APPROVED"), "财务已审批");
  assert.equal(getRebateStatusLabel("REJECTED"), "已拒绝");
  assert.equal(getRebateStatusLabel("PAID"), "已发放");
  assert.equal(getRebateStatusLabel("UNKNOWN"), "UNKNOWN");
});

test("rebate review options use display labels", () => {
  assert.deepEqual(REBATE_REVIEW_OPTIONS, [
    { value: "REVIEWED", label: "业务审核通过" },
    { value: "APPROVED", label: "财务审批通过" },
    { value: "REJECTED", label: "已拒绝" }
  ]);
});

test("rebate review options are scoped by user role", () => {
  assert.deepEqual(getRebateReviewOptionsForRole("MANAGER", false), [
    { value: "REVIEWED", label: "业务审核通过" },
    { value: "REJECTED", label: "已拒绝" }
  ]);
  assert.deepEqual(getRebateReviewOptionsForRole("FINANCE", false), [
    { value: "APPROVED", label: "财务审批通过" },
    { value: "REJECTED", label: "已拒绝" }
  ]);
  assert.deepEqual(getRebateReviewOptionsForRole("CUSTOMER_SERVICE", false), []);
  assert.deepEqual(getRebateReviewOptionsForRole(undefined, true), REBATE_REVIEW_OPTIONS);
});

test("rebate display helpers use order business fields instead of technical ids", () => {
  const rebate = {
    id: "rebate-1",
    reason: "老客户返利",
    status: "APPROVED",
    order: {
      orderNo: "ORD-002",
      customer: { companyName: null, personalName: "周启", name: null },
      vehicle: { plateNo: "湘A20002" }
    }
  };

  assert.equal(getRebateBusinessLabel(rebate), "ORD-002 / 周启 / 湘A20002 / 老客户返利 / 财务已审批");
  assert.equal(getRebateOrderLabel(rebate), "ORD-002 / 周启 / 湘A20002");
});

test("getRebateOrderLabel does not expose technical order ids when order summary is missing", () => {
  assert.equal(getRebateOrderLabel({ orderId: "cm-order-technical-id", order: null }), "订单未加载");
});
