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

test("unit conversion keeps different roll lengths independent", () => {
  assert.equal(
    convertToBaseQuantity({
      quantity: 1,
      fromUnit: ProductUnit.ROLL,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 15,
      packageUnit: ProductUnit.ROLL
    }),
    15
  );
  assert.equal(
    convertToBaseQuantity({
      quantity: 1,
      fromUnit: ProductUnit.ROLL,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 30,
      packageUnit: ProductUnit.ROLL
    }),
    30
  );
});

test("unit conversion supports square centimeter material quantities", () => {
  assert.equal(
    convertToBaseQuantity({
      quantity: 12000,
      fromUnit: ProductUnit.SQUARE_CENTIMETER,
      baseUnit: ProductUnit.SQUARE_CENTIMETER,
      baseQuantityPerPackage: 20000,
      packageUnit: ProductUnit.PIECE
    }),
    12000
  );
  assert.equal(
    convertFromBaseQuantity({
      baseQuantity: 8000,
      toUnit: ProductUnit.SQUARE_CENTIMETER,
      baseUnit: ProductUnit.SQUARE_CENTIMETER,
      baseQuantityPerPackage: 20000,
      packageUnit: ProductUnit.PIECE
    }),
    8000
  );
});
