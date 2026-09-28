import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  NotFoundException
} from "@nestjs/common";
import { InvitationStatus, PermissionRoleStatus, StorePosition, StoreStatus } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationDispatcher } from "../notifications/notification-dispatcher";
import { AccessContext } from "../permissions/domain/access-context";
import { PermissionsService } from "../permissions/permissions.service";
import { StoreBindingChanges, type StoreBindingAction } from "../permissions/store-binding-changes";
import { InviteMemberDto } from "./dto/invite-member.dto";

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly accessContext: AccessContext,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcher,
    @Optional() private readonly permissions?: PermissionsService,
    @Inject(StoreBindingChanges) private readonly bindingChanges?: StoreBindingChanges
  ) {}

  // ─── 店长：搜索可邀请的用户 ────────────────────────────────────────────────
  // 返回用户名模糊匹配的结果，不含已在其他门店的用户（冻结门店的员工可被邀请）

  async searchInvitableUsers(managerId: string, storeId: string, keyword: string) {
    await this.assertManager(managerId, storeId);

    const candidates = await this.prisma.user.findMany({
      where: { username: { contains: keyword, mode: "insensitive" } },
      select: {
        id: true,
        username: true,
        nickname: true,
        avatarUrl: true,
        storeMembers: {
          select: { storeId: true, store: { select: { status: true } } }
        }
      },
      take: 20
    });

    return candidates
      .filter((u) => {
        const member = u.storeMembers[0];
        if (!member) return true; // 未加入任何门店，可邀请
        if (member.storeId === storeId) return false; // 已在本门店
        // 若在其他门店但门店已冻结，可邀请
        return member.store.status === StoreStatus.FROZEN;
      })
      .map(({ storeMembers: _, ...u }) => u);
  }

  // ─── 店长：发起邀请 ────────────────────────────────────────────────────────

  async inviteMember(managerId: string, storeId: string, dto: InviteMemberDto) {
    await this.assertManager(managerId, storeId);

    if (dto.position === StorePosition.MANAGER) {
      throw new BadRequestException("不能通过邀请指派店长，请联系管理员变更");
    }

    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
    if (store.status === StoreStatus.FROZEN) {
      throw new BadRequestException("门店已冻结，无法发起邀请");
    }

    const invitee = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!invitee) throw new NotFoundException("用户不存在");

    // 检查被邀请人是否已在非冻结门店
    const existingMember = await this.prisma.storeMember.findUnique({
      where: { userId: dto.userId },
      include: { store: { select: { status: true } } }
    });
    if (existingMember && existingMember.store.status !== StoreStatus.FROZEN) {
      throw new BadRequestException("该用户已是其他门店的成员");
    }

    const invitation = await this.prisma.$transaction(async (tx) => {
      await tx.storeInvitation.updateMany({
        where: { storeId, invitedUserId: dto.userId, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.CANCELLED }
      });

      return tx.storeInvitation.create({
        data: {
          storeId,
          invitedById: managerId,
          invitedUserId: dto.userId,
          position: dto.position
        }
      });
    });

    await this.dispatchNotification(dto.userId, "STORE_INVITATION", {
      invitationId: invitation.id,
      storeId,
      storeName: store.name,
      position: dto.position
    }, `store-invitation:${invitation.id}:created`);

    return invitation;
  }

  // ─── 用户：接受邀请 ────────────────────────────────────────────────────────

  async acceptInvitation(userId: string, invitationId: string, commandId: string = randomUUID()) {
    const invitation = await this.prisma.storeInvitation.findUnique({
      where: { id: invitationId },
      include: { store: true }
    });

    if (!invitation) throw new NotFoundException("邀请不存在");
    if (invitation.invitedUserId !== userId) throw new ForbiddenException("无权操作");
    if (!this.bindingChanges) throw new Error("门店角色绑定变更模块未配置");
    const committed = await this.bindingChanges.commit({
      commandId,
      actorId: userId,
      authority: "invitationAccept",
      intent: { operation: "acceptInvitation", userId, invitationId },
      compose: async (tx) => {
      const currentInvitation = await tx.storeInvitation.findUnique({ where: { id: invitationId } });
      if (currentInvitation?.status !== InvitationStatus.PENDING) throw new BadRequestException("该邀请已处理");
      if (currentInvitation.invitedUserId !== userId) throw new ForbiddenException("无权操作");
      const actions: StoreBindingAction[] = [];
      // 若用户当前在冻结门店，先退出
      const currentMember = await tx.storeMember.findUnique({ where: { userId } });
      if (currentMember) {
        const oldStore = await tx.store.findUnique({ where: { id: currentMember.storeId }, select: { status: true } });
        if (oldStore?.status !== StoreStatus.FROZEN) throw new BadRequestException("该用户已是其他门店的成员");
        await tx.storeMember.delete({ where: { id: currentMember.id } });
        actions.push({ kind: "disableAll", userId, storeId: currentMember.storeId });
      }

      // 加入新门店
      await tx.storeMember.create({
        data: {
          storeId: currentInvitation.storeId,
          userId,
          position: currentInvitation.position
        }
      });

      // 只有仍处于待处理状态的邀请可以完成接受，避免并发接受产生重复成员关系。
      const accepted = await tx.storeInvitation.updateMany({
        where: { id: invitationId, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.ACCEPTED }
      });

      const role = await tx.permissionRole.findUnique({ where: { code: currentInvitation.position } });
      if (!role || role.status !== PermissionRoleStatus.ACTIVE) {
        throw new BadRequestException("邀请岗位尚未配置有效角色，请联系管理员处理");
      }
      if (accepted.count !== 1) throw new BadRequestException("该邀请已处理");
      actions.push({ kind: "grant", userId, storeId: currentInvitation.storeId, roleId: role.id });
      return {
        result: { success: true },
        actions,
        summary: {
          action: "STORE_INVITATION_ACCEPTED",
          targetType: "StoreInvitation",
          targetId: invitationId,
          storeId: currentInvitation.storeId,
          metadata: { userId }
        }
      };
      }
    });
    if (!committed.replayed) this.permissions?.invalidateUserCache(userId);

    // 通知邀请人
    await this.dispatchNotification(invitation.invitedById, "INVITATION_ACCEPTED", {
      storeId: invitation.storeId,
      storeName: invitation.store.name,
      invitedUserId: userId
    }, `store-invitation:${invitation.id}:accepted`);

    return committed.value;
  }

  // ─── 用户：拒绝邀请 ────────────────────────────────────────────────────────

  async rejectInvitation(userId: string, invitationId: string) {
    const invitation = await this.prisma.storeInvitation.findUnique({
      where: { id: invitationId },
      include: { store: true }
    });

    if (!invitation) throw new NotFoundException("邀请不存在");
    if (invitation.invitedUserId !== userId) throw new ForbiddenException("无权操作");
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException("该邀请已处理");
    }

    await this.prisma.storeInvitation.updateMany({
      where: { id: invitationId, status: InvitationStatus.PENDING },
      data: { status: InvitationStatus.REJECTED }
    });

    await this.dispatchNotification(invitation.invitedById, "INVITATION_REJECTED", {
      storeId: invitation.storeId,
      storeName: invitation.store.name,
      invitedUserId: userId
    }, `store-invitation:${invitation.id}:rejected`);

    return { success: true };
  }

  // ─── 店长：开除成员 ────────────────────────────────────────────────────────

  async removeMember(managerId: string, storeId: string, targetUserId: string, commandId: string = randomUUID()) {
    await this.assertManager(managerId, storeId);

    if (managerId === targetUserId) {
      throw new BadRequestException("不能开除自己");
    }

    const currentMember = await this.prisma.storeMember.findUnique({ where: { userId: targetUserId } });
    if (currentMember?.storeId === storeId && currentMember.position === StorePosition.MANAGER) {
      throw new BadRequestException("不能开除店长，请联系管理员变更");
    }

    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { name: true }
    });

    if (!this.bindingChanges) throw new Error("门店角色绑定变更模块未配置");
    const committed = await this.bindingChanges.commit({
      commandId,
      actorId: managerId,
      authority: "memberLeave",
      intent: { operation: "removeMember", storeId, targetUserId },
      compose: async (tx) => {
        const member = await tx.storeMember.findUnique({ where: { userId: targetUserId } });
        if (!member || member.storeId !== storeId) throw new NotFoundException("该用户不是本门店成员");
        if (member.position === StorePosition.MANAGER) {
          throw new BadRequestException("不能开除店长，请联系管理员变更");
        }
        await tx.storeMember.delete({ where: { id: member.id } });
        return {
          result: { success: true, memberId: member.id },
          actions: [{ kind: "disableAll" as const, userId: targetUserId, storeId }],
          summary: {
            action: "STORE_MEMBER_REMOVED",
            targetType: "StoreMember",
            targetId: member.id,
            storeId,
            metadata: { userId: targetUserId }
          }
        };
      }
    });
    if (!committed.replayed) this.permissions?.invalidateUserCache(targetUserId);

    await this.dispatchNotification(targetUserId, "REMOVED_FROM_STORE", {
      storeId,
      storeName: store.name,
      reason: "已被店长移出门店"
    }, `store-member:${committed.value.memberId}:removed`);

    return { success: true };
  }

  // ─── 查询当前用户收到的邀请 ────────────────────────────────────────────────

  async myInvitations(userId: string) {
    return this.prisma.storeInvitation.findMany({
      where: { invitedUserId: userId, status: InvitationStatus.PENDING },
      include: {
        store: { select: { id: true, name: true } },
        invitedBy: { select: { id: true, username: true, nickname: true } }
      },
      orderBy: { createdAt: "desc" }
    });
  }

  // ─── 工具：断言当前用户是指定门店的店长 ───────────────────────────────────

  private async assertManager(userId: string, storeId: string) {
    const scope = await this.accessContext.scope({ userId }, "store.members", "write", { storeId });
    if (!scope.allowed) throw new ForbiddenException("当前角色无权管理门店成员");
    return { userId, storeId, position: StorePosition.MANAGER };
  }

  private dispatchNotification(
    userId: string,
    type: "STORE_INVITATION" | "INVITATION_ACCEPTED" | "INVITATION_REJECTED" | "REMOVED_FROM_STORE",
    payload: object,
    dedupeKey?: string
  ) {
    return this.notificationDispatcher?.dispatch({ userId, type, payload, dedupeKey })
      ?? this.notifications.send(userId, type, payload, dedupeKey);
  }
}
