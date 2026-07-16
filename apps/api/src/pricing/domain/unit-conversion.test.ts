import assert from "node:assert/strict";
import test from "node:test";
import { unitConversionFactor } from "./unit-conversion";

test("unit conversion derives meter, area and roll factors from product dimensions", () => {
  const product = { metersPerRoll: 10, rollLengthMeters: null, rollWidthMeters: 1.5 };
  assert.equal(unitConversionFactor("ROLL", "METER", product), 10);
  assert.equal(unitConversionFactor("ROLL", "SQUARE_METER", product), 15);
  assert.equal(unitConversionFactor("METER", "ROLL", product), 0.1);
});

test("unit conversion returns null when dimensions are missing", () => {
  assert.equal(unitConversionFactor("ROLL", "METER", { metersPerRoll: null, rollLengthMeters: null, rollWidthMeters: 1.5 }), null);
});
