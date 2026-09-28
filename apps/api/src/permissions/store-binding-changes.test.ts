import assert from "node:assert/strict";
import { test } from "node:test";
import { RuntimeAccessSnapshotStore } from "./domain/runtime-access-snapshot.store";
import { StoreBindingChanges } from "./store-binding-changes";

function commandStore() {
  const records = new Map<string, { id: string; intentHash: string; result: unknown }>();
  const audit: unknown[] = [];
  const tx = {
    storeBindingCommand: {
      findUnique: async ({ where }: { where: { id: string } }) => records.get(where.id) ?? null,
      create: async ({ data }: { data: { id: string; intentHash: string; result: unknown } }) => {
        records.set(data.id, data);
        return data;
      }
    },
    auditEvent: { create: async (input: unknown) => { audit.push(input); } }
  };
  const prisma = {
    storeBindingCommand: tx.storeBindingCommand,
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
  };
  return { prisma, tx, records, audit };
}

test("store binding command replays the original result and rejects a changed intent", async () => {
  const fake = commandStore();
  const changes = new StoreBindingChanges(fake.prisma as never, new RuntimeAccessSnapshotStore());
  let composed = 0;
  const input = {
    commandId: "cmd-1",
    actorId: "admin-1",
    authority: "governance" as const,
    intent: { operation: "noop", target: "u1" },
    compose: async () => {
      composed++;
      return { result: { ok: true }, actions: [] };
    }
  };
  const first = await changes.commit(input);
  const replayed = await changes.commit(input);
  assert.deepEqual(first, { value: { ok: true }, changes: [], replayed: false });
  assert.deepEqual(replayed, { value: { ok: true }, changes: [], replayed: true });
  assert.equal(composed, 1);
  assert.equal(fake.records.size, 1);
  assert.equal(fake.audit.length, 1);

  await assert.rejects(
    () => changes.commit({ ...input, intent: { operation: "noop", target: "u2" } }),
    /绑定变更标识已用于不同内容/
  );
  assert.equal(composed, 1);
});

test("stale authorization revision rejects before business writes", async () => {
  const fake = commandStore();
  const prisma = {
    ...fake.prisma,
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback({
      ...fake.tx,
      user: { findUnique: async () => ({ authRevision: 3 }) }
    })
  };
  const changes = new StoreBindingChanges(prisma as never, new RuntimeAccessSnapshotStore());
  let composed = false;
  await assert.rejects(
    () => changes.commit({
      commandId: "cmd-stale",
      actorId: "admin-1",
      authority: "governance",
      intent: { operation: "grant", userId: "u1" },
      expected: [{ kind: "revision", userId: "u1", value: 2 }],
      compose: async () => {
        composed = true;
        return { result: true, actions: [] };
      }
    }),
    /授权版本已变化/
  );
  assert.equal(composed, false);
  assert.equal(fake.records.size, 0);
  assert.equal(fake.audit.length, 0);
});

test("exhausted serializable retries become a domain conflict", async () => {
  const fake = commandStore();
  let attempts = 0;
  const prisma = {
    ...fake.prisma,
    $transaction: async () => {
      attempts++;
      throw { code: "P2034" };
    }
  };
  const changes = new StoreBindingChanges(prisma as never, new RuntimeAccessSnapshotStore());
  await assert.rejects(
    () => changes.commit({
      commandId: "cmd-race",
      actorId: "admin-1",
      authority: "governance",
      intent: { operation: "grant" },
      compose: async () => ({ result: true, actions: [] })
    }),
    /并发冲突/
  );
  assert.equal(attempts, 3);
});

