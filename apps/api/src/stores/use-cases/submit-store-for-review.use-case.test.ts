import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition, StoreStatus, SubmissionStatus } from "@prisma/client";
import { StoreRepository } from "../repositories/store.repository";
import { SubmitStoreForReviewUseCase } from "./submit-store-for-review.use-case";

test("SubmitStoreForReviewUseCase closes pending submissions, creates a normalized submission, and marks store pending review", async () => {
  const calls: string[] = [];
  const createdSubmission = { id: "submission-1", photos: [] };
  const prisma = {
    storeMember: {
      findUnique: async (args: unknown) => {
        calls.push("member.findUnique");
        assert.deepEqual(args, { where: { userId: "manager-1" } });
        return { storeId: "store-1", position: StorePosition.MANAGER };
      }
    },
    store: {
      findUniqueOrThrow: async (args: unknown) => {
        calls.push("store.findUniqueOrThrow");
        assert.deepEqual(args, { where: { id: "store-1" } });
        return { id: "store-1", status: StoreStatus.DRAFTED };
      },
      update: async (args: unknown) => {
        calls.push("store.update");
        assert.deepEqual(args, {
          where: { id: "store-1" },
          data: { status: StoreStatus.PENDING_REVIEW }
        });
      }
    },
    storeAuditSubmission: {
      updateMany: async (args: unknown) => {
        calls.push("submission.updateMany");
        assert.deepEqual(args, {
          where: { storeId: "store-1", status: SubmissionStatus.PENDING },
          data: { status: SubmissionStatus.REJECTED, reviewNote: "新提交覆盖，自动关闭" }
        });
      },
      create: async (args: unknown) => {
        calls.push("submission.create");
        assert.deepEqual(args, {
          data: {
            storeId: "store-1",
            submittedById: "manager-1",
            name: "送审门店",
            address: "送审地址",
            description: "送审描述",
            photos: {
              create: [
                { url: "https://example.com/1.jpg", isCover: true, order: 0 },
                { url: "https://example.com/2.jpg", isCover: false, order: 9 }
              ]
            }
          },
          include: { photos: true }
        });
        return createdSubmission;
      }
    }
  };
  const useCase = new SubmitStoreForReviewUseCase(new StoreRepository(prisma as never));

  const result = await useCase.execute("manager-1", "store-1", {
    name: "送审门店",
    address: "送审地址",
    description: "送审描述",
    photos: [
      { url: "https://example.com/1.jpg" },
      { url: "https://example.com/2.jpg", order: 9 }
    ]
  });

  assert.equal(result, createdSubmission);
  assert.deepEqual(calls, [
    "member.findUnique",
    "store.findUniqueOrThrow",
    "submission.updateMany",
    "submission.create",
    "store.update"
  ]);
});
