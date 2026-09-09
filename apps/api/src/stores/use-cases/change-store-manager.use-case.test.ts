import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition } from "@prisma/client";
import { StoreRepository } from "../repositories/store.repository";
import { ChangeStoreManagerUseCase } from "./change-store-manager.use-case";

test("ChangeStoreManagerUseCase replaces current manager and notifies removed manager", async () => {
  const transactionCalls: string[] = [];
  const notifications: Array<{ userId: string; type: string; payload: unknown }> = [];
  const auditEvents: unknown[] = [];
  const invalidatedUsers: string[] = [];
  const currentManager = { id: "member-current", userId: "manager-old" };
  const tx = {
    storeMember: {
      findUnique: async (args: unknown) => {
        transactionCalls.push("member.findUnique");
        assert.deepEqual(args, { where: { id: "member-current" }, select: { userId: true } });
        return { userId: "manager-old" };
      },
      delete: async (args: unknown) => {
        transactionCalls.push("member.delete");
        assert.deepEqual(args, { where: { id: "member-current" } });
      },
      create: async (args: unknown) => {
        transactionCalls.push("member.create");
        assert.deepEqual(args, {
          data: {
            storeId: "store-1",
            userId: "manager-new",
            position: StorePosition.MANAGER
          }
        });
      }
    },
    permissionRoleBinding: {
      updateMany: async (args: unknown) => {
        const updateArgs = args as { where: { userId: string } };
        transactionCalls.push(`binding.disable:${updateArgs.where.userId}`);
        assert.deepEqual(args, {
          where: { userId: updateArgs.where.userId, scopeType: "STORE", storeId: "store-1", status: "ACTIVE" },
          data: { status: "DISABLED" }
        });
      },
      upsert: async (args: unknown) => {
        transactionCalls.push("binding.upsert");
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
        transactionCalls.push("role.findUnique");
        assert.deepEqual(args, { where: { code: StorePosition.MANAGER } });
        return { id: "role-manager", status: "ACTIVE" };
      }
    },
    auditEvent: {
      create: async (args: unknown) => {
        transactionCalls.push("audit.create");
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
    store: {
      findUnique: async (args: unknown) => {
        assert.deepEqual(args, { where: { id: "store-1" } });
        return { id: "store-1", name: "门店一" };
      }
    },
    user: {
      findUnique: async (args: unknown) => {
        assert.deepEqual(args, { where: { id: "manager-new" } });
        return { id: "manager-new" };
      }
    },
    storeMember: {
      findFirst: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { storeId: "store-1", position: StorePosition.MANAGER }
        });
        return currentManager;
      },
      findUnique: async (args: unknown) => {
        assert.deepEqual(args, { where: { userId: "manager-new" } });
        return null;
      }
    },
    $transaction: async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)
  };
  const useCase = new ChangeStoreManagerUseCase(
    new StoreRepository(prisma as never),
    {
      send: async (userId: string, type: string, payload: unknown) => {
        notifications.push({ userId, type, payload });
      }
    } as never,
    { record: (event: unknown) => auditEvents.push(event) } as never,
    undefined,
    undefined,
    { invalidateUserCache: (userId: string) => invalidatedUsers.push(userId) } as never
  );

  const result = await useCase.execute("admin-1", "store-1", { newManagerId: "manager-new" });

  assert.deepEqual(result, { success: true });
  assert.deepEqual(invalidatedUsers, ["manager-new", "manager-old"]);
  assert.deepEqual(transactionCalls, [
    "member.findUnique",
    "member.delete",
    "binding.disable:manager-old",
    "member.create",
    "role.findUnique",
    "binding.disable:manager-new",
    "binding.upsert",
    "audit.create"
  ]);
  assert.deepEqual(notifications, [
    {
      userId: "manager-old",
      type: "REMOVED_FROM_STORE",
      payload: {
        storeId: "store-1",
        storeName: "门店一",
        reason: "店长职位已变更"
      }
    }
  ]);
  assert.deepEqual(auditEvents, [
    {
      action: "STORE_MANAGER_CHANGED",
      targetType: "store",
      targetId: "store-1",
      metadata: {
        previousManagerId: "manager-old",
        newManagerId: "manager-new"
      }
    }
  ]);
});