test("explicit nonmember grant creates per-binding audit and increments revision once", async () => {
  const fake = commandStore();
  const snapshots = new RuntimeAccessSnapshotStore();
  snapshots.set("u1", { roles: [], permissions: [] });
  const audits: Array<{ data: { action: string; targetId?: string } }> = [];
  let revisionIncrements = 0;
  const tx = {
    ...fake.tx,
    user: {
      findUnique: async () => ({ id: "u1", authRevision: 0 }),
      update: async () => { revisionIncrements++; }
    },
    store: { findUnique: async () => ({ id: "s1" }) },
    storeMember: {
      findUnique: async () => null,
      findMany: async () => [{ userId: "manager-1" }]
    },
    permissionRole: {
      findUnique: async ({ where }: { where: { id?: string; code?: string } }) =>
        where.code === "MANAGER"
          ? { id: "role-manager", code: "MANAGER", status: "ACTIVE" }
          : { id: "role-sales", code: "SALES", status: "ACTIVE" }
    },
    permissionRoleBinding: {
      findFirst: async ({ where }: { where: { userId: string } }) =>
        where.userId === "manager-1" ? { id: "manager-binding" } : null,
      findMany: async () => [{ userId: "manager-1" }],
      create: async () => ({
        id: "binding-sales", userId: "u1", storeId: "s1", roleId: "role-sales",
        scopeType: "STORE", status: "ACTIVE"
      })
    },
    auditEvent: { create: async (input: { data: { action: string; targetId?: string } }) => { audits.push(input); } }
  };
  const prisma = {
    ...fake.prisma,
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const changes = new StoreBindingChanges(prisma as never, snapshots);
  const result = await changes.commit({
    commandId: "cmd-grant",
    actorId: "admin-1",
    authority: "governance",
    intent: { operation: "bindRole", userId: "u1", roleId: "role-sales", storeId: "s1" },
    compose: async () => ({
      result: { ok: true },
      actions: [{ kind: "grant", userId: "u1", storeId: "s1", roleId: "role-sales" }]
    })
  });
  assert.equal(result.changes[0]?.id, "binding-sales");
  assert.equal(revisionIncrements, 1);
  assert.equal(snapshots.has("u1"), false);
  assert.deepEqual(audits.map((item) => item.data.action), [
    "permissions.binding.created",
    "permissions.store_binding_change.committed"
  ]);
  assert.equal(audits[0].data.targetId, "binding-sales");
  assert.equal(fake.records.size, 1);
});

test("manual governance cannot grant MANAGER", async () => {
  const fake = commandStore();
  const tx = {
    ...fake.tx,
    user: { findUnique: async () => ({ id: "u1" }) },
    store: { findUnique: async () => ({ id: "s1" }) },
    permissionRole: { findUnique: async () => ({ id: "role-manager", code: "MANAGER", status: "ACTIVE" }) }
  };
  const prisma = {
    ...fake.prisma,
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const changes = new StoreBindingChanges(prisma as never, new RuntimeAccessSnapshotStore());
  await assert.rejects(
    () => changes.commit({
      commandId: "cmd-manager",
      actorId: "admin-1",
      authority: "governance",
      intent: { operation: "bindRole", userId: "u1", roleId: "role-manager", storeId: "s1" },
      compose: async () => ({
        result: true,
        actions: [{ kind: "grant", userId: "u1", storeId: "s1", roleId: "role-manager" }]
      })
    }),
    /MANAGER 绑定只能通过建店或换店长/
  );
  assert.equal(fake.records.size, 0);
});

test("leaving a store disables every active binding with one user revision increment", async () => {
  const fake = commandStore();
  const active = [
    { id: "binding-sales", userId: "u1", storeId: "s1", roleId: "role-sales", scopeType: "STORE", status: "ACTIVE" },
    { id: "binding-finance", userId: "u1", storeId: "s1", roleId: "role-finance", scopeType: "STORE", status: "ACTIVE" }
  ];
  const audits: Array<{ data: { action: string; targetId?: string } }> = [];
  let increments = 0;
  let memberPresent = true;
  const tx = {
    ...fake.tx,
    storeMember: {
      findUnique: async () => memberPresent ? { id: "member-u1" } : null,
      findMany: async () => [{ userId: "manager-1" }]
    },
    permissionRole: {
      findUnique: async ({ where }: { where: { id?: string; code?: string } }) =>
        where.code === "MANAGER"
          ? { id: "role-manager", status: "ACTIVE" }
          : { code: where.id === "role-sales" ? "SALES" : "FINANCE" }
    },
    permissionRoleBinding: {
      findMany: async ({ where }: { where: { userId?: string; roleId?: string } }) =>
        where.roleId === "role-manager" ? [{ userId: "manager-1" }] : active.filter((binding) => binding.status === "ACTIVE"),
      update: async ({ where }: { where: { id: string } }) => {
        const binding = active.find((item) => item.id === where.id)!;
        binding.status = "DISABLED";
        return binding;
      }
    },
    user: { update: async () => { increments++; } },
    auditEvent: { create: async (input: { data: { action: string; targetId?: string } }) => { audits.push(input); } }
  };
  const prisma = {
    ...fake.prisma,
    $transaction: async (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx)
  };
  const changes = new StoreBindingChanges(prisma as never, new RuntimeAccessSnapshotStore());
  const committed = await changes.commit({
    commandId: "cmd-leave",
    actorId: "manager-1",
    authority: "memberLeave",
    intent: { operation: "removeMember", userId: "u1", storeId: "s1" },
    compose: async () => {
      memberPresent = false;
      return { result: { success: true }, actions: [{ kind: "disableAll", userId: "u1", storeId: "s1" }] };
    }
  });
  assert.equal(committed.changes.length, 2);
  assert.deepEqual(active.map((binding) => binding.status), ["DISABLED", "DISABLED"]);
  assert.equal(increments, 1);
  assert.deepEqual(audits.filter((event) => event.data.action === "permissions.binding.disabled")
    .map((event) => event.data.targetId), ["binding-sales", "binding-finance"]);
});
