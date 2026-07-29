import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient, Prisma, SettingsConfigDomain, SettingsConfigStatus, SettingsMigrationReviewStatus, SettingsMigrationRunStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const runKey = "settings-domain-migration-v1";
const requestPrefix = "legacy-settings-domain:";

function hasArg(name: string) { return process.argv.slice(2).includes(name); }
function arg(name: string) {
  const args = process.argv.slice(2);
  const inline = args.find((value) => value.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}
function backup() {
  if (hasArg("--skip-backup")) return { file: null, skipped: true };
  const target = arg("--backup-file") ?? process.env.SETTINGS_MIGRATION_BACKUP_FILE;
  if (!target) throw new Error("域配置迁移前必须提供 --backup-file；仅在外部已备份时显式使用 --skip-backup");
  const file = path.resolve(target);
  mkdirSync(path.dirname(file), { recursive: true });
  const result = spawnSync("pg_dump", ["--format=custom", "--file", file, "--dbname", connectionString], { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0 || !existsSync(file)) throw new Error(`pg_dump 失败：${result.error?.message ?? result.status}`);
  return { file, skipped: false };
}

async function main() {
  const operator = await prisma.user.findFirst({ where: { isAuditor: true }, select: { id: true } });
  if (!operator) throw new Error("找不到总部管理员，无法生成系统迁移审计");
  const existing = await prisma.settingsMigrationRun.findUnique({ where: { runKey } });
  if (hasArg("--rollback")) {
    if (!existing) throw new Error(`找不到迁移运行记录：${runKey}`);
    const candidates = await prisma.settingsConfigVersion.findMany({ where: { requestId: { startsWith: requestPrefix } }, select: { id: true } });
    if (hasArg("--dry-run")) { console.log(JSON.stringify({ runKey, dryRun: true, candidateVersions: candidates.length })); return; }
    await prisma.$transaction(async (tx) => {
      await tx.settingsConfigVersion.deleteMany({ where: { requestId: { startsWith: requestPrefix } } });
      await tx.settingsMigrationRun.update({ where: { id: existing.id }, data: { status: SettingsMigrationRunStatus.ROLLED_BACK, rolledBackAt: new Date(), summary: { rolledBackVersions: candidates.length } } });
      await tx.auditEvent.create({ data: { action: "settings.migration.domain_rolled_back", actorId: operator.id, targetType: "SettingsMigrationRun", targetId: existing.id, metadata: { runKey, rolledBackVersions: candidates.length, retainedAudit: true } } });
    });
    console.log(JSON.stringify({ runKey, rolledBackVersions: candidates.length }));
    return;
  }
  if (existing?.status === SettingsMigrationRunStatus.COMPLETED) { console.log(JSON.stringify({ runKey, status: existing.status, reused: true })); return; }
  const backupInfo = backup();
  const stores = await prisma.store.findMany({ orderBy: { id: "asc" }, select: { id: true, name: true, address: true, description: true } });
  const capacities = await prisma.dailyCapacity.findMany({ orderBy: [{ storeId: "asc" }, { date: "desc" }] });
  const latestCapacity = new Map<string, (typeof capacities)[number]>();
  for (const row of capacities) if (!latestCapacity.has(row.storeId)) latestCapacity.set(row.storeId, row);
  const rateVersions = await prisma.positionCostRateVersion.findMany({ include: { rates: true }, orderBy: [{ storeId: "asc" }, { version: "desc" }] });
  const accounts = await prisma.paymentAccount.findMany({ orderBy: [{ storeId: "asc" }, { createdAt: "asc" }] });
  const digest = createHash("sha256").update(JSON.stringify({ stores: stores.map((row) => row.id), capacities: capacities.length, rateVersions: rateVersions.map((row) => row.id), accounts: accounts.map((row) => row.id) })).digest("hex");
  const run = existing ?? await prisma.settingsMigrationRun.create({ data: { runKey, featureFlag: "settings-workbench", backupFile: backupInfo.file, checkpoint: { digest, stores: stores.length, capacities: capacities.length, rateVersions: rateVersions.length, accounts: accounts.length } } });
  let created = 0; let skipped = 0; let reviews = 0;
  const createVersion = async (tx: Prisma.TransactionClient, data: Prisma.SettingsConfigVersionUncheckedCreateInput, metadata: Record<string, unknown>) => {
    const existingVersion = await tx.settingsConfigVersion.findFirst({ where: { requestId: data.requestId } });
    if (existingVersion) { skipped += 1; return; }
    const version = await tx.settingsConfigVersion.create({ data });
    await tx.auditEvent.create({ data: { action: "settings.migration.domain_imported", actorId: operator.id, storeId: data.scopeId === "global" ? null : data.scopeId, targetType: "SettingsConfigVersion", targetId: version.id, metadata: { ...metadata, operator: "system migration", requestId: data.requestId } as Prisma.InputJsonValue } });
    created += 1;
  };
  try {
    await prisma.$transaction(async (tx) => {
      for (const store of stores) {
        await createVersion(tx, { domain: SettingsConfigDomain.STORE, capabilityCode: "store.profile", scopeId: store.id, version: 1, status: SettingsConfigStatus.PUBLISHED, effectiveAt: new Date(), payload: { name: store.name, address: store.address ?? "", description: store.description ?? "" }, createdById: operator.id, updatedById: operator.id, publishedById: operator.id, publishedAt: new Date(), requestId: `${requestPrefix}store-profile:${store.id}` }, { sourceType: "Store", sourceId: store.id, fields: ["name", "address", "description"] });
        const capacity = latestCapacity.get(store.id);
        if (capacity) await createVersion(tx, { domain: SettingsConfigDomain.STORE, capabilityCode: "store.capacity", scopeId: store.id, version: 1, status: SettingsConfigStatus.PUBLISHED, effectiveAt: new Date(), payload: { inStoreCapacity: capacity.inStoreCapacity, outsideCapacity: capacity.outsideCapacity, glassFilmCapacity: capacity.heatFilmCapacity, reinspectionCapacity: capacity.inspectionCapacity, sourceDate: capacity.date.toISOString() }, createdById: operator.id, updatedById: operator.id, publishedById: operator.id, publishedAt: new Date(), requestId: `${requestPrefix}store-capacity:${store.id}` }, { sourceType: "DailyCapacity", sourceId: capacity.id, fields: ["inStoreCapacity", "outsideCapacity", "heatFilmCapacity", "inspectionCapacity"] });
        const storeAccounts = accounts.filter((account) => account.storeId === store.id);
        if (storeAccounts.length) await createVersion(tx, { domain: SettingsConfigDomain.FINANCE, capabilityCode: "finance.accounts", scopeId: store.id, version: 1, status: SettingsConfigStatus.PUBLISHED, effectiveAt: new Date(), payload: { accounts: storeAccounts.map((account) => ({ id: account.id, name: account.name, type: account.type, bankName: account.bankName ?? "", accountNo: account.accountNo ? `****${account.accountNo.slice(-4)}` : "", isDefault: account.isDefault, isActive: account.isActive })) }, createdById: operator.id, updatedById: operator.id, publishedById: operator.id, publishedAt: new Date(), requestId: `${requestPrefix}finance-accounts:${store.id}` }, { sourceType: "PaymentAccount", sourceId: store.id, count: storeAccounts.length });
      }
      for (const row of rateVersions) {
        await createVersion(tx, { domain: SettingsConfigDomain.FINANCE, capabilityCode: "finance.labor_cost", scopeId: row.storeId, version: row.version, status: row.status === "PUBLISHED" ? SettingsConfigStatus.PUBLISHED : SettingsConfigStatus.DRAFT, effectiveAt: row.effectiveFrom, expiresAt: row.effectiveTo, payload: { sourceVersionId: row.id, rates: row.rates.map((rate) => ({ positionTypeCode: rate.positionTypeCode, hourlyCostCents: rate.hourlyCostCents })) }, createdById: operator.id, updatedById: operator.id, publishedById: row.publishedById, publishedAt: row.publishedAt, requestId: `${requestPrefix}finance-labor:${row.id}` }, { sourceType: "PositionCostRateVersion", sourceId: row.id, fields: ["effectiveFrom", "effectiveTo", "rates"] });
      }
      await tx.settingsMigrationReview.upsert({ where: { runId_sourceType_sourceId: { runId: run.id, sourceType: "Permissions", sourceId: "code-policy" } }, create: { runId: run.id, sourceType: "Permissions", sourceId: "code-policy", reason: "旧权限由代码策略和门店岗位推导，数据库没有可安全转换的历史矩阵", payload: { action: "保留现有 PermissionPolicy，待总部确认后再发布矩阵" }, status: SettingsMigrationReviewStatus.PENDING }, update: {} });
      await tx.settingsMigrationReview.upsert({ where: { runId_sourceType_sourceId: { runId: run.id, sourceType: "FinanceSettlement", sourceId: "no-legacy-model" } }, create: { runId: run.id, sourceType: "FinanceSettlement", sourceId: "no-legacy-model", reason: "未发现独立的历史成本/结算规则配置模型", payload: { action: "待财务确认默认规则" }, status: SettingsMigrationReviewStatus.PENDING }, update: {} });
      reviews = 2;
      await tx.settingsMigrationRun.update({ where: { id: run.id }, data: { status: SettingsMigrationRunStatus.COMPLETED, completedAt: new Date(), summary: { created, skipped, reviews, digest }, checkpoint: { digest, processed: created + skipped, stores: stores.length, capacities: capacities.length, rateVersions: rateVersions.length, accounts: accounts.length } } });
      await tx.auditEvent.create({ data: { action: "settings.migration.domain_completed", actorId: operator.id, targetType: "SettingsMigrationRun", targetId: run.id, metadata: { runKey, created, skipped, reviews, backupFile: backupInfo.file, backupSkipped: backupInfo.skipped, featureFlag: "settings-workbench" } } });
    });
  } catch (error) {
    await prisma.settingsMigrationRun.update({ where: { id: run.id }, data: { status: SettingsMigrationRunStatus.FAILED, errorMessage: error instanceof Error ? error.message : "unknown migration error" } }).catch(() => undefined);
    throw error;
  }
  console.log(JSON.stringify({ runKey, created, skipped, reviews, stores: stores.length, capacities: capacities.length, rateVersions: rateVersions.length, accounts: accounts.length, backupFile: backupInfo.file, backupSkipped: backupInfo.skipped }));
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());