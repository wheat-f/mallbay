import assert from "node:assert/strict";
import { test } from "node:test";
import { toProductFormValues, toProductPayload } from "./product-form";

test("toProductPayload converts yuan display price to cents payload", () => {
  assert.deepEqual(
    toProductPayload("store-1", {
      brand: "品牌1",
      name: "名称1",
      model: "型号1",
      category: "PPF",
      specification: "1.52*15米",
      unit: "ROLL",
      warrantyYears: 10,
      basePriceYuan: 12.34
    }),
    {
      storeId: "store-1",
      brand: "品牌1",
      name: "名称1",
      model: "型号1",
      category: "PPF",
      specification: "1.52*15米",
      unit: "ROLL",
      warrantyYears: 10,
      basePriceCents: 1234
    }
  );
});

test("toProductFormValues converts cents payload price to yuan display price", () => {
  assert.equal(toProductFormValues({ basePriceCents: 1234 }).basePriceYuan, 12.34);
});

test("standard material cost uses yuan in the form and cents in the payload", () => {
  assert.equal(toProductPayload("store-1", { basePriceYuan: 1, standardCostYuan: 2.5 }).standardCostCents, 250);
  assert.equal(toProductFormValues({ standardCostCents: 250 }).standardCostYuan, 2.5);
});
