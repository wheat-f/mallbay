import assert from "node:assert/strict";
import { test } from "node:test";
import { PricingRulesService, assertNoConstructionGroupConflict, validateRuleConflicts, validateRuleDefinitions } from "./pricing-rules.service";

const pricingAccess = {
  can: async (_actor: string, _capability: string, _action: string) => true,
  resolve: async () => ({ roles: [{ roleCode: "MANAGER" }] })
};

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
  const service = new PricingRulesService(prisma as never, undefined, undefined, pricingAccess as never);
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
  const service = new PricingRulesService(prisma as never, undefined, undefined, pricingAccess as never);
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
  const service = new PricingRulesService(prisma as never, undefined, undefined, pricingAccess as never);
  await assert.rejects(service.updateDraft(manager, "rules-1", draftPayload), /不可修改/);
});

test("相同适用条件即使优先级不同也拒绝共存", () => {
  const base = {
    group: "PRODUCT",
    target: "PRODUCT_LINE",
    conditions: [{ field: "productCategory", operator: "EQ", value: "PAINT_PROTECTION_FILM" }],
    enabled: true
  };
  assert.throws(() => validateRuleConflicts([
    { ...base, priority: 1 },
    { ...base, priority: 99 }
  ]), /同一适用条件不能配置多条价格调整/);
});

test("IN 条件的候选值顺序不能绕过冲突校验", () => {
  const common = { group: "PRODUCT", target: "PRODUCT_LINE", enabled: true };
  assert.throws(() => validateRuleConflicts([
    { ...common, conditions: [{ field: "salesUnit", operator: "IN", value: ["ROLL", "METER"] }] },
    { ...common, conditions: [{ field: "salesUnit", operator: "IN", value: ["METER", "ROLL"] }] }
  ]), /同一适用条件不能配置多条价格调整/);
});

test("枚举条件与数量条件只能使用匹配的判断方式", () => {
  const base = { name: "测试规则", group: "PRODUCT", target: "PRODUCT_LINE", actionType: "ADD_CENTS", actionValue: 100, enabled: true };
  assert.throws(() => validateRuleDefinitions([{ ...base, conditions: [{ field: "vehicleClassCode", operator: "GTE", value: "B" }] }] as never), /只能使用“为”或“属于”/);
  assert.throws(() => validateRuleDefinitions([{ ...base, conditions: [{ field: "quantity", operator: "IN", value: [1, 2] }] }] as never), /数量类条件只能使用/);
  assert.doesNotThrow(() => validateRuleDefinitions([{ ...base, conditions: [{ field: "vehicleClassCode", operator: "EQ", value: "B" }] }] as never));
  assert.doesNotThrow(() => validateRuleDefinitions([{ ...base, conditions: [{ field: "quantity", operator: "BETWEEN", value: [1, 3] }] }] as never));
});

test("同一施工组的重叠施工标准不能通过不同服务项目绕过", () => {
  const standards = [
    { serviceItemId: "service-primary", constructionLocationCode: "IN_STORE", productCategoryCode: "PPF", baseConstructionChargeCents: 100, standardWorkMinutes: 60, crewRoles: [{ positionTypeCode: "CONSTRUCTION", workerCount: 1, workMinutes: 60 }] },
    { serviceItemId: "service-addon", constructionLocationCode: "IN_STORE", productCategoryCode: "PPF", baseConstructionChargeCents: 200, standardWorkMinutes: 60, crewRoles: [{ positionTypeCode: "CONSTRUCTION", workerCount: 1, workMinutes: 60 }] }
  ] as never;
  assert.throws(() => assertNoConstructionGroupConflict(standards, new Map([["service-primary", "PPF"], ["service-addon", "PPF"]])), /同一施工组/);
  assert.doesNotThrow(() => assertNoConstructionGroupConflict(standards, new Map([["service-primary", "PPF"], ["service-addon", "COLOR_FILM"]])));
});
