import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REBATE_REVIEW_OPTIONS,
  getRebateBusinessLabel,
  getRebateCustomerLabel,
  getRebateOrderLabel,
  getRebateReviewOptionsForPermissions,
  getRebateStatusLabel
} from "./display";

test("getRebateStatusLabel formats rebate statuses", () => {
  assert.equal(getRebateStatusLabel("APPLIED"), "待审核");
  assert.equal(getRebateStatusLabel("REVIEWED"), "待审批");
  assert.equal(getRebateStatusLabel("APPROVED"), "待发放");
  assert.equal(getRebateStatusLabel("REJECTED"), "已驳回");
  assert.equal(getRebateStatusLabel("PAID"), "已发放");
  assert.equal(getRebateStatusLabel("UNKNOWN"), "状态待确认");
});

test("rebate review options use display labels", () => {
  assert.deepEqual(REBATE_REVIEW_OPTIONS, [
    { value: "REVIEWED", label: "业务审核通过" },
    { value: "APPROVED", label: "财务审批通过" },
    { value: "REJECTED", label: "已驳回" }
  ]);
});

test("rebate review options are scoped by effective permissions", () => {
  assert.deepEqual(getRebateReviewOptionsForPermissions([{ code: "rebates", actions: ["review"] }]), [
    { value: "REVIEWED", label: "业务审核通过" },
    { value: "REJECTED", label: "已驳回" }
  ]);
  assert.deepEqual(getRebateReviewOptionsForPermissions([{ code: "rebates", actions: ["pay"] }]), [
    { value: "APPROVED", label: "财务审批通过" },
    { value: "REJECTED", label: "已驳回" }
  ]);
  assert.deepEqual(getRebateReviewOptionsForPermissions([{ code: "rebates", actions: ["read"] }]), []);
  assert.deepEqual(getRebateReviewOptionsForPermissions(undefined), []);
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

  assert.equal(getRebateBusinessLabel(rebate), "ORD-002 / 周启 / 湘A20002 / 老客户返利 / 待发放");
  assert.equal(getRebateOrderLabel(rebate), "ORD-002 / 周启 / 湘A20002");
  assert.equal(getRebateCustomerLabel(rebate), "周启");
});

test("getRebateOrderLabel does not expose technical order ids when order summary is missing", () => {
  assert.equal(getRebateOrderLabel({ orderId: "cm-order-technical-id", order: null }), "关联订单待确认");
});

test("getRebateCustomerLabel keeps missing customer information business-safe", () => {
  assert.equal(getRebateCustomerLabel({ orderId: "cm-order-technical-id", order: null }), "客户信息待确认");
  assert.equal(getRebateCustomerLabel({ order: { customer: null } }), "客户信息待确认");
});

test("getRebateBusinessLabel does not expose rebate technical ids", () => {
  assert.equal(getRebateBusinessLabel({ id: "cm-rebate-technical-id" }), "返利申请待确认");
});
