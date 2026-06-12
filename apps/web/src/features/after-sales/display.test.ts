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
  assert.equal(getAfterSaleStatusLabel("ASSIGNED"), "已派单");
  assert.equal(getAfterSaleStatusLabel("UNKNOWN"), "UNKNOWN");
  assert.equal(getAfterSaleResponsibilityLabel("CONSTRUCTION"), "施工责任");
  assert.equal(getAfterSaleResponsibilityLabel("PENDING"), "待判责");
});

test("after-sale responsibility options exclude pending for manual judgement", () => {
  assert.deepEqual(AFTER_SALE_RESPONSIBILITY_OPTIONS, [
    { value: "CUSTOMER", label: "客户责任" },
    { value: "CONSTRUCTION", label: "施工责任" },
    { value: "MATERIAL", label: "材料责任" },
    { value: "STORE", label: "门店责任" }
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

  assert.equal(getAfterSaleBusinessLabel(afterSale), "ORD-003 / 李雷 / 湘A30003 / 边角起翘 / 已派单");
  assert.equal(getAfterSaleOrderLabel(afterSale), "ORD-003 / 李雷 / 湘A30003");
});

test("getAfterSaleOrderLabel does not expose technical order ids when order summary is missing", () => {
  assert.equal(getAfterSaleOrderLabel({ orderId: "cm-order-technical-id", order: null }), "订单未加载");
});
