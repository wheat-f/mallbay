import assert from "node:assert/strict";
import { test } from "node:test";
import { executeProductImport, parseProductMatrix, parseProductRows } from "./product-import";

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
  assert.equal(result.validRows[0]?.rowNumber, 2);
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
      message: "品牌、产品名称、型号、单位、产品建议价均为必填，单位支持卷、米、件"
    }
  ]);
});

test("parseProductRows skips blank rows and preserves actual Excel row numbers", () => {
  const result = parseProductRows(
    [
      { 品牌: "", 产品名称: "", 型号: "", 单位: "", 基础价: "" },
      { 品牌: "3M", 产品名称: "精英版", 型号: "Pro", 单位: "卷", 基础价: 6800 }
    ],
    "store-1",
    5
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.validRows.length, 1);
  assert.equal(result.validRows[0]?.rowNumber, 6);
});

test("parseProductMatrix finds a template header below title rows and keeps physical row numbers", () => {
  const result = parseProductMatrix(
    [
      ["mallbay 产品导入模板"],
      ["请勿修改表头"],
      [],
      ["品牌", "产品名称", "型号", "单位", "基础价（元）"],
      ["3M", "精英版", "Pro", "卷", 6800],
      ["BOP", "挑战者", "Plus", "箱", 7800]
    ],
    "store-1"
  );

  assert.equal(result.validRows[0]?.rowNumber, 5);
  assert.equal(result.errors[0]?.rowNumber, 6);
});

test("parseProductRows rejects unknown units instead of silently importing as rolls", () => {
  const result = parseProductRows(
    [{ 品牌: "3M", 产品名称: "精英版", 型号: "Pro", 单位: "箱", 基础价: 6800 }],
    "store-1"
  );

  assert.equal(result.products.length, 0);
  assert.equal(result.errors[0]?.rowNumber, 2);
  assert.match(result.errors[0]?.message ?? "", /单位支持卷、米、件/);
});

test("executeProductImport continues after a row fails and reports its Excel row", async () => {
  const parsed = parseProductRows(
    [
      { 品牌: "3M", 产品名称: "精英版", 型号: "Pro", 单位: "卷", 基础价: 6800 },
      { 品牌: "BOP", 产品名称: "挑战者", 型号: "Plus", 单位: "米", 基础价: 7800 }
    ],
    "store-1"
  );
  const result = await executeProductImport(parsed.validRows, async (product) => {
    if (product.brand === "BOP") throw new Error("型号已存在");
  });

  assert.equal(result.succeeded, 1);
  assert.deepEqual(result.failures, [{ rowNumber: 3, message: "型号已存在" }]);
});
