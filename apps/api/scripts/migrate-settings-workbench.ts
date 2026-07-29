import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaClient, SettingsConfigDomain, SettingsConfigStatus, SettingsMigrationRunStatus, SettingsMigrationReviewStatus } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const requestPrefix = "legacy-settings-dictionary:";
const defaultRunKey = "legacy-settings-dictionary-v1";

function getArg(name: string) {
  const args = process.argv.slice(2);
  const prefix = `${name}=`;
  const inline = args.find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function hasArg(name: string) { return process.argv.slice(2).includes(name); }

function createBackup(runKey: string) {
  if (hasArg("--skip-backup")) return { backupFile: null, skipped: true };
  const backupFile = getArg("--backup-file") ?? process.env.SETTINGS_MIGRATION_BACKUP_FILE;
  if (!backupFile) throw new Error("迁移前必须提供 --backup-file；仅在已由外部备份时显式使用 --skip-backup");
  const resolved = path.resolve(backupFile);
  mkdirSync(path.dirname(resolved), { recursive: true });
  const result = spawnSync("pg_dump", ["--format=custom", "--file", resolved, "--dbname", connectionString], { stdio: "inherit", shell: false });
  if (result.error) throw new Error(`无法执行 pg_dump：${result.error.message}`);
  if (result.status !== 0 || !existsSync(resolved)) throw new Error(`pg_dump 失败，退出码 ${result.status ?? "unknown"}`);
  return { backupFile: resolved, skipped: false };
}

async function rollbackMigration(runKey: string, operatorId: string, dryRun: boolean) {
  const run = await prisma.settingsMigrationRun.findUnique({ where: { runKey } });
  if (!run) throw new Error(`找不到迁移运行记录：${runKey}`);
  const versions = await prisma.settingsConfigVersion.findMany({ where: { requestId: { startsWith: requestPrefix } }, select: { id: true, requestId: true } });
  if (dryRun) { console.log(JSON.stringify({ runKey, dryRun: true, candidateVersions: versions.length })); return; }
  await prisma.$transaction(async (tx) => {
    await tx.settingsConfigVersion.deleteMany({ where: { requestId: { startsWith: requestPrefix } } });
    await tx.settingsMigrationRun.update({ where: { id: run.id }, data: { status: SettingsMigrationRunStatus.ROLLED_BACK, rolledBackAt: new Date(), summary: { rolledBackVersions: versions.length } } });
    await tx.auditEvent.create({ data: { action: "settings.migration.rolled_back", actorId: operatorId, targetType: "SettingsMigrationRun", targetId: run.id, metadata: { runKey, rolledBackVersions: versions.length, retainedAudit: true } } });
  });
  console.log(JSON.stringify({ runKey, rolledBackVersions: versions.length }));
}

async function main() {
  const runKey = getArg("--run-key") ?? defaultRunKey;
  const operator = await prisma.user.findFirst({ where: { isAuditor: true }, select: { id: true } });
  if (!operator) throw new Error("找不到总部管理员，无法生成系统迁移审计");
  if (hasArg("--rollback")) { await rollbackMigration(runKey, operator.id, hasArg("--dry-run")); return; }

  const existingRun = await prisma.settingsMigrationRun.findUnique({ where: { runKey } });
  if (existingRun?.status === SettingsMigrationRunStatus.COMPLETED) { console.log(JSON.stringify({ runKey, status: existingRun.status, reused: true })); return; }
  const backup = createBackup(runKey);
  const dictionaries = await prisma.dictionary.findMany({ include: { dictionaryItems: true }, orderBy: { id: "asc" } });
  const stores = new Set((await prisma.store.findMany({ select: { id: true } })).map((store) => store.id));
  const digest = createHash("sha256").update(JSON.stringify(dictionaries.map(({ id, storeId, code, version }) => ({ id, storeId, code, version })))).digest("hex");
  const run = existingRun ?? await prisma.settingsMigrationRun.create({ data: { runKey, status: SettingsMigrationRunStatus.RUNNING, backupFile: backup.backupFile, featureFlag: "settings-workbench", checkpoint: { sourceCount: dictionaries.length, digest } } });
  let created = 0;
  let skipped = 0;
  let reviewCount = 0;
  try {
    await prisma.$transaction(async (tx) => {
      for (const dictionary of dictionaries) {
        const requestId = `${requestPrefix}${dictionary.id}`;
        const isGlobal = dictionary.source === "SYSTEM" || dictionary.source === "HQ_TEMPLATE";
        if (!isGlobal && !stores.has(dictionary.storeId)) {
          await tx.settingsMigrationReview.upsert({ where: { runId_sourceType_sourceId: { runId: run.id, sourceType: "Dictionary", sourceId: dictionary.id } }, create: { runId: run.id, sourceType: "Dictionary", sourceId: dictionary.id, reason: "无法识别门店归属，未自动迁移", payload: { code: dictionary.code, storeId: dictionary.storeId }, status: SettingsMigrationReviewStatus.PENDING }, update: {} });
          reviewCount += 1;
          continue;
        }
        const existing = await tx.settingsConfigVersion.findFirst({ where: { createdById: operator.id, requestId } });
        if (existing) { skipped += 1; continue; }
        const now = new Date();
        const version = await tx.settingsConfigVersion.create({ data: { domain: isGlobal ? SettingsConfigDomain.HQ : SettingsConfigDomain.STORE, capabilityCode: "settings.dictionary", scopeId: isGlobal ? "global" : dictionary.storeId, version: 1, status: SettingsConfigStatus.PUBLISHED, effectiveAt: now, payload: { dictionaryId: dictionary.id, code: dictionary.code, name: dictionary.name, source: dictionary.source, status: dictionary.status, items: dictionary.dictionaryItems.map((item) => ({ code: item.code, name: item.name, status: item.status, source: item.source, usageCount: item.usageCount })) }, createdById: operator.id, updatedById: operator.id, publishedById: operator.id, publishedAt: now, requestId } });
        await tx.auditEvent.create({ data: { action: "settings.migration.legacy_imported", actorId: operator.id, storeId: isGlobal ? null : dictionary.storeId, targetType: "SettingsConfigVersion", targetId: version.id, metadata: { sourceType: "Dictionary", sourceId: dictionary.id, requestId, operator: "system migration" } } });
        created += 1;
      }
      await tx.settingsMigrationRun.update({ where: { id: run.id }, data: { status: SettingsMigrationRunStatus.COMPLETED, completedAt: new Date(), summary: { created, skipped, reviewCount, sourceCount: dictionaries.length, digest }, checkpoint: { sourceCount: dictionaries.length, processed: created + skipped + reviewCount, digest } } });
      await tx.auditEvent.create({ data: { action: "settings.migration.completed", actorId: operator.id, targetType: "SettingsMigrationRun", targetId: run.id, metadata: { runKey, created, skipped, reviewCount, backupFile: backup.backupFile, backupSkipped: backup.skipped, featureFlag: "settings-workbench" } } });
    });
  } catch (error) {
    await prisma.settingsMigrationRun.update({ where: { id: run.id }, data: { status: SettingsMigrationRunStatus.FAILED, errorMessage: error instanceof Error ? error.message : "unknown migration error" } }).catch(() => undefined);
    throw error;
  }
  console.log(JSON.stringify({ runKey, created, skipped, reviewCount, total: dictionaries.length, backupFile: backup.backupFile, backupSkipped: backup.skipped }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());