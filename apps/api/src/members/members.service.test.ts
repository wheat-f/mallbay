import assert from "node:assert/strict";
import { test } from "node:test";
import { InvitationStatus, StorePosition, StoreStatus } from "@prisma/client";
import { MembersService } from "./members.service";

const storeMemberWriter = {
  scope: async () => ({ allowed: true })
};

test("inviteMember cancels stale invitations, creates a new invitation, and notifies invitee", async () => {
  const calls: string[] = [];
  const notifications: unknown[] = [];
  const invitation = { id: "invitation-1" };
  const prisma = {
    storeMember: {
      findUnique: async (args: { where: { userId: string } }) => {
        calls.push(`member.findUnique:${args.where.userId}`);
        if (args.where.userId === "manager-1") {
          return { storeId: "store-1", position: StorePosition.MANAGER };
        }
        return null;
      }
    },
    store: {
      findUniqueOrThrow: async (args: unknown) => {
        calls.push("store.findUniqueOrThrow");
        assert.deepEqual(args, { where: { id: "store-1" } });
        return { id: "store-1", name: "门店一", status: StoreStatus.PUBLISHED };
      }
    },
    user: {
      findUnique: async (args: unknown) => {
        calls.push("user.findUnique");
        assert.deepEqual(args, { where: { id: "user-2" } });
        return { id: "user-2" };
      }
    },
    storeInvitation: {
      updateMany: async (args: unknown) => {
        calls.push("invitation.updateMany");
        assert.deepEqual(args, {
          where: {
            storeId: "store-1",
            invitedUserId: "user-2",
            status: InvitationStatus.PENDING
          },
          data: { status: InvitationStatus.CANCELLED }
        });
      },
      create: async (args: unknown) => {
        calls.push("invitation.create");
        assert.deepEqual(args, {
          data: {
            storeId: "store-1",
            invitedById: "manager-1",
            invitedUserId: "user-2",
            position: StorePosition.SALES
          }
        });
        return invitation;
      }
    },
    $transaction: async (callback: (transaction: unknown) => Promise<unknown>) => callback(prisma)
  };
  const service = new MembersService(prisma as never, {
    send: async (userId: string, type: string, payload: unknown) => {
      notifications.push({ userId, type, payload });
    }
  } as never, storeMemberWriter as never);

  const result = await service.inviteMember("manager-1", "store-1", {
    userId: "user-2",
    position: StorePosition.SALES
  });

  assert.equal(result, invitation);
  assert.deepEqual(calls, [
    "store.findUniqueOrThrow",
    "user.findUnique",
    "member.findUnique:user-2",
    "invitation.updateMany",
    "invitation.create"
  ]);
  assert.deepEqual(notifications, [
    {
      userId: "user-2",
      type: "STORE_INVITATION",
      payload: {
        invitationId: "invitation-1",
        storeId: "store-1",
        storeName: "门店一",
        position: StorePosition.SALES
      }
    }
  ]);
});

test("inviteMember tells managers to contact an administrator when assigning store manager", async () => {
  const service = new MembersService({
    storeMember: {
      findUnique: async () => ({ storeId: "store-1", position: StorePosition.MANAGER })
    }
  } as never, { send: async () => undefined } as never, storeMemberWriter as never);

  await assert.rejects(
    () => service.inviteMember("manager-1", "store-1", {
      userId: "user-2",
      position: StorePosition.MANAGER
    }),
    /请联系管理员变更/
  );
});

