import { ConflictException, Injectable } from "@nestjs/common";
import {
  PermissionBindingStatus,
  PermissionRoleStatus,
  PermissionScopeType,
  type PermissionRoleBinding,
  Prisma,
  StorePosition
} from "@prisma/client";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { RuntimeAccessSnapshotStore } from "./domain/runtime-access-snapshot.store";

export type StoreBindingAuthority =
  | "storeCreate"
  | "invitationAccept"
  | "memberLeave"
  | "managerTransfer"
  | "governance"
  | "roleDisable";

export type StoreBindingAction =
  | { kind: "grant"; userId: string; storeId: string; roleId: string }
  | { kind: "disable"; bindingId: string }
  | { kind: "disableRole"; roleId: string }
  | { kind: "disableAll"; userId: string; storeId: string }
  | { kind: "replace"; userId: string; storeId: string; roleIds: string[] };

export type StoreBindingExpected =
  | { kind: "manager"; storeId: string; userId: string | null }
  | { kind: "member"; userId: string; storeId: string | null }
  | { kind: "revision"; userId: string; value: number };

// Callbacks can change the workflow's business facts, never bindings, audit or revisions.
export type StoreBindingBusinessTx = Pick<
  Prisma.TransactionClient,
  "store" | "financialEntity" | "storeInvitation" | "storeMember" | "permissionRole"
>;

export type StoreBindingCommand<T> = {
  commandId: string;
  actorId: string;
  authority: StoreBindingAuthority;
  intent: unknown;
  expected?: StoreBindingExpected[];
  compose: (tx: StoreBindingBusinessTx) => Promise<{
    result: T;
    actions: StoreBindingAction[];
    summary?: {
      action: string;
      targetType: string;
      targetId: string;
      storeId?: string;
      metadata: Prisma.InputJsonValue;
    };
  }>;
};

export type StoreBindingCommit<T> = { value: T; changes: PermissionRoleBinding[]; replayed: boolean };

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const record = value as Record<string, unknown>;
  return "{" + Object.keys(record).filter((key) => record[key] !== undefined).sort()
    .map((key) => JSON.stringify(key) + ":" + canonical(record[key])).join(",") + "}";
}

function isPrismaCode(error: unknown, code: string) {
  return !!error && typeof error === "object" && "code" in error && error.code === code;
}

