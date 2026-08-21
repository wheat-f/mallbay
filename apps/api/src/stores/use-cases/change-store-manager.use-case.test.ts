import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition } from "@prisma/client";
import { StoreRepository } from "../repositories/store.repository";
import { ChangeStoreManagerUseCase } from "./change-store-manager.use-case";

test("ChangeStoreManagerUseCase replaces current manager and notifies removed manager", async () => {
  const transactionCalls: string[] = [];
  const notifications: Array<{ userId: string; type: string; payload: unknown }> = [];
  const auditEvents: unknown[] = [];
  const currentManager = { id: "member-current", userId: "manager-old" };
  const tx = {
    storeMember: {
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
    { record: (event: unknown) => auditEvents.push(event) } as never
  );

  const result = await useCase.execute("admin-1", "store-1", { newManagerId: "manager-new" });

  assert.deepEqual(result, { success: true });
  assert.deepEqual(transactionCalls, ["member.delete", "member.create"]);
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