test("acceptInvitation replaces frozen-store membership, accepts invitation, and notifies inviter", async () => {
  const transactionCalls: string[] = [];
  const notifications: unknown[] = [];
  const invitation = {
    id: "invitation-1",
    storeId: "store-1",
    invitedById: "manager-1",
    invitedUserId: "user-2",
    position: StorePosition.FINANCE,
    status: InvitationStatus.PENDING,
    store: { id: "store-1", name: "门店一" }
  };
  const tx = {
    storeMember: {
      findUnique: async (args: unknown) => {
        transactionCalls.push("member.findUnique");
        assert.deepEqual(args, { where: { userId: "user-2" } });
        return { id: "frozen-member-1", storeId: "frozen-store" };
      },
      delete: async (args: unknown) => {
        transactionCalls.push("member.delete");
        assert.deepEqual(args, { where: { id: "frozen-member-1" } });
      },
      create: async (args: unknown) => {
        transactionCalls.push("member.create");
        assert.deepEqual(args, {
          data: {
            storeId: "store-1",
            userId: "user-2",
            position: StorePosition.FINANCE
          }
        });
      }
    },
    storeInvitation: {
      updateMany: async (args: unknown) => {
        transactionCalls.push("invitation.update");
        assert.deepEqual(args, {
          where: { id: "invitation-1", status: InvitationStatus.PENDING },
          data: { status: InvitationStatus.ACCEPTED }
        });
        return { count: 1 };
      }
    },
    permissionRoleBinding: {
      updateMany: async (args: unknown) => {
        transactionCalls.push("binding.disable");
        assert.deepEqual(args, {
          where: { userId: "user-2", scopeType: "STORE", storeId: "frozen-store", status: "ACTIVE" },
          data: { status: "DISABLED" }
        });
      },
      upsert: async (args: unknown) => {
        transactionCalls.push("binding.upsert");
        const upsertArgs = args as { update: { effectiveAt: unknown } };
        assert.ok(upsertArgs.update.effectiveAt instanceof Date);
        assert.deepEqual(args, {
          where: { userId_roleId_scopeType_storeId: { userId: "user-2", roleId: "role-finance", scopeType: "STORE", storeId: "store-1" } },
          update: { status: "ACTIVE", effectiveAt: upsertArgs.update.effectiveAt, expiredAt: null },
          create: { userId: "user-2", roleId: "role-finance", scopeType: "STORE", storeId: "store-1" }
        });
        return { id: "binding-1" };
      }
    },
    permissionRole: {
      findUnique: async (args: unknown) => {
        transactionCalls.push("role.findUnique");
        assert.deepEqual(args, { where: { code: StorePosition.FINANCE } });
        return { id: "role-finance", status: "ACTIVE" };
      }
    },
    auditEvent: {
      create: async (args: unknown) => {
        transactionCalls.push("audit.create");
        assert.deepEqual(args, {
          data: {
            action: "permissions.binding.created",
            actorId: "manager-1",
            storeId: "store-1",
            targetType: "PermissionRoleBinding",
            targetId: "binding-1",
            metadata: { userId: "user-2", roleId: "role-finance", source: "store_invitation" }
          }
        });
      }
    }
  };
  const prisma = {
    storeInvitation: {
      findUnique: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { id: "invitation-1" },
          include: { store: true }
        });
        return invitation;
      }
    },
    $transaction: async (callback: (transaction: typeof tx) => Promise<void>) => callback(tx)
  };
  const service = new MembersService(prisma as never, {
    send: async (userId: string, type: string, payload: unknown) => {
      notifications.push({ userId, type, payload });
    }
  } as never, storeMemberWriter as never);

  const result = await service.acceptInvitation("user-2", "invitation-1");

  assert.deepEqual(result, { success: true });
  assert.deepEqual(transactionCalls, [
    "member.findUnique",
    "member.delete",
    "binding.disable",
    "member.create",
    "invitation.update",
    "role.findUnique",
    "binding.upsert",
    "audit.create"
  ]);
  assert.deepEqual(notifications, [
    {
      userId: "manager-1",
      type: "INVITATION_ACCEPTED",
      payload: {
        storeId: "store-1",
        storeName: "门店一",
        invitedUserId: "user-2"
      }
    }
  ]);
});

test("rejectInvitation rejects pending invitation and notifies inviter", async () => {
  const notifications: unknown[] = [];
  const updates: unknown[] = [];
  const prisma = {
    storeInvitation: {
      findUnique: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { id: "invitation-1" },
          include: { store: true }
        });
        return {
          id: "invitation-1",
          storeId: "store-1",
          invitedById: "manager-1",
          invitedUserId: "user-2",
          status: InvitationStatus.PENDING,
          store: { id: "store-1", name: "门店一" }
        };
      },
      updateMany: async (args: unknown) => {
        updates.push(args);
        return { count: 1 };
      }
    }
  };
  const service = new MembersService(prisma as never, {
    send: async (userId: string, type: string, payload: unknown) => {
      notifications.push({ userId, type, payload });
    }
  } as never, storeMemberWriter as never);

  const result = await service.rejectInvitation("user-2", "invitation-1");

  assert.deepEqual(result, { success: true });
  assert.deepEqual(updates, [
    {
      where: { id: "invitation-1", status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.REJECTED }
    }
  ]);
  assert.deepEqual(notifications, [
    {
      userId: "manager-1",
      type: "INVITATION_REJECTED",
      payload: {
        storeId: "store-1",
        storeName: "门店一",
        invitedUserId: "user-2"
      }
    }
  ]);
});

test("removeMember tells managers to contact an administrator when removing store manager", async () => {
  const service = new MembersService({
    storeMember: {
      findUnique: async (args: { where: { userId: string } }) => {
        if (args.where.userId === "manager-1") {
          return { storeId: "store-1", position: StorePosition.MANAGER };
        }
        return { id: "member-2", storeId: "store-1", position: StorePosition.MANAGER };
      }
    }
  } as never, { send: async () => undefined } as never, storeMemberWriter as never);

  await assert.rejects(
    () => service.removeMember("manager-1", "store-1", "user-2"),
    /请联系管理员变更/
  );
});
