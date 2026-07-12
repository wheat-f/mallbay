import assert from "node:assert/strict";
import { test } from "node:test";
import {
  convertFromBaseQuantity,
  convertToBaseQuantity,
  normalizeInventoryQuantity
} from "./unit-conversion";

test("web unit conversion converts package quantity into base quantity", () => {
  assert.equal(
    convertToBaseQuantity({
      quantity: 1,
      fromUnit: "ROLL",
      baseUnit: "METER",
      baseQuantityPerPackage: 18,
      packageUnit: "ROLL"
    }),
    18
  );
});

test("web unit conversion converts base quantity into package equivalent", () => {
  assert.equal(
    convertFromBaseQuantity({
      baseQuantity: 6,
      toUnit: "ROLL",
      baseUnit: "METER",
      baseQuantityPerPackage: 18,
      packageUnit: "ROLL"
    }),
    0.333
  );
});

test("web unit conversion normalizes decimal precision", () => {
  assert.equal(normalizeInventoryQuantity(1 / 3, 3), 0.333);
});

test("web unit conversion keeps different roll lengths independent", () => {
  assert.equal(
    convertToBaseQuantity({
      quantity: 1,
      fromUnit: "ROLL",
      baseUnit: "METER",
      baseQuantityPerPackage: 15,
      packageUnit: "ROLL"
    }),
    15
  );
  assert.equal(
    convertToBaseQuantity({
      quantity: 1,
      fromUnit: "ROLL",
      baseUnit: "METER",
      baseQuantityPerPackage: 30,
      packageUnit: "ROLL"
    }),
    30
  );
});

test("web unit conversion supports square centimeter material quantities", () => {
  assert.equal(
    convertToBaseQuantity({
      quantity: 12000,
      fromUnit: "SQUARE_CENTIMETER",
      baseUnit: "SQUARE_CENTIMETER",
      baseQuantityPerPackage: 20000,
      packageUnit: "PIECE"
    }),
    12000
  );
  assert.equal(
    convertFromBaseQuantity({
      baseQuantity: 8000,
      toUnit: "SQUARE_CENTIMETER",
      baseUnit: "SQUARE_CENTIMETER",
      baseQuantityPerPackage: 20000,
      packageUnit: "PIECE"
    }),
    8000
  );
});
