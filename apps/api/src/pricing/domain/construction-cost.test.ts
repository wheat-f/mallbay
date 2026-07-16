import assert from "node:assert/strict";
import test from "node:test";
import { estimateConstructionCost, type ConstructionCostStandard } from "./construction-cost";

const standard: ConstructionCostStandard = {
  id: "ppf-standard", priority: 1, enabled: true, constructionTypeCode: "PPF", serviceGroupCode: "PPF",
  defaultProductCategoryCode: "漆面保护膜", constructionLocationCode: "IN_STORE",
  baseConstructionChargeCents: 180000, standardWorkMinutes: 240, addonChargeCents: 20000, addonWorkMinutes: 30,
  standardCommissionCents: 10000, standardAllowanceCents: 5000,
  crewRoles: [{ positionTypeCode: "CONSTRUCTION", workerCount: 2, workMinutes: 240 }]
};

test("同组主项目加追加量，跨组分别叠加", () => {
  const result = estimateConstructionCost({
    constructionType: "PPF", constructionLocation: "IN_STORE", lines: [
      { id: "a", productId: "a", category: "漆面保护膜", brand: "", model: "", salesUnit: "卷", quantity: 1, baseUnitPriceCents: 1 },
      { id: "b", productId: "b", category: "漆面保护膜", brand: "", model: "", salesUnit: "卷", quantity: 1, baseUnitPriceCents: 1 }
    ]
  }, [standard], [{ positionTypeCode: "CONSTRUCTION", hourlyCostCents: 6000 }]);
  assert.deepEqual(result, {
    complete: true, suggestedConstructionChargeCents: 200000, estimatedConstructionCostCents: 84000,
    standardWorkMinutes: 270, matchedStandardIds: ["ppf-standard", "ppf-standard"]
  });
});

test("缺少施工标准或岗位小时成本时不生成权威预计成本", () => {
  const input = { constructionType: "PPF", constructionLocation: "IN_STORE", lines: [{ id: "a", productId: "a", category: "漆面保护膜", brand: "", model: "", salesUnit: "卷", quantity: 1, baseUnitPriceCents: 1 }] };
  assert.equal(estimateConstructionCost(input, [], []).complete, false);
  assert.equal(estimateConstructionCost(input, [standard], []).reason, "岗位小时成本未配置：CONSTRUCTION");
});
