import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition, StoreStatus, SubmissionStatus } from "@prisma/client";
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

test("StoreRepository converts pending submission invariant conflicts to ConflictException", async () => {
  const prisma = {
    storeAuditSubmission: {
      create: async () => {
        throw {
          code: "P2002",
          meta: { target: "StoreAuditSubmission_one_pending_per_store_uidx" }
        };
      }
    }
  };
  const repository = new StoreRepository(prisma as never);

  await assert.rejects(
    () =>
      repository.createAuditSubmission({
        storeId: "store-1",
        submittedById: "manager-1",
        name: "送审门店",
        photos: [{ url: "https://example.com/1.jpg", isCover: true, order: 0 }]
      }),
    /该门店已有待审核提交/
  );
});

test("StoreRepository delegates review-submission persistence to Prisma", async () => {
  const calls: string[] = [];
  const submission = {
    id: "submission-1",
    storeId: "store-1",
    name: "审核门店",
    address: "审核地址",
    description: "审核描述",
    photos: [{ url: "https://example.com/1.jpg", isCover: true, order: 0 }],
    store: { name: "旧门店" }
  };
  const tx = {
    storeAuditSubmission: {
      update: async (args: unknown) => {
        calls.push("tx.submission.update");
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
        calls.push("tx.store.update");
        assert.deepEqual(args, {
          where: { id: "store-1" },
          data: {
            name: "审核门店",
            address: "审核地址",
            description: "审核描述",
            status: StoreStatus.PUBLISHED
          }
        });
      }
    },
    storePhoto: {
      deleteMany: async (args: unknown) => {
        calls.push("tx.photo.deleteMany");
        assert.deepEqual(args, { where: { storeId: "store-1" } });
      },
      createMany: async (args: unknown) => {
        calls.push("tx.photo.createMany");
        assert.deepEqual(args, {
          data: [
            {
              storeId: "store-1",
              url: "https://example.com/1.jpg",
              isCover: true,
              order: 0
            }
          ]
        });
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
    storeAuditSubmission: {
      findUnique: async (args: unknown) => {
        calls.push("submission.findUnique");
        assert.deepEqual(args, {
          where: { id: "submission-1" },
          include: { photos: true, store: true }
        });
        return submission;
      },
      update: async (args: unknown) => {
        calls.push("submission.update");
        const updateArgs = args as { data: { reviewedAt: unknown } };
        assert.ok(updateArgs.data.reviewedAt instanceof Date);
        assert.deepEqual(args, {
          where: { id: "submission-1" },
          data: {
            status: SubmissionStatus.REJECTED,
            reviewNote: "资料不完整",
            reviewedById: "auditor-1",
            reviewedAt: updateArgs.data.reviewedAt
          }
        });
      },
      count: async (args: unknown) => {
        calls.push("submission.count");
        assert.deepEqual(args, {
          where: { storeId: "store-1", status: SubmissionStatus.APPROVED }
        });
        return 1;
      }
    },
    store: {
      update: async (args: unknown) => {
        calls.push("store.update");
        assert.deepEqual(args, {
          where: { id: "store-1" },
          data: { status: StoreStatus.PUBLISHED }
        });
      }
    },
    storeMember: {
      findFirst: async (args: unknown) => {
        calls.push("member.findFirst");
        assert.deepEqual(args, {
          where: { storeId: "store-1", position: StorePosition.MANAGER }
        });
        return { userId: "manager-1" };
      }
    }
  };
  const repository = new StoreRepository(prisma as never);

  assert.equal(await repository.findSubmissionWithStore("submission-1"), submission);
  await repository.approveSubmission("auditor-1", "submission-1", submission);
  await repository.rejectSubmission("auditor-1", "submission-1", "资料不完整");
  assert.equal(await repository.countApprovedSubmissions("store-1"), 1);
  await repository.updateStoreStatus("store-1", StoreStatus.PUBLISHED);
  assert.deepEqual(await repository.findStoreManager("store-1"), { userId: "manager-1" });

  assert.deepEqual(calls, [
    "submission.findUnique",
    "tx.submission.update",
    "tx.store.update",
    "tx.photo.deleteMany",
    "tx.photo.createMany",
    "submission.update",
    "submission.count",
    "store.update",
    "member.findFirst"
  ]);
});

test("StoreRepository converts approved cover invariant conflicts to ConflictException", async () => {
  const tx = {
    storeAuditSubmission: {
      update: async () => undefined
    },
    store: {
      update: async () => undefined
    },
    storePhoto: {
      deleteMany: async () => undefined,
      createMany: async () => {
        throw {
          code: "P2002",
          meta: { target: "StorePhoto_one_cover_per_store_uidx" }
        };
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)
  };
  const repository = new StoreRepository(prisma as never);

  await assert.rejects(
    () =>
      repository.approveSubmission("auditor-1", "submission-1", {
        storeId: "store-1",
        name: "审核门店",
        address: null,
        description: null,
        photos: [{ url: "https://example.com/1.jpg", isCover: true, order: 0 }]
      }),
    /该门店已有封面图/
  );
});

test("StoreRepository delegates store admin persistence to Prisma", async () => {
  const calls: string[] = [];
  const tx = {
    storeMember: {
      findUnique: async (args: unknown) => {
        calls.push("tx.member.findUnique");
        assert.deepEqual(args, { where: { id: "member-current" }, select: { userId: true } });
        return { userId: "manager-old" };
      },
      delete: async (args: unknown) => {
        calls.push("tx.member.delete");
        assert.deepEqual(args, { where: { id: "member-current" } });
      },
      update: async (args: unknown) => {
        calls.push("tx.member.update");
        assert.deepEqual(args, {
          where: { id: "member-new" },
          data: { position: StorePosition.MANAGER }
        });
      }
    },
    permissionRoleBinding: {
      updateMany: async (args: unknown) => {
        const updateArgs = args as { where: { userId: string } };
        calls.push(`tx.binding.disable:${updateArgs.where.userId}`);
        assert.deepEqual(args, {
          where: {
            userId: updateArgs.where.userId,
            scopeType: "STORE",
            storeId: "store-1",
            status: "ACTIVE"
          },
          data: { status: "DISABLED" }
        });
      },
      upsert: async (args: unknown) => {
        calls.push("tx.binding.upsert");
        const upsertArgs = args as { update: { effectiveAt: unknown } };
        assert.ok(upsertArgs.update.effectiveAt instanceof Date);
        assert.deepEqual(args, {
          where: { userId_roleId_scopeType_storeId: { userId: "manager-new", roleId: "role-manager", scopeType: "STORE", storeId: "store-1" } },
          update: { status: "ACTIVE", effectiveAt: upsertArgs.update.effectiveAt, expiredAt: null, createdById: "admin-1" },
          create: { userId: "manager-new", roleId: "role-manager", scopeType: "STORE", storeId: "store-1", createdById: "admin-1" }
        });
        return { id: "binding-manager-new" };
      }
    },
    permissionRole: {
      findUnique: async (args: unknown) => {
        calls.push("tx.role.findUnique");
        assert.deepEqual(args, { where: { code: StorePosition.MANAGER } });
        return { id: "role-manager", status: "ACTIVE" };
      }
    },
    auditEvent: {
      create: async (args: unknown) => {
        calls.push("tx.audit.create");
        assert.deepEqual(args, {
          data: {
            action: "permissions.binding.changed",
            actorId: "admin-1",
            storeId: "store-1",
            targetType: "PermissionRoleBinding",
            targetId: "binding-manager-new",
            metadata: { userId: "manager-new", roleId: "role-manager", source: "store_manager_changed" }
          }
        });
      }
    }
  };
  const prisma = {
    $transaction: async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx),
    store: {
      findUnique: async (args: unknown) => {
        calls.push("store.findUnique");
        assert.deepEqual(args, { where: { id: "store-1" } });
        return { id: "store-1", name: "门店一", status: StoreStatus.PUBLISHED };
      },
      update: async (args: unknown) => {
        calls.push("store.update");
        assert.deepEqual(args, {
          where: { id: "store-1" },
          data: { status: StoreStatus.FROZEN }
        });
      }
    },
    user: {
      findUnique: async (args: unknown) => {
        calls.push("user.findUnique");
        assert.deepEqual(args, { where: { id: "manager-new" } });
        return { id: "manager-new" };
      }
    },
    storeMember: {
      findFirst: async (args: unknown) => {
        calls.push("member.findFirst");
        assert.deepEqual(args, {
          where: { storeId: "store-1", position: StorePosition.MANAGER }
        });
        return { id: "member-current", userId: "manager-old" };
      },
      findUnique: async (args: unknown) => {
        calls.push("member.findUnique");
        assert.deepEqual(args, { where: { userId: "manager-new" } });
        return { id: "member-new", userId: "manager-new", storeId: "store-1" };
      },
      findMany: async (args: unknown) => {
        calls.push("member.findMany");
        assert.deepEqual(args, { where: { storeId: "store-1" } });
        return [{ userId: "user-1" }];
      }
    }
  };
  const repository = new StoreRepository(prisma as never);

  assert.deepEqual(await repository.findStore("store-1"), {
    id: "store-1",
    name: "门店一",
    status: StoreStatus.PUBLISHED
  });
  assert.deepEqual(await repository.findUser("manager-new"), { id: "manager-new" });
  assert.deepEqual(await repository.findStoreManager("store-1"), {
    id: "member-current",
    userId: "manager-old"
  });
  assert.deepEqual(await repository.findMemberByUserId("manager-new"), {
    id: "member-new",
    userId: "manager-new",
    storeId: "store-1"
  });
  await repository.changeManager({
    storeId: "store-1",
    actorId: "admin-1",
    newManagerId: "manager-new",
    currentManagerId: "member-current",
    existingNewManagerMemberId: "member-new"
  });
  await repository.updateStoreStatus("store-1", StoreStatus.FROZEN);
  assert.deepEqual(await repository.findStoreMembers("store-1"), [{ userId: "user-1" }]);

  assert.deepEqual(calls, [
    "store.findUnique",
    "user.findUnique",
    "member.findFirst",
    "member.findUnique",
    "tx.member.findUnique",
    "tx.member.delete",
    "tx.binding.disable:manager-old",
    "tx.member.update",
    "tx.role.findUnique",
    "tx.binding.disable:manager-new",
    "tx.binding.upsert",
    "tx.audit.create",
    "store.update",
    "member.findMany"
  ]);
});
