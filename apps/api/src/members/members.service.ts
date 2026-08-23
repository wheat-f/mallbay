import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException
} from "@nestjs/common";
import { InvitationStatus, StorePosition, StoreStatus } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { NotificationDispatcher } from "../notifications/notification-dispatcher";
import { AccessContext } from "../permissions/domain/access-context";
import { InviteMemberDto } from "./dto/invite-member.dto";

@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    @Optional() private readonly accessContext?: AccessContext,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcher
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

  async acceptInvitation(userId: string, invitationId: string) {
    const invitation = await this.prisma.storeInvitation.findUnique({
      where: { id: invitationId },
      include: { store: true }
    });

    if (!invitation) throw new NotFoundException("邀请不存在");
    if (invitation.invitedUserId !== userId) throw new ForbiddenException("无权操作");
    if (invitation.status !== InvitationStatus.PENDING) {
      throw new BadRequestException("该邀请已处理");
    }

    await this.prisma.$transaction(async (tx) => {
      // 若用户当前在冻结门店，先退出
      const currentMember = await tx.storeMember.findUnique({ where: { userId } });
      if (currentMember) {
        await tx.storeMember.delete({ where: { id: currentMember.id } });
      }

      // 加入新门店
      await tx.storeMember.create({
        data: {
          storeId: invitation.storeId,
          userId,
          position: invitation.position
        }
      });

      // 只有仍处于待处理状态的邀请可以完成接受，避免并发接受产生重复成员关系。
      const accepted = await tx.storeInvitation.updateMany({
        where: { id: invitationId, status: InvitationStatus.PENDING },
        data: { status: InvitationStatus.ACCEPTED }
      });
      if (accepted.count !== 1) throw new BadRequestException("该邀请已处理");
    });

    // 通知邀请人
    await this.dispatchNotification(invitation.invitedById, "INVITATION_ACCEPTED", {
      storeId: invitation.storeId,
      storeName: invitation.store.name,
      invitedUserId: userId
    }, `store-invitation:${invitation.id}:accepted`);

    return { success: true };
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

  async removeMember(managerId: string, storeId: string, targetUserId: string) {
    await this.assertManager(managerId, storeId);

    if (managerId === targetUserId) {
      throw new BadRequestException("不能开除自己");
    }

    const member = await this.prisma.storeMember.findUnique({
      where: { userId: targetUserId }
    });

    if (!member || member.storeId !== storeId) {
      throw new NotFoundException("该用户不是本门店成员");
    }

    if (member.position === StorePosition.MANAGER) {
      throw new BadRequestException("不能开除店长，请联系管理员变更");
    }

    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: storeId },
      select: { name: true }
    });

    await this.prisma.storeMember.delete({ where: { id: member.id } });

    await this.dispatchNotification(targetUserId, "REMOVED_FROM_STORE", {
      storeId,
      storeName: store.name,
      reason: "已被店长移出门店"
    }, `store-member:${member.id}:removed`);

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
    if (this.accessContext) {
      const scope = await this.accessContext.scope({ userId }, "settings", "write", { storeId });
      if (scope.allowed) return { userId, storeId, position: StorePosition.MANAGER };
    }
    // Test adapters without the production seam retain the resource-level invariant.
    const member = await this.prisma.storeMember.findUnique({ where: { userId } });
    if (!member || member.storeId !== storeId || member.position !== StorePosition.MANAGER) {
      throw new ForbiddenException("仅店长可执行此操作");
    }
    return member;
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
