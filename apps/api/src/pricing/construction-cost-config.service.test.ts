import assert from "node:assert/strict";
import { test } from "node:test";
import { ConstructionCostConfigService } from "./construction-cost-config.service";

const pricingAccess = {
  can: async (actor: { userId: string }, capability: string) => capability === "finance.cost" ? actor.userId.includes("finance") : capability === "finance" ? actor.userId.includes("finance") || actor.userId.includes("manager") : actor.userId.includes("manager"),
  resolve: async (actor: { userId: string }) => ({ roles: [{ roleCode: actor.userId.includes("finance") ? "FINANCE" : "MANAGER" }] })
};

const storeId = "store-1";
const manager = { id: "manager-1", isAuditor: false, storeMember: { storeId, position: "MANAGER" } } as never;
const finance = { id: "finance-1", isAuditor: false, storeMember: { storeId, position: "FINANCE" } } as never;
const purchasing = { id: "purchasing-1", isAuditor: false, storeMember: { storeId, position: "PURCHASING" } } as never;

test("施工服务项目只能由店长维护，采购岗位不能借产品权限写入", async () => {
  const service = new ConstructionCostConfigService({} as never, undefined, undefined, pricingAccess as never);
  await assert.rejects(
    service.createServiceItem(purchasing, { storeId, code: "PPF_FULL", name: "全车保护膜", constructionTypeCode: "PPF", serviceGroupCode: "全车保护膜" }),
    /只有店长/
  );
});

test("岗位小时成本只有财务可维护，店长可确认版本已配置但不读取金额", async () => {
  const prisma = {
    positionCostRateVersion: {
      findMany: async () => [{ id: "rate-v1", version: 1, status: "PUBLISHED", effectiveFrom: new Date("2026-07-16"), effectiveTo: null, rates: [{ positionTypeCode: "CONSTRUCTION", hourlyCostCents: 10000 }] }]
    }
  };
  const service = new ConstructionCostConfigService(prisma as never, undefined, undefined, pricingAccess as never);
  const managerRows = await service.listRateVersions(manager, storeId);
  const financeRows = await service.listRateVersions(finance, storeId);
  assert.deepEqual(managerRows[0].rates, []);
  assert.equal(managerRows[0].rateCount, 1);
  assert.equal(financeRows[0].rates[0].hourlyCostCents, 10000);
  assert.equal(financeRows[0].rateCount, 1);
  await assert.rejects(
    service.createRateVersion(manager, { storeId, effectiveFrom: "2026-07-16T00:00:00.000Z", rates: [{ positionTypeCode: "CONSTRUCTION", hourlyCostCents: 10000 }] }),
    /只有财务/
  );
});
