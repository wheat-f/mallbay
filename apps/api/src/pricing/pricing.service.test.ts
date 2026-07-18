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

test("新价格快照成本缺失时禁止直接生成正式订单", async () => {
  const service = createService();
  const prisma = (service as unknown as { prisma: { pricingCalculation: { findFirst: () => Promise<Record<string, unknown>> } } }).prisma;
  const original = prisma.pricingCalculation.findFirst;
  prisma.pricingCalculation.findFirst = async () => ({
    ...await original(),
    outputSnapshot: {
      ...(await original()).outputSnapshot,
      costEstimate: { costCompleteness: "MISSING" }
    }
  });
  await assert.rejects(service.validateOrder(user, {
    storeId: "store-1", pricingCalculationId: "calc-1",
    items: [{ productId: "product-1", quantity: 1, unitPriceCents: 100000 }], laborCostCents: 10000
  }), /预计成本尚未完整/);
});

test("已批准报价转正式订单时允许复用审批价但仍拒绝硬性阻断价", async () => {
  const service = createService();

  const approved = await service.validateOrder(user, {
    storeId: "store-1",
    pricingCalculationId: "calc-1",
    items: [{ productId: "product-1", quantity: 1, unitPriceCents: 90000 }],
    laborCostCents: 10000
  }, { approvedQuote: true });
  assert.equal(approved.pricingCalculationId, "calc-1");

  await assert.rejects(
    service.validateOrder(user, {
      storeId: "store-1",
      pricingCalculationId: "calc-1",
      items: [{ productId: "product-1", quantity: 1, unitPriceCents: 50000 }],
      laborCostCents: 10000
    }, { approvedQuote: true }),
    /低于保护范围/
  );
});

test("未指定规则集时自动使用当前生效版本并返回实际规则集标识", async () => {
  const getForCalculationCalls: Array<{ storeId: string; id?: string }> = [];
  const prisma = {
    store: {
      findUnique: async () => ({ pricingRolloutMode: "ACTIVE" })
    },
    product: {
      findMany: async () => [{
        id: "product-1",
        name: "基础膜",
        category: "PPF",
        brand: "验收品牌",
        model: "基础膜-100",
        salesUnit: "METER",
        basePriceCents: 100000,
        quantityPrecision: 3
      }]
    },
    pricingCalculation: {
      create: async () => ({ id: "calc-auto" })
    }
  };
  const pricingRules = {
    getForCalculation: async (storeId: string, id?: string) => {
      getForCalculationCalls.push({ storeId, id });
      return {
        id: "rule-set-active",
        version: 2,
        rules: [{
          id: "rule-1",
          group: "PRODUCT",
          target: "PRODUCT_LINE",
          name: "PPF 加价",
          conditions: [{ field: "productCategory", operator: "EQ", value: "PPF" }],
          actionType: "ADD_CENTS",
          actionValue: 10000,
          priority: 10,
          sortOrder: 0,
          enabled: true
        }],
        protectionPolicy: {
          normalDeviationBps: 500,
          approvalDeviationBps: 1500,
          minimumMarginBps: 2000,
          blockBelowMarginBps: 0,
          softHoldHours: 24,
          internalLaborCostConfig: {
            baseLaborCostCentsByConstruction: { PPF: 180000 }
          }
        }
      };
    }
  };
  const service = new PricingService(prisma as never, pricingRules as never);

  const result = await service.calculate(user, {
    storeId: "store-1",
    input: {
      ruleSetVersion: 1,
      constructionType: "PPF",
      constructionLocation: "IN_STORE",
      baseLaborCostCents: 0,
      lines: [{
        id: "line-1",
        productId: "product-1",
        category: "客户端伪造类别",
        brand: "客户端伪造品牌",
        model: "客户端伪造型号",
        salesUnit: "METER",
        quantity: 5,
        baseUnitPriceCents: 1
      }]
    }
  } as never);

  assert.deepEqual(getForCalculationCalls, [{ storeId: "store-1", id: undefined }]);
  assert.equal(result.ruleSetId, "rule-set-active");
  assert.equal(result.pricingCalculationId, "calc-auto");
  assert.equal(result.calculation.ruleSetVersion, 2);
  assert.equal(result.calculation.lines[0].category, "PPF");
  assert.equal(result.calculation.lines[0].suggestedUnitPriceCents, 110000);
  assert.equal(result.calculation.suggestedLaborCostCents, 180000);
  assert.equal(result.calculation.suggestedTotalCents, 730000);
  assert.equal(result.constructionChargeAvailable, false);
});

test("缺少门店运行模式时按 LEGACY 处理，不能意外启用新价格流程", async () => {
  const service = new PricingService({
    store: { findUnique: async () => null },
    product: {
      findMany: async () => [{
        id: "product-1", name: "基础膜", category: "PPF", brand: "验收品牌", model: "基础膜-100",
        salesUnit: "METER", basePriceCents: 100000, quantityPrecision: 3
      }]
    }
  } as never, { getForCalculation: async () => null } as never);

  const result = await service.calculate(user, {
    storeId: "store-1",
    input: {
      ruleSetVersion: 1,
      constructionType: "PPF",
      constructionLocation: "IN_STORE",
      baseLaborCostCents: 0,
      lines: [{ id: "line-1", productId: "product-1", category: "", brand: "", model: "", salesUnit: "METER", quantity: 1, baseUnitPriceCents: 0 }]
    }
  } as never);

  assert.equal(result.rolloutMode, "LEGACY");
  assert.equal(result.pricingCalculationId, null);
});
