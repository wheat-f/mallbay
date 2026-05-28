import assert from "node:assert/strict";
import { test } from "node:test";
import { StoreStatus, SubmissionStatus } from "@prisma/client";
import { StoreRepository } from "./store.repository";

test("StoreRepository delegates submit-for-review persistence to Prisma", async () => {
  const calls: string[] = [];
  const createdSubmission = { id: "submission-1" };
  const prisma = {
    storeMember: {
      findUnique: async (args: unknown) => {
        calls.push("member.findUnique");
        assert.deepEqual(args, { where: { userId: "manager-1" } });
        return { userId: "manager-1" };
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
              create: [{ url: "https://example.com/1.jpg", isCover: true, order: 0 }]
            }
          },
          include: { photos: true }
        });
        return createdSubmission;
      }
    }
  };
  const repository = new StoreRepository(prisma as never);

  assert.deepEqual(await repository.findMemberByUserId("manager-1"), { userId: "manager-1" });
  assert.deepEqual(await repository.getStoreOrThrow("store-1"), {
    id: "store-1",
    status: StoreStatus.DRAFTED
  });
  await repository.closePendingSubmissions("store-1");
  assert.equal(
    await repository.createAuditSubmission({
      storeId: "store-1",
      submittedById: "manager-1",
      name: "送审门店",
      address: "送审地址",
      description: "送审描述",
      photos: [{ url: "https://example.com/1.jpg", isCover: true, order: 0 }]
    }),
    createdSubmission
  );
  await repository.updateStoreStatus("store-1", StoreStatus.PENDING_REVIEW);

  assert.deepEqual(calls, [
    "member.findUnique",
    "store.findUniqueOrThrow",
    "submission.updateMany",
    "submission.create",
    "store.update"
  ]);
});
