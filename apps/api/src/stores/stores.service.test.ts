import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition, StoreStatus, SubmissionStatus } from "@prisma/client";
import { StoresService } from "./stores.service";
import { ReviewAction } from "./dto/review-store.dto";
import { ReviewStoreSubmissionUseCase } from "./use-cases/review-store-submission.use-case";

test("listPublishedStores caps pageSize at 100", async () => {
  let capturedTake = 0;
  const prisma = {
    store: {
      count: async () => 0,
      findMany: async (args: { take: number }) => {
        capturedTake = args.take;
        return [];
      }
    }
  };
  const service = createStoresService(prisma, {});

  await service.listPublishedStores({ page: 1, pageSize: 500 });

  assert.equal(capturedTake, 100);
});

test("reviewSubmission approval publishes store, replaces photos, and notifies manager", async () => {
  const submission = {
    id: "submission-1",
    storeId: "store-1",
    name: "已审核门店",
    address: "新地址",
    description: "新描述",
    status: SubmissionStatus.PENDING,
    store: { name: "旧门店" },
    photos: [
      { url: "https://example.com/cover.jpg", isCover: true, order: 0 },
      { url: "https://example.com/detail.jpg", isCover: false, order: 1 }
    ]
  };
  const transactionCalls: string[] = [];
  const notifications: Array<{ userId: string; type: string; payload: unknown }> = [];

  const tx = {
    storeAuditSubmission: {
      update: async (args: unknown) => {
        transactionCalls.push("submission.update");
        const updateArgs = args as { data: { reviewedAt: unknown } };
        assert.ok(updateArgs.data.reviewedAt instanceof Date);
        assert.deepEqual(args, {
          where: { id: "submission-1" },
          data: {
            status: SubmissionStatus.APPROVED,
            reviewedById: "auditor-1",
            reviewedAt: updateArgs.data.reviewedAt
          }
        });
      }
    },
    store: {
      update: async (args: unknown) => {
        transactionCalls.push("store.update");
        assert.deepEqual(args, {
          where: { id: "store-1" },
          data: {
            name: "已审核门店",
            address: "新地址",
            description: "新描述",
            status: StoreStatus.PUBLISHED
          }
        });
      }
    },
    storePhoto: {
      deleteMany: async (args: unknown) => {
        transactionCalls.push("photo.deleteMany");
        assert.deepEqual(args, { where: { storeId: "store-1" } });
      },
      createMany: async (args: unknown) => {
        transactionCalls.push("photo.createMany");
        assert.deepEqual(args, {
          data: [
            {
              storeId: "store-1",
              url: "https://example.com/cover.jpg",
              isCover: true,
              order: 0
            },
            {
              storeId: "store-1",
              url: "https://example.com/detail.jpg",
              isCover: false,
              order: 1
            }
          ]
        });
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
    storeAuditSubmission: {
      findUnique: async () => submission
    },
    storeMember: {
      findFirst: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { storeId: "store-1", position: StorePosition.MANAGER }
        });
        return { userId: "manager-1" };
      }
    }
  };
  const notificationsService = {
    send: async (userId: string, type: string, payload: unknown) => {
      notifications.push({ userId, type, payload });
    }
  };
  const service = createStoresService(prisma, notificationsService);

  const result = await service.reviewSubmission("auditor-1", true, "submission-1", {
    action: ReviewAction.APPROVE
  });

  assert.deepEqual(result, { success: true });
  assert.deepEqual(transactionCalls, [
    "submission.update",
    "store.update",
    "photo.deleteMany",
    "photo.createMany"
  ]);
  assert.deepEqual(notifications, [
    {
      userId: "manager-1",
      type: "AUDIT_APPROVED",
      payload: { storeId: "store-1", storeName: "已审核门店" }
    }
  ]);
});

test("reviewSubmission rejection restores prior public store and notifies manager with reason", async () => {
  const storeUpdates: unknown[] = [];
  const notifications: Array<{ userId: string; type: string; payload: unknown }> = [];
  const prisma = {
    storeAuditSubmission: {
      findUnique: async () => ({
        id: "submission-2",
        storeId: "store-2",
        status: SubmissionStatus.PENDING,
        store: { name: "待驳回门店" },
        photos: []
      }),
      update: async (args: unknown) => {
        const updateArgs = args as { data: { reviewedAt: unknown } };
        assert.ok(updateArgs.data.reviewedAt instanceof Date);
        assert.deepEqual(args, {
          where: { id: "submission-2" },
          data: {
            status: SubmissionStatus.REJECTED,
            reviewNote: "资料不完整",
            reviewedById: "auditor-2",
            reviewedAt: updateArgs.data.reviewedAt
          }
        });
      },
      count: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { storeId: "store-2", status: SubmissionStatus.APPROVED }
        });
        return 1;
      }
    },
    store: {
      update: async (args: unknown) => {
        storeUpdates.push(args);
      }
    },
    storeMember: {
      findFirst: async () => ({ userId: "manager-2" })
    }
  };
  const notificationsService = {
    send: async (userId: string, type: string, payload: unknown) => {
      notifications.push({ userId, type, payload });
    }
  };
  const service = createStoresService(prisma, notificationsService);

  const result = await service.reviewSubmission("auditor-2", true, "submission-2", {
    action: ReviewAction.REJECT,
    reviewNote: "资料不完整"
  });

  assert.deepEqual(result, { success: true });
  assert.deepEqual(storeUpdates, [
    {
      where: { id: "store-2" },
      data: { status: StoreStatus.PUBLISHED }
    }
  ]);
  assert.deepEqual(notifications, [
    {
      userId: "manager-2",
      type: "AUDIT_REJECTED",
      payload: { storeId: "store-2", storeName: "待驳回门店", reviewNote: "资料不完整" }
    }
  ]);
});

function createStoresService(prisma: unknown, notifications: unknown) {
  return new StoresService(
    prisma as never,
    notifications as never,
    new ReviewStoreSubmissionUseCase(prisma as never, notifications as never)
  );
}
