import test from "node:test";
import assert from "node:assert/strict";
import { SettingsMigrationReviewStatus } from "@prisma/client";
import { SettingsMigrationReviewsService } from "./migration-reviews.service";

test("migration review resolution updates state and writes an audit in one transaction", async () => {
  let updateData: Record<string, unknown> | undefined;
  let auditData: Record<string, unknown> | undefined;
  const tx = {
    settingsMigrationReview: { update: async ({ data }: { data: Record<string, unknown> }) => { updateData = data; return { id: "review-1", ...data }; } },
    auditEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { auditData = data; return data; } }
  };
  const prisma = { settingsMigrationReview: { findUnique: async () => ({ id: "review-1", runId: "run-1", sourceType: "Permissions", sourceId: "code-policy", status: SettingsMigrationReviewStatus.PENDING }) }, $transaction: async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx) };
  const access = { assert: async () => ({ actor: { id: "hq-1" } }) };
  const service = new SettingsMigrationReviewsService(prisma as never, access as never);
  const result = await service.resolve({ id: "hq-1" }, "review-1", { status: SettingsMigrationReviewStatus.RESOLVED, reason: "总部确认沿用代码策略" });
  assert.equal(result.status, SettingsMigrationReviewStatus.RESOLVED);
  assert.equal(updateData?.resolvedById, "hq-1");
  assert.equal((auditData?.metadata as { reason: string }).reason, "总部确认沿用代码策略");
});
