import assert from "node:assert/strict";
import test from "node:test";
import { PricingRolloutMode, StorePosition } from "@prisma/client";
import { PricingRolloutService } from "./pricing-rollout.service";

const pricingAccess = {
  can: async (actor: { userId: string }, capability: string) => capability === "finance" ? actor.userId.includes("finance") : true,
  resolve: async () => ({ roles: [{ roleCode: "MANAGER" }] })
};

test("门店缺少完整施工标准或岗位费率时不能切换 ACTIVE", async () => {
  let updated = false;
  const service = new PricingRolloutService({
    pricingRuleSet: { findFirst: async () => null },
    store: { update: async () => { updated = true; return { id: "store-1", name: "测试门店", pricingRolloutMode: PricingRolloutMode.ACTIVE }; } }
  } as never, undefined, undefined, pricingAccess as never);
  await assert.rejects(
    () => service.set({ id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } } as never, { storeId: "store-1", mode: PricingRolloutMode.ACTIVE }),
    /缺少当前生效的已发布建议价版本/
  );
  assert.equal(updated, false);
});

test("完整已发布版本可通过 ACTIVE 门店预检", async () => {
  const service = new PricingRolloutService({
    pricingRuleSet: {
      findFirst: async () => ({
        id: "rules-1", version: 3, positionCostRateVersionId: "rates-1",
        constructionStandards: [{ id: "standard-1" }],
        positionCostRateVersion: { status: "PUBLISHED", rates: [{ id: "rate-1" }] }
      })
    }
  } as never, undefined, undefined, pricingAccess as never);
  const result = await service.precheck({ id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } } as never, "store-1");
  assert.equal(result.ready, true);
  assert.deepEqual(result.errors, []);
});

test("迁移预检统计历史、缺失与临时成本订单", async () => {
  const counts = [12, 5, 7, 2, 1];
  const service = new PricingRolloutService({
    order: { count: async () => counts.shift() ?? 0 },
    pricingRuleSet: { findFirst: async () => null }
  } as never, undefined, undefined, pricingAccess as never);
  const result = await service.migrationPrecheck({ id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } } as never, "store-1");
  assert.deepEqual(result.orders, { totalOrders: 12, legacyOrders: 5, activeOrders: 7, incompleteCostOrders: 2, temporaryCostOrders: 1 });
  assert.equal(result.warnings.length, 3);
});
