import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getWarrantyCardRows,
  getWarrantyExpiryReminder,
  getWarrantyOrderLabel,
  getWarrantyStatusLabel
} from "./display";

test("getWarrantyStatusLabel formats warranty statuses", () => {
  assert.equal(getWarrantyStatusLabel("ACTIVE"), "有效");
  assert.equal(getWarrantyStatusLabel("EXPIRED"), "已过期");
  assert.equal(getWarrantyStatusLabel("VOIDED"), "已作废");
  assert.equal(getWarrantyStatusLabel("UNKNOWN"), "UNKNOWN");
});

test("getWarrantyExpiryReminder warns expiring and expired warranties", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  assert.deepEqual(
    getWarrantyExpiryReminder({ status: "ACTIVE", endDate: "2026-06-20T00:00:00.000Z" }, now),
    { label: "19 天后到期", color: "warning" }
  );
  assert.deepEqual(
    getWarrantyExpiryReminder({ status: "ACTIVE", endDate: "2026-05-20T00:00:00.000Z" }, now),
    { label: "已逾期 12 天", color: "error" }
  );
  assert.deepEqual(
    getWarrantyExpiryReminder({ status: "ACTIVE", endDate: "2026-08-01T00:00:00.000Z" }, now),
    { label: "正常", color: "success" }
  );
  assert.deepEqual(
    getWarrantyExpiryReminder({ status: "VOIDED", endDate: "2026-06-20T00:00:00.000Z" }, now),
    { label: "无需提醒", color: "default" }
  );
});

test("getWarrantyCardRows formats electronic warranty card fields", () => {
  assert.deepEqual(
    getWarrantyCardRows({
      warrantyNo: "WAR202606060001",
      status: "ACTIVE",
      scope: "整车漆面保护膜",
      startDate: "2026-06-01T00:00:00.000Z",
      endDate: "2031-06-01T00:00:00.000Z",
      orderId: "order-1",
      order: {
        orderNo: "ORD-004",
        customer: { companyName: "星河汽车", personalName: null, name: null },
        vehicle: { plateNo: "湘A40004" }
      }
    }),
    [
      { label: "质保编号", value: "WAR202606060001" },
      { label: "状态", value: "有效" },
      { label: "质保范围", value: "整车漆面保护膜" },
      { label: "开始日期", value: "2026/6/1" },
      { label: "到期日期", value: "2031/6/1" },
      { label: "关联订单", value: "ORD-004 / 星河汽车 / 湘A40004" }
    ]
  );
});

test("getWarrantyOrderLabel formats order business fields", () => {
  assert.equal(
    getWarrantyOrderLabel({
      orderId: "order-1",
      order: {
        orderNo: "ORD-005",
        customer: { companyName: null, personalName: "韩梅梅", name: null },
        vehicle: { plateNo: "湘A50005" }
      }
    }),
    "ORD-005 / 韩梅梅 / 湘A50005"
  );
});

test("getWarrantyOrderLabel does not expose technical order ids when order summary is missing", () => {
  assert.equal(getWarrantyOrderLabel({ orderId: "cm-order-technical-id", order: null }), "订单未加载");
});
