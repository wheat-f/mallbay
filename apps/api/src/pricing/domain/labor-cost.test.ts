import assert from "node:assert/strict";
import test from "node:test";
import { resolveBaseLaborCost } from "./labor-cost";

test("configured labor base wins over legacy client input", () => {
  assert.equal(resolveBaseLaborCost({ baseLaborCostCentsByConstruction: { "PPF:IN_STORE": 210000 } }, { constructionType: "PPF", constructionLocation: "IN_STORE" }), 210000);
  assert.equal(resolveBaseLaborCost({}, { constructionType: "PPF", constructionLocation: "OUTSIDE" }), 220000);
});
