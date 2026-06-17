import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AFTER_SALE_RESPONSIBILITY_OPTIONS,
  centsToYuan,
  getAfterSaleBusinessLabel,
  getAfterSaleOrderLabel,
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel,
  yuanToCents
} from "./display";

test("after-sale display helpers format statuses and responsibilities", () => {
  assert.equal(getAfterSaleStatusLabel("OPEN"), "待处理");
  assert.equal(getAfterSaleStatusLabel("ASSIGNED"), "处理中");
  assert.equal(getAfterSaleStatusLabel("RESOLVED"), "已完成");
  assert.equal(getAfterSaleStatusLabel("UNKNOWN"), "状态待确认");
  assert.equal(getAfterSaleResponsibilityLabel("CONSTRUCTION"), "施工");
  assert.equal(getAfterSaleResponsibilityLabel("MATERIAL"), "厂家");
  assert.equal(getAfterSaleResponsibilityLabel("CUSTOMER"), "客户");
  assert.equal(getAfterSaleResponsibilityLabel("PENDING"), "待判责");
  assert.equal(getAfterSaleResponsibilityLabel("UNKNOWN"), "责任待确认");
});

test("after-sale responsibility options exclude pending for manual judgement", () => {
  assert.deepEqual(AFTER_SALE_RESPONSIBILITY_OPTIONS, [
    { value: "CUSTOMER", label: "客户" },
    { value: "CONSTRUCTION", label: "施工" },
    { value: "MATERIAL", label: "厂家" },
    { value: "STORE", label: "门店" }
  ]);
});

test("after-sale money helpers convert penalty yuan values to cents", () => {
  assert.equal(yuanToCents(12.34), 1234);
  assert.equal(yuanToCents(0), 0);
  assert.equal(centsToYuan(1234), 12.34);
  assert.equal(centsToYuan(undefined), undefined);
});

test("after-sale display helpers use order business fields instead of technical ids", () => {
  const afterSale = {
    id: "after-sale-1",
    description: "边角起翘",
    status: "ASSIGNED",
    order: {
      orderNo: "ORD-003",
      customer: { companyName: null, personalName: "李雷", name: null },
      vehicle: { plateNo: "湘A30003" }
    }
  };

  assert.equal(getAfterSaleBusinessLabel(afterSale), "ORD-003 / 李雷 / 湘A30003 / 边角起翘 / 处理中");
  assert.equal(getAfterSaleOrderLabel(afterSale), "ORD-003 / 李雷 / 湘A30003");
});

test("getAfterSaleOrderLabel does not expose technical order ids when order summary is missing", () => {
  assert.equal(getAfterSaleOrderLabel({ orderId: "cm-order-technical-id", order: null }), "关联订单待确认");
});

test("getAfterSaleBusinessLabel does not expose after-sale technical ids", () => {
  assert.equal(getAfterSaleBusinessLabel({ id: "cm-after-sale-technical-id" }), "售后工单待确认");
});
