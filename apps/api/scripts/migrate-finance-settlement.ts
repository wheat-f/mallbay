import { Prisma, PrismaClient, SettingsConfigDomain, SettingsConfigStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createHash } from "node:crypto";
import { DEFAULT_FINANCE_SETTLEMENT_POLICY, FINANCE_SETTLEMENT_CAPABILITY } from "../src/settings/finance-settlement-policy";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const requestPrefix = "finance-settlement-policy:v1:";

async function main() {
  const operator = await prisma.user.findFirst({ where: { isAuditor: true }, select: { id: true } });
  if (!operator) throw new Error("找不到总部管理员，无法生成财务结算策略迁移审计");
  const stores = await prisma.store.findMany({ select: { id: true }, orderBy: { id: "asc" } });
  let created = 0;
  let skipped = 0;
  await prisma.$transaction(async (tx) => {
    for (const store of stores) {
      const published = await tx.settingsConfigVersion.findFirst({ where: { capabilityCode: FINANCE_SETTLEMENT_CAPABILITY, scopeId: store.id, status: SettingsConfigStatus.PUBLISHED }, orderBy: { version: "desc" } });
      if (published) { skipped += 1; continue; }
      const latest = await tx.settingsConfigVersion.findFirst({ where: { capabilityCode: FINANCE_SETTLEMENT_CAPABILITY, scopeId: store.id }, orderBy: { version: "desc" }, select: { version: true } });
      const requestId = `${requestPrefix}${store.id}`;
      const row = await tx.settingsConfigVersion.create({
        data: {
          domain: SettingsConfigDomain.FINANCE,
          capabilityCode: FINANCE_SETTLEMENT_CAPABILITY,
          scopeId: store.id,
          version: (latest?.version ?? 0) + 1,
          status: SettingsConfigStatus.PUBLISHED,
          effectiveAt: new Date(),
          payload: DEFAULT_FINANCE_SETTLEMENT_POLICY as unknown as Prisma.InputJsonValue,
          createdById: operator.id,
          updatedById: operator.id,
          publishedById: operator.id,
          publishedAt: new Date(),
          requestId
        }
      });
      await tx.auditEvent.create({ data: { action: "settings.finance_settlement.policy_migrated", actorId: operator.id, storeId: store.id, targetType: "SettingsConfigVersion", targetId: row.id, metadata: { source: "existing-cost-calculation-logic", policyVersion: 1, digest: createHash("sha256").update(JSON.stringify(DEFAULT_FINANCE_SETTLEMENT_POLICY)).digest("hex"), requestId } } });
      created += 1;
    }
  });
  console.log(JSON.stringify({ capabilityCode: FINANCE_SETTLEMENT_CAPABILITY, created, skipped, stores: stores.length }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());