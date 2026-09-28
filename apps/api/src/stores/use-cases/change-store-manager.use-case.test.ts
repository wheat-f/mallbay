import assert from "node:assert/strict";
import { test } from "node:test";
import { ChangeStoreManagerUseCase } from "./change-store-manager.use-case";

test("manager transfer persists through repository and retries notification with one key", async () => {
  const notifications: Array<{ userId: string; type: string; payload: unknown; dedupeKey?: string }> = [];
  const invalidatedUsers: string[] = [];
  const repository = {
    findStore: async () => ({ id: "store-1", name: "门店一" }),
    findUser: async () => ({ id: "manager-new" }),
    findStoreManager: async () => ({ id: "member-current", userId: "manager-old" }),
    findMemberByUserId: async () => null,
    changeManager: async (input: Record<string, unknown>) => {
      assert.equal(input.currentManagerId, "member-current");
      assert.equal(input.currentManagerUserId, "manager-old");
      assert.equal(input.newManagerId, "manager-new");
      assert.equal(input.commandId, "manager-command-1");
      return { value: { success: true, previousManagerUserId: "manager-old" }, replayed: false };
    }
  };
  const useCase = new ChangeStoreManagerUseCase(
    repository as never,
    {
      send: async (userId: string, type: string, payload: unknown, dedupeKey?: string) => {
        notifications.push({ userId, type, payload, dedupeKey });
      }
    } as never,
    undefined,
    { invalidateUserCache: (userId: string) => invalidatedUsers.push(userId) } as never
  );

  assert.deepEqual(
    await useCase.execute("admin-1", "store-1", { newManagerId: "manager-new" }, "manager-command-1"),
    { success: true }
  );
  assert.deepEqual(invalidatedUsers, ["manager-new", "manager-old"]);
  assert.deepEqual(notifications, [{
    userId: "manager-old",
    type: "REMOVED_FROM_STORE",
    payload: { storeId: "store-1", storeName: "门店一", reason: "店长职位已变更" },
    dedupeKey: "store-manager:manager-command-1:removed"
  }]);
});

test("manager transfer replay does not invalidate permissions again", async () => {
  const notified: string[] = [];
  const invalidated: string[] = [];
  const repository = {
    findStore: async () => ({ id: "store-1", name: "门店一" }),
    findUser: async () => ({ id: "manager-new" }),
    findStoreManager: async () => ({ id: "member-new", userId: "manager-new" }),
    findMemberByUserId: async () => ({ id: "member-new", storeId: "store-1" }),
    changeManager: async () => ({ value: { success: true, previousManagerUserId: "manager-old" }, replayed: true })
  };
  const useCase = new ChangeStoreManagerUseCase(
    repository as never,
    { send: async (_userId: string, _type: string, _payload: unknown, key?: string) => { notified.push(key ?? ""); } } as never,
    undefined,
    { invalidateUserCache: (userId: string) => invalidated.push(userId) } as never
  );

  assert.deepEqual(
    await useCase.execute("admin-1", "store-1", { newManagerId: "manager-new" }, "manager-command-1"),
    { success: true }
  );
  assert.deepEqual(invalidated, []);
  assert.deepEqual(notified, ["store-manager:manager-command-1:removed"]);
});
