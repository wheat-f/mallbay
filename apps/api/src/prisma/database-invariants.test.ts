import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkDatabaseInvariants,
  formatDatabaseInvariantViolations
} from "./database-invariants";

test("checkDatabaseInvariants reports duplicate cover and pending submission risks", async () => {
  const queries: string[] = [];
  const prisma = {
    $queryRawUnsafe: async (query: string) => {
      queries.push(query);
      if (query.includes('"StorePhoto"')) {
        return [{ storeId: "store-1", count: 2 }];
      }
      if (query.includes('"StoreAuditSubmission"')) {
        return [{ storeId: "store-2", count: 3 }];
      }
      if (query.includes('"StoreSubmissionPhoto"')) {
        return [{ submissionId: "submission-1", count: 2 }];
      }
      return [];
    }
  };

  const violations = await checkDatabaseInvariants(prisma);

  assert.equal(queries.length, 3);
  assert.deepEqual(violations, [
    {
      invariant: "store_photo_single_cover",
      message: "同一门店最多只能有一张对外展示封面图",
      rows: [{ storeId: "store-1", count: 2 }]
    },
    {
      invariant: "store_audit_submission_single_pending",
      message: "同一门店同一时间最多只能有一条待审核提交",
      rows: [{ storeId: "store-2", count: 3 }]
    },
    {
      invariant: "store_submission_photo_single_cover",
      message: "同一送审提交最多只能有一张封面图",
      rows: [{ submissionId: "submission-1", count: 2 }]
    }
  ]);
});

test("formatDatabaseInvariantViolations produces deploy-safe failure output", () => {
  const message = formatDatabaseInvariantViolations([
    {
      invariant: "store_photo_single_cover",
      message: "同一门店最多只能有一张对外展示封面图",
      rows: [{ storeId: "store-1", count: 2 }]
    }
  ]);

  assert.match(message, /数据库不变量预检失败/);
  assert.match(message, /store_photo_single_cover/);
  assert.match(message, /store-1/);
});
