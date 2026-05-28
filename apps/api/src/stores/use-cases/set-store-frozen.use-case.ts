import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { StoreStatus } from "@prisma/client";
import { NotificationsService } from "../../notifications/notifications.service";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class SetStoreFrozenUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async execute(isAuditor: boolean, storeId: string, frozen: boolean) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store) throw new NotFoundException("门店不存在");

    if (frozen && store.status === StoreStatus.FROZEN) {
      throw new BadRequestException("门店已处于冻结状态");
    }
    if (!frozen && store.status !== StoreStatus.FROZEN) {
      throw new BadRequestException("门店未处于冻结状态");
    }

    const newStatus = frozen ? StoreStatus.FROZEN : StoreStatus.PUBLISHED;
    await this.prisma.store.update({ where: { id: storeId }, data: { status: newStatus } });

    const members = await this.prisma.storeMember.findMany({ where: { storeId } });
    const notifType = frozen ? "STORE_FROZEN" : "STORE_UNFROZEN";
    await Promise.all(
      members.map((m) =>
        this.notifications.send(m.userId, notifType, { storeId, storeName: store.name })
      )
    );

    return { success: true };
  }
}
