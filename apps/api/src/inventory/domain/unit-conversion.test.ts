import assert from "node:assert/strict";
import { test } from "node:test";
import { ProductUnit } from "@prisma/client";
import {
  convertFromBaseQuantity,
  convertToBaseQuantity,
  normalizeInventoryQuantity
} from "./unit-conversion";

test("unit conversion converts roll outbound meters into base meter quantity", () => {
  assert.equal(
    convertToBaseQuantity({
      quantity: 12,
      fromUnit: ProductUnit.METER,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 18,
      packageUnit: ProductUnit.ROLL
    }),
    12
  );
});

test("unit conversion converts package quantity into base quantity", () => {
  assert.equal(
    convertToBaseQuantity({
      quantity: 1,
      fromUnit: ProductUnit.ROLL,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 18,
      packageUnit: ProductUnit.ROLL
    }),
    18
  );
});

test("unit conversion converts base meters into package equivalent", () => {
  assert.equal(
    convertFromBaseQuantity({
      baseQuantity: 6,
      toUnit: ProductUnit.ROLL,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 18,
      packageUnit: ProductUnit.ROLL
    }),
    0.333
  );
});

test("unit conversion normalizes decimal precision", () => {
  assert.equal(normalizeInventoryQuantity(1 / 3, 3), 0.333);
});