@Injectable()
export class StoreBindingChanges {
  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshots: RuntimeAccessSnapshotStore
  ) {}

  async commit<T>(command: StoreBindingCommand<T>): Promise<StoreBindingCommit<T>> {
    if (!command.commandId?.trim()) throw new ConflictException("绑定变更标识不能为空");
    const hash = createHash("sha256").update(canonical({
      actorId: command.actorId,
      authority: command.authority,
      intent: command.intent
    })).digest("hex");
    for (let attempt = 0; attempt < 3; attempt++) {
      const previous = await this.prisma.storeBindingCommand.findUnique({
        where: { id: command.commandId }
      });
      if (previous) return { ...this.replay<T>(previous.intentHash, hash, previous.result), replayed: true };
      try {
        const committed = await this.prisma.$transaction(async (tx) => {
          const duplicate = await tx.storeBindingCommand.findUnique({
            where: { id: command.commandId }
          });
          if (duplicate) return {
            ...this.replay<T>(duplicate.intentHash, hash, duplicate.result),
            replayed: true,
            changedUsers: [] as string[]
          };
          await this.checkExpected(tx, command.expected ?? []);
          const { result, actions, summary } = await command.compose(tx);
          const applied = await this.apply(tx, command, actions);
          if (summary) {
            await tx.auditEvent.create({
              data: {
                action: summary.action,
                actorId: command.actorId,
                targetType: summary.targetType,
                targetId: summary.targetId,
                storeId: summary.storeId,
                idempotencyKey: command.commandId,
                metadata: summary.metadata
              }
            });
          }
          const storedResult = JSON.parse(JSON.stringify({ value: result, changes: applied.bindings })) as Prisma.InputJsonValue;
          await tx.storeBindingCommand.create({
            data: {
              id: command.commandId,
              actorId: command.actorId,
              intentHash: hash,
              result: storedResult
            }
          });
          return { value: result, changes: applied.bindings, replayed: false, changedUsers: applied.users };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        for (const userId of committed.changedUsers) this.snapshots.clear(userId);
        return { value: committed.value, changes: committed.changes, replayed: committed.replayed };
      } catch (error) {
        if (isPrismaCode(error, "P2034")) {
          if (attempt < 2) continue;
          throw new ConflictException({ code: "STALE_STATE", message: "绑定变更发生并发冲突，请刷新后重试" });
        }
        if (isPrismaCode(error, "P2002")) {
          const winner = await this.prisma.storeBindingCommand.findUnique({
            where: { id: command.commandId }
          });
          if (winner) return { ...this.replay<T>(winner.intentHash, hash, winner.result), replayed: true };
          throw new ConflictException({ code: "STALE_STATE", message: "成员或店长状态已变化，请刷新后重试" });
        }
        if (isPrismaCode(error, "P2025")) {
          throw new ConflictException({ code: "STALE_STATE", message: "相关记录已变化，请刷新后重试" });
        }
        throw error;
      }
    }
    throw new ConflictException("绑定变更发生并发冲突，请重试");
  }

  private replay<T>(actualHash: string, expectedHash: string, result: Prisma.JsonValue): Omit<StoreBindingCommit<T>, "replayed"> {
    if (actualHash !== expectedHash) {
      throw new ConflictException({ code: "COMMAND_ID_CONFLICT", message: "绑定变更标识已用于不同内容" });
    }
    return result as unknown as Omit<StoreBindingCommit<T>, "replayed">;
  }

  private async checkExpected(tx: Prisma.TransactionClient, expected: StoreBindingExpected[]) {
    for (const fact of expected) {
      if (fact.kind === "manager") {
        const managers = await tx.storeMember.findMany({
          where: { storeId: fact.storeId, position: StorePosition.MANAGER },
          select: { userId: true }
        });
        if (managers.length !== (fact.userId === null ? 0 : 1) ||
          (fact.userId !== null && managers[0]?.userId !== fact.userId)) {
          throw new ConflictException({ code: "STALE_STATE", message: "店长已变化，请刷新后重试" });
        }
      } else if (fact.kind === "member") {
        const member = await tx.storeMember.findUnique({
          where: { userId: fact.userId }, select: { storeId: true }
        });
        if ((member?.storeId ?? null) !== fact.storeId) {
          throw new ConflictException({ code: "STALE_STATE", message: "成员归属已变化，请刷新后重试" });
        }
      } else {
        const user = await tx.user.findUnique({
          where: { id: fact.userId }, select: { authRevision: true }
        });
        if (!user || user.authRevision !== fact.value) {
          throw new ConflictException({ code: "STALE_STATE", message: "授权版本已变化，请刷新后重试" });
        }
      }
    }
  }

  private async apply(
    tx: Prisma.TransactionClient,
    command: StoreBindingCommand<unknown>,
    actions: StoreBindingAction[]
  ) {
    const changedUsers = new Set<string>();
    const bindings: PermissionRoleBinding[] = [];
    const affectedStores = new Set<string>();
    const affectedPairs = new Set<string>();
    const managerAuthority = command.authority === "storeCreate" || command.authority === "managerTransfer";
    const disableBinding = async (binding: { id: string; userId: string; storeId: string | null; roleId: string }) => {
      const role = await tx.permissionRole.findUnique({ where: { id: binding.roleId }, select: { code: true } });
      if (role?.code === StorePosition.MANAGER && !managerAuthority) {
        throw new ConflictException("MANAGER 绑定只能通过建店或换店长流程变更");
      }
      const updated = await tx.permissionRoleBinding.update({
        where: { id: binding.id }, data: { status: PermissionBindingStatus.DISABLED }
      });
      bindings.push(updated);
      await tx.auditEvent.create({
        data: {
          action: "permissions.binding.disabled",
          actorId: command.actorId,
          storeId: binding.storeId,
          targetType: "PermissionRoleBinding",
          targetId: binding.id,
          metadata: { userId: binding.userId, roleId: binding.roleId, source: command.authority }
        }
      });
      changedUsers.add(binding.userId);
      if (binding.storeId) {
        affectedStores.add(binding.storeId);
        affectedPairs.add(binding.storeId + ":" + binding.userId);
      }
    };
    const grant = async (userId: string, storeId: string, roleId: string) => {
      const target = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      const store = await tx.store.findUnique({ where: { id: storeId }, select: { id: true } });
      if (!target || !store) throw new ConflictException("目标用户或门店不存在");
      const role = await tx.permissionRole.findUnique({ where: { id: roleId } });
      if (!role || role.status !== PermissionRoleStatus.ACTIVE) {
        throw new ConflictException("角色不存在或已停用");
      }
      if (role.code === StorePosition.MANAGER && !managerAuthority) {
        throw new ConflictException("MANAGER 绑定只能通过建店或换店长流程变更");
      }
      const existing = await tx.permissionRoleBinding.findFirst({
        where: { userId, storeId, roleId, scopeType: PermissionScopeType.STORE }
      });
      const now = new Date();
      if (existing?.status === PermissionBindingStatus.ACTIVE &&
        existing.effectiveAt <= now && (!existing.expiredAt || existing.expiredAt > now)) {
        if (command.authority === "invitationAccept") {
          affectedStores.add(storeId);
          affectedPairs.add(storeId + ":" + userId);
          return;
        }
        throw new ConflictException("相同角色和组织范围已绑定");
      }
      const binding = existing
        ? await tx.permissionRoleBinding.update({
          where: { id: existing.id },
          data: {
            status: PermissionBindingStatus.ACTIVE,
            effectiveAt: now,
            expiredAt: null,
            createdById: command.actorId
          }
        })
        : await tx.permissionRoleBinding.create({
          data: { userId, storeId, roleId, scopeType: PermissionScopeType.STORE, createdById: command.actorId }
        });
      bindings.push(binding);
      await tx.auditEvent.create({
        data: {
          action: "permissions.binding.created",
          actorId: command.actorId,
          storeId,
          targetType: "PermissionRoleBinding",
          targetId: binding.id,
          metadata: { userId, roleId, source: command.authority }
        }
      });
      changedUsers.add(userId);
      affectedStores.add(storeId);
      affectedPairs.add(storeId + ":" + userId);
    };
    for (const action of actions) {
      if (action.kind === "grant") {
        await grant(action.userId, action.storeId, action.roleId);
      } else if (action.kind === "disable") {
        const binding = await tx.permissionRoleBinding.findUnique({ where: { id: action.bindingId } });
        if (!binding || binding.scopeType !== PermissionScopeType.STORE || !binding.storeId) {
          throw new ConflictException("门店绑定不存在");
        }
        if (binding.status === PermissionBindingStatus.ACTIVE) await disableBinding(binding);
      } else if (action.kind === "disableRole") {
        if (command.authority !== "roleDisable") throw new ConflictException("只有角色停用流程可批量停用角色绑定");
        const current = await tx.permissionRoleBinding.findMany({
          where: { roleId: action.roleId, status: PermissionBindingStatus.ACTIVE }
        });
        for (const binding of current) await disableBinding(binding);
      } else {
        const current = await tx.permissionRoleBinding.findMany({
          where: {
            userId: action.userId,
            storeId: action.storeId,
            scopeType: PermissionScopeType.STORE,
            status: PermissionBindingStatus.ACTIVE
          }
        });
        const wanted = action.kind === "replace" ? new Set(action.roleIds) : new Set<string>();
        for (const binding of current) {
          if (!wanted.has(binding.roleId)) await disableBinding(binding);
        }
        if (action.kind === "replace") {
          for (const roleId of wanted) {
            const now = new Date();
            if (!current.some((binding) => binding.roleId === roleId &&
              binding.effectiveAt <= now && (!binding.expiredAt || binding.expiredAt > now))) {
              await grant(action.userId, action.storeId, roleId);
            }
          }
        }
        affectedStores.add(action.storeId);
        affectedPairs.add(action.storeId + ":" + action.userId);
      }
    }
    for (const pair of affectedPairs) {
      const separator = pair.lastIndexOf(":");
      const storeId = pair.slice(0, separator);
      const userId = pair.slice(separator + 1);
      const member = await tx.storeMember.findUnique({
        where: { storeId_userId: { storeId, userId } }, select: { id: true }
      });
      if (member) {
        const activeBindings = await tx.permissionRoleBinding.findMany({
          where: {
            userId, storeId, scopeType: PermissionScopeType.STORE,
            status: PermissionBindingStatus.ACTIVE,
            effectiveAt: { lte: new Date() },
            OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }]
          }
        });
        const activeRoles = await tx.permissionRole.count({
          where: { id: { in: activeBindings.map((binding) => binding.roleId) }, status: PermissionRoleStatus.ACTIVE }
        });
        if (activeRoles === 0) throw new ConflictException("门店成员必须保留至少一个有效门店角色绑定");
      }
    }
    for (const storeId of affectedStores) {
      const managers = await tx.storeMember.findMany({
        where: { storeId, position: StorePosition.MANAGER },
        select: { userId: true }
      });
      if (managers.length !== 1) throw new ConflictException("门店必须恰有一名店长");
      const managerRole = await tx.permissionRole.findUnique({
        where: { code: StorePosition.MANAGER }, select: { id: true, status: true }
      });
      const managerBindings = managerRole && await tx.permissionRoleBinding.findMany({
        where: {
          storeId,
          roleId: managerRole.id,
          scopeType: PermissionScopeType.STORE,
          status: PermissionBindingStatus.ACTIVE,
          effectiveAt: { lte: new Date() },
          OR: [{ expiredAt: null }, { expiredAt: { gt: new Date() } }]
        },
        select: { userId: true }
      });
      if (managerRole?.status !== PermissionRoleStatus.ACTIVE ||
        managerBindings?.length !== 1 || managerBindings[0]?.userId !== managers[0].userId) {
        throw new ConflictException("门店必须恰有一条属于店长的有效 MANAGER 绑定");
      }
    }
    for (const userId of [...changedUsers].sort()) {
      await tx.user.update({ where: { id: userId }, data: { authRevision: { increment: 1 } } });
    }
    await tx.auditEvent.create({
      data: {
        action: "permissions.store_binding_change.committed",
        actorId: command.actorId,
        targetType: "StoreBindingCommand",
        targetId: command.commandId,
        idempotencyKey: command.commandId,
        metadata: {
          authority: command.authority,
          changedUserIds: [...changedUsers],
          storeIds: [...affectedStores]
        }
      }
    });
    return { users: [...changedUsers], bindings };
  }
}
