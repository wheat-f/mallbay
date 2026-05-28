import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { StorePosition } from "@prisma/client";
import { NotificationsService } from "../../notifications/notifications.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ChangeManagerDto } from "../dto/change-manager.dto";

@Injectable()
export class ChangeStoreManagerUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async execute(isAuditor: boolean, storeId: string, dto: ChangeManagerDto) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException("门店不存在");

    const newManager = await this.prisma.user.findUnique({ where: { id: dto.newManagerId } });
    if (!newManager) throw new NotFoundException("指定的用户不存在");

    const currentManager = await this.prisma.storeMember.findFirst({
      where: { storeId, position: StorePosition.MANAGER }
    });

    if (currentManager?.userId === dto.newManagerId) {
      throw new BadRequestException("该用户已是本门店店长");
    }

    const newManagerMember = await this.prisma.storeMember.findUnique({
      where: { userId: dto.newManagerId }
    });
    if (newManagerMember && newManagerMember.storeId !== storeId) {
      throw new BadRequestException("该用户已是其他门店的成员");
    }

    await this.prisma.$transaction(async (tx) => {
      if (currentManager) {
        await tx.storeMember.delete({ where: { id: currentManager.id } });
        await this.notifications.send(currentManager.userId, "REMOVED_FROM_STORE", {
          storeId,
          storeName: store.name,
          reason: "店长职位已变更"
        });
      }

      if (newManagerMember) {
        await tx.storeMember.update({
          where: { id: newManagerMember.id },
          data: { position: StorePosition.MANAGER }
        });
      } else {
        await tx.storeMember.create({
          data: {
            storeId,
            userId: dto.newManagerId,
            position: StorePosition.MANAGER
          }
        });
      }
    });

    return { success: true };
  }
}
