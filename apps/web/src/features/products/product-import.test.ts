import assert from "node:assert/strict";
import { test } from "node:test";
import { parseProductRows } from "./product-import";

test("parseProductRows maps Chinese Excel headers to product payloads", () => {
  const result = parseProductRows(
    [
      {
        品牌: "龙膜",
        产品名称: "隐形车衣",
        型号: "G2",
        产品类别: "漆面保护膜",
        规格: "1.52*15m",
        单位: "卷",
        库存单位: "米",
        销售单位: "件",
        卷宽: "1.52",
        卷长: "15",
        每卷米数: "15",
        数量精度: "2",
        质保年限: "10",
        基础价: "¥12800"
      }
    ],
    "store-1"
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.products, [
    {
      storeId: "store-1",
      brand: "龙膜",
      name: "隐形车衣",
      model: "G2",
      category: "PPF",
      specification: "1.52*15m",
      unit: "ROLL",
      inventoryUnit: "METER",
      salesUnit: "PIECE",
      rollWidthMeters: 1.52,
      rollLengthMeters: 15,
      metersPerRoll: 15,
      quantityPrecision: 2,
      warrantyYears: 10,
      basePriceCents: 1280000
    }
  ]);
});

test("parseProductRows reports row numbers for incomplete product rows", () => {
  const result = parseProductRows([{ 品牌: "龙膜", 产品名称: "隐形车衣" }], "store-1");

  assert.equal(result.products.length, 0);
  assert.deepEqual(result.errors, [
    {
      rowNumber: 2,
      message: "品牌、产品名称、型号、基础价均为必填"
    }
  ]);
});
