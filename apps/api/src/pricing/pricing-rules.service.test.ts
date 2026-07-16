import assert from "node:assert/strict";
import { test } from "node:test";
import { PricingRulesService } from "./pricing-rules.service";

const manager = {
  id: "manager-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: "MANAGER" }
} as never;

const draftPayload = {
  storeId: "store-1",
  effectiveFrom: "2026-07-16T00:00:00.000Z",
  rules: [],
  protectionPolicy: {
    normalDeviationBps: 500,
    approvalDeviationBps: 1500,
    minimumMarginBps: 2000,
    blockBelowMarginBps: 0,
    softHoldHours: 24,
    allowSpecialApproval: false,
    internalLaborCostConfig: {}
  }
} as never;

test("规则详情按门店权限返回完整版本", async () => {
  const prisma = {
    pricingRuleSet: {
      findFirst: async () => ({ id: "rules-1", storeId: "store-1", rules: [], protectionPolicy: {} })
    }
  };
  const service = new PricingRulesService(prisma as never);
  const result = await service.get(manager, "store-1", "rules-1");
  assert.equal(result.id, "rules-1");
});

test("只有草稿规则版本可被完整替换", async () => {
  let updateArgs: unknown;
  const prisma = {
    pricingRuleSet: {
      findFirst: async () => ({ status: "DRAFT", version: 3 }),
      update: async (args: unknown) => {
        updateArgs = args;
        return { id: "rules-1", status: "DRAFT", rules: [], protectionPolicy: {} };
      }
    }
  };
  const service = new PricingRulesService(prisma as never);
  const result = await service.updateDraft(manager, "rules-1", draftPayload);
  assert.equal(result.id, "rules-1");
  assert.deepEqual((updateArgs as { data: { rules: { deleteMany: unknown } } }).data.rules.deleteMany, {});
});

test("已发布规则版本拒绝原地修改", async () => {
  const prisma = {
    pricingRuleSet: {
      findFirst: async () => ({ status: "PUBLISHED", version: 2 })
    }
  };
  const service = new PricingRulesService(prisma as never);
  await assert.rejects(service.updateDraft(manager, "rules-1", draftPayload), /不可修改/);
});
