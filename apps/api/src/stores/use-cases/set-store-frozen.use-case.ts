import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { StoreStatus } from "@prisma/client";
import { NotificationsService } from "../../notifications/notifications.service";
import { NotificationDispatcher } from "../../notifications/notification-dispatcher";
import { AuditLogService } from "../../observability/audit-log.service";
import { AuditEventWriter } from "../../observability/audit-event-writer";
import { StoreRepository } from "../repositories/store.repository";

@Injectable()
export class SetStoreFrozenUseCase {
  constructor(
    private readonly stores: StoreRepository,
    private readonly notifications: NotificationsService,
    private readonly auditLog: AuditLogService,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcher,
    @Optional() private readonly auditWriter?: AuditEventWriter
  ) {}

  async execute(isAuditor: boolean, storeId: string, frozen: boolean) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    const store = await this.stores.findStore(storeId);
    if (!store) throw new NotFoundException("门店不存在");

    if (frozen && store.status === StoreStatus.FROZEN) {
      throw new BadRequestException("门店已处于冻结状态");
    }
    if (!frozen && store.status !== StoreStatus.FROZEN) {
      throw new BadRequestException("门店未处于冻结状态");
    }

    const newStatus = frozen ? StoreStatus.FROZEN : StoreStatus.PUBLISHED;
    await this.stores.updateStoreStatus(storeId, newStatus);
    (this.auditWriter?.write({
      action: frozen ? "STORE_FROZEN" : "STORE_UNFROZEN",
      targetType: "store",
      targetId: storeId,
      metadata: { status: newStatus }
    }) ?? this.auditLog.record({
      action: frozen ? "STORE_FROZEN" : "STORE_UNFROZEN",
      targetType: "store",
      targetId: storeId,
      metadata: { status: newStatus }
    }));

    const members = await this.stores.findStoreMembers(storeId);
    const notifType = frozen ? "STORE_FROZEN" : "STORE_UNFROZEN";
    await Promise.all(
      members.map((m) =>
        this.notificationDispatcher?.dispatch({
          userId: m.userId,
          type: notifType,
          payload: { storeId, storeName: store.name }
        }) ?? this.notifications.send(m.userId, notifType, { storeId, storeName: store.name })
      )
    );

    return { success: true };
  }
}
