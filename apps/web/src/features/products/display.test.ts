import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getProductCategoryLabel,
  getProductUnitLabel,
  getProductDisplayName,
  getProductInventorySpecLabel
} from "./display";

test("getProductCategoryLabel formats product category enum as Chinese business labels", () => {
  assert.equal(getProductCategoryLabel("PPF"), "漆面保护膜");
  assert.equal(getProductCategoryLabel("COLOR_FILM"), "改色膜");
  assert.equal(getProductCategoryLabel("HEAT_FILM"), "隔热膜");
  assert.equal(getProductCategoryLabel("MODIFICATION"), "改装");
  assert.equal(getProductCategoryLabel("OTHER"), "其他");
  assert.equal(getProductCategoryLabel("UNKNOWN"), "产品分类待确认");
});

test("getProductUnitLabel formats product units", () => {
  assert.equal(getProductUnitLabel("ROLL"), "卷");
  assert.equal(getProductUnitLabel("METER"), "米");
  assert.equal(getProductUnitLabel("SQUARE_METER"), "平方米");
  assert.equal(getProductUnitLabel("SQUARE_CENTIMETER"), "平方厘米");
  assert.equal(getProductUnitLabel("PIECE"), "件");
  assert.equal(getProductUnitLabel("UNKNOWN"), "单位待确认");
});

test("getProductDisplayName labels brand name and model", () => {
  assert.equal(
    getProductDisplayName({ brand: "品牌1", name: "名称1", model: "型号1" }),
    "品牌：品牌1 / 名称：名称1 / 型号：型号1"
  );
});

test("getProductDisplayName falls back to a business-safe product label", () => {
  assert.equal(getProductDisplayName({}), "未命名产品");
});

test("getProductInventorySpecLabel formats structured roll conversion fields", () => {
  assert.equal(
    getProductInventorySpecLabel({
      inventoryUnit: "ROLL",
      salesUnit: "METER",
      rollWidthMeters: 1.52,
      rollLengthMeters: 15,
      metersPerRoll: 15,
      quantityPrecision: 3
    }),
    "库存单位：卷 / 销售单位：米 / 卷宽：1.52m / 卷长：15m / 1卷=15m / 精度：3位小数"
  );
});

test("getProductInventorySpecLabel falls back to free text specification", () => {
  assert.equal(getProductInventorySpecLabel({ specification: "1.52*15米" }), "规格：1.52*15米");
});
