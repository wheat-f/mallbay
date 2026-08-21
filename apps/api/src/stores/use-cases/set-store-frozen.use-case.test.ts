import assert from "node:assert/strict";
import { test } from "node:test";
import { StoreStatus } from "@prisma/client";
import { StoreRepository } from "../repositories/store.repository";
import { SetStoreFrozenUseCase } from "./set-store-frozen.use-case";

test("SetStoreFrozenUseCase freezes store and notifies all members", async () => {
  const notifications: Array<{ userId: string; type: string; payload: unknown }> = [];
  const auditEvents: unknown[] = [];
  const prisma = {
    store: {
      findUnique: async (args: unknown) => {
        assert.deepEqual(args, { where: { id: "store-1" } });
        return { id: "store-1", name: "门店一", status: StoreStatus.PUBLISHED };
      },
      update: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { id: "store-1" },
          data: { status: StoreStatus.FROZEN }
        });
      }
    },
    storeMember: {
      findMany: async (args: unknown) => {
        assert.deepEqual(args, { where: { storeId: "store-1" } });
        return [{ userId: "user-1" }, { userId: "user-2" }];
      }
    }
  };
  const useCase = new SetStoreFrozenUseCase(
    new StoreRepository(prisma as never),
    {
      send: async (userId: string, type: string, payload: unknown) => {
        notifications.push({ userId, type, payload });
      }
    } as never,
    { record: (event: unknown) => auditEvents.push(event) } as never
  );

  const result = await useCase.execute("admin-1", "store-1", true);

  assert.deepEqual(result, { success: true });
  assert.deepEqual(notifications, [
    {
      userId: "user-1",
      type: "STORE_FROZEN",
      payload: { storeId: "store-1", storeName: "门店一" }
    },
    {
      userId: "user-2",
      type: "STORE_FROZEN",
      payload: { storeId: "store-1", storeName: "门店一" }
    }
  ]);
  assert.deepEqual(auditEvents, [
    {
      action: "STORE_FROZEN",
      targetType: "store",
      targetId: "store-1",
      metadata: { status: StoreStatus.FROZEN }
    }
  ]);
});
