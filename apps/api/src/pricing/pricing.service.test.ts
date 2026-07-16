import { test } from "node:test";
import assert from "node:assert/strict";
import { calculatePricing } from "./domain/pricing-engine";
import { PricingService } from "./pricing.service";

const user = {
  id: "user-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: "MANAGER" }
} as never;

function createService() {
  const calculation = calculatePricing(
    {
      ruleSetVersion: 2,
      constructionType: "PPF",
      constructionLocation: "IN_STORE",
      baseLaborCostCents: 10000,
      lines: [{
        id: "line-1",
        productId: "product-1",
        category: "PPF",
        brand: "3M",
        model: "PLUS",
        salesUnit: "ROLL",
        quantity: 1,
        baseUnitPriceCents: 100000
      }]
    },
    []
  );
  const prisma = {
    pricingCalculation: {
      findFirst: async () => ({
        id: "calc-1",
        storeId: "store-1",
        ruleSetVersion: 2,
        inputHash: calculation.inputHash,
        expiresAt: null,
        outputSnapshot: {
          calculation,
          protectionPolicy: {
            normalDeviationBps: 500,
            approvalDeviationBps: 1500,
            minimumMarginBps: 0
          }
        }
      })
    }
  };
  return new PricingService(prisma as never, {} as never);
}

test("正式订单只能复用与试算快照一致的产品行", async () => {
  const service = createService();
  const snapshot = await service.validateOrder(user, {
    storeId: "store-1",
    pricingCalculationId: "calc-1",
    items: [{ productId: "product-1", quantity: 1, unitPriceCents: 100000 }],
    laborCostCents: 10000
  });
  assert.equal(snapshot.pricingRuleSetVersion, 2);

  await assert.rejects(
    service.validateOrder(user, {
      storeId: "store-1",
      pricingCalculationId: "calc-1",
      items: [{ productId: "product-2", quantity: 1, unitPriceCents: 100000 }],
      laborCostCents: 10000
    }),
    /产品或数量已变化/
  );
});
