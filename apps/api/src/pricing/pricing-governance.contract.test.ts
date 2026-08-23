import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { PricingModule } from "./pricing.module";
import { PricingRulesService } from "./pricing-rules.service";
import { PricingTemplateService } from "./pricing-template.service";
import { PricingRolloutService } from "./pricing-rollout.service";
import { ConstructionCostConfigService } from "./construction-cost-config.service";
import { PRICING_GOVERNANCE, PricingGovernance } from "./domain/pricing-governance";

const exported = (moduleType: unknown) => new Set((Reflect.getMetadata("exports", moduleType) ?? []) as unknown[]);

test("PricingModule exposes the governance seam while preserving implementation exports", () => {
  const pricing = exported(PricingModule);

  assert.equal(pricing.has(PRICING_GOVERNANCE), true);
  assert.equal(pricing.has(PricingRulesService), true);
  assert.equal(pricing.has(PricingTemplateService), true);
  assert.equal(pricing.has(PricingRolloutService), true);
  assert.equal(pricing.has(ConstructionCostConfigService), true);
});

test("PricingController crosses PricingGovernance instead of governance implementations", () => {
  const source = readFileSync(path.join(__dirname, "pricing.controller.ts"), "utf8");

  assert.match(source, /PRICING_GOVERNANCE/);
  assert.match(source, /this\.governance\.(listRuleSets|listTemplates|precheckRollout|listConstructionServiceItems)\(/);
  assert.doesNotMatch(source, /PricingRulesService|PricingTemplateService|PricingRolloutService|ConstructionCostConfigService/);
  assert.doesNotMatch(source, /this\.(pricingRules|templates|rollout|constructionCosts)\./);
});

test("PricingGovernance preserves delegated results across each governance capability", async () => {
  const calls: string[] = [];
  const result = (name: string, value: unknown) => ({ name, value });
  const user = { id: "user-1" } as never;
  const rules = {
    list: async (_user: unknown, dto: unknown) => { calls.push("rules.list"); return result("rules.list", dto); },
    publish: async (_user: unknown, storeId: string, id: string) => { calls.push("rules.publish"); return result("rules.publish", { storeId, id }); }
  } as never;
  const templates = {
    list: async (_user: unknown) => { calls.push("templates.list"); return result("templates.list", "templates"); },
    copyToStore: async (_user: unknown, templateId: string, versionId: string, dto: unknown) => { calls.push("templates.copyToStore"); return result("templates.copyToStore", { templateId, versionId, dto }); }
  } as never;
  const rollout = {
    precheck: async (_user: unknown, storeId: string) => { calls.push("rollout.precheck"); return result("rollout.precheck", storeId); },
    set: async (_user: unknown, dto: unknown) => { calls.push("rollout.set"); return result("rollout.set", dto); }
  } as never;
  const construction = {
    listServiceItems: async (_user: unknown, storeId: string) => { calls.push("construction.listServiceItems"); return result("construction.listServiceItems", storeId); },
    publishRateVersion: async (_user: unknown, storeId: string, id: string) => { calls.push("construction.publishRateVersion"); return result("construction.publishRateVersion", { storeId, id }); }
  } as never;

  const governance = new PricingGovernance(rules, templates, rollout, construction);
  const ruleQuery = { storeId: "store-1" } as never;
  const templateCopy = { storeId: "store-1" } as never;
  const rolloutDto = { storeId: "store-1", mode: "ACTIVE" } as never;

  assert.deepEqual(await governance.listRuleSets(user, ruleQuery), result("rules.list", ruleQuery));
  assert.deepEqual(await governance.publishRuleSet(user, "store-1", "rule-1"), result("rules.publish", { storeId: "store-1", id: "rule-1" }));
  assert.deepEqual(await governance.listTemplates(user), result("templates.list", "templates"));
  assert.deepEqual(await governance.copyTemplateToStore(user, "template-1", "version-1", templateCopy), result("templates.copyToStore", { templateId: "template-1", versionId: "version-1", dto: templateCopy }));
  assert.deepEqual(await governance.precheckRollout(user, "store-1"), result("rollout.precheck", "store-1"));
  assert.deepEqual(await governance.setRollout(user, rolloutDto), result("rollout.set", rolloutDto));
  assert.deepEqual(await governance.listConstructionServiceItems(user, "store-1"), result("construction.listServiceItems", "store-1"));
  assert.deepEqual(await governance.publishPositionCostRateVersion(user, "store-1", "rate-1"), result("construction.publishRateVersion", { storeId: "store-1", id: "rate-1" }));
  assert.deepEqual(calls, [
    "rules.list", "rules.publish", "templates.list", "templates.copyToStore",
    "rollout.precheck", "rollout.set", "construction.listServiceItems", "construction.publishRateVersion"
  ]);
});
