import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONSTRUCTION_TYPE_OPTIONS,
  getConstructionLocationLabel,
  getConstructionTypeLabel,
  getOrderStatusLabel,
  getPaymentTypeLabel,
  yuanCurrency
} from "./order-display";

test("order display helpers format labels and yuan currency", () => {
  assert.equal(getConstructionTypeLabel("PPF"), "漆面保护膜");
  assert.equal(getConstructionTypeLabel("UNKNOWN"), "施工类型待确认");
  assert.equal(getConstructionLocationLabel("IN_STORE"), "到店");
  assert.equal(getConstructionLocationLabel("UNKNOWN"), "施工地点待确认");
  assert.equal(getOrderStatusLabel("PENDING_DISPATCH"), "待派工");
  assert.equal(getOrderStatusLabel("UNKNOWN"), "订单状态待确认");
  assert.equal(getPaymentTypeLabel("DEPOSIT"), "定金");
  assert.equal(getPaymentTypeLabel("UNKNOWN"), "付款类型待确认");
  assert.equal(yuanCurrency(123456), "¥1,234.56");
  assert.equal(yuanCurrency(undefined), "-");
});

test("construction type options are derived from display labels", () => {
  assert.deepEqual(CONSTRUCTION_TYPE_OPTIONS, [
    { value: "PPF", label: "漆面保护膜" },
    { value: "COLOR_FILM", label: "改色膜" },
    { value: "HEAT_FILM", label: "隔热膜" },
    { value: "MODIFICATION", label: "改装" },
    { value: "INSPECTION", label: "检查" }
  ]);
});
