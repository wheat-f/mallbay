import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { NotificationsService } from "../../notifications/notifications.service";
import { NotificationDispatcher } from "../../notifications/notification-dispatcher";
import { AuditLogService } from "../../observability/audit-log.service";
import { AuditEventWriter } from "../../observability/audit-event-writer";
import { ChangeManagerDto } from "../dto/change-manager.dto";
import { StoreRepository } from "../repositories/store.repository";

@Injectable()
export class ChangeStoreManagerUseCase {
  constructor(
    private readonly stores: StoreRepository,
    private readonly notifications: NotificationsService,
    private readonly auditLog: AuditLogService,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcher,
    @Optional() private readonly auditWriter?: AuditEventWriter
  ) {}

  async execute(actorId: string, storeId: string, dto: ChangeManagerDto) {
    const store = await this.stores.findStore(storeId);
    if (!store) throw new NotFoundException("门店不存在");

    const newManager = await this.stores.findUser(dto.newManagerId);
    if (!newManager) throw new NotFoundException("指定的用户不存在");

    const currentManager = await this.stores.findStoreManager(storeId);

    if (currentManager?.userId === dto.newManagerId) {
      throw new BadRequestException("该用户已是本门店店长");
    }

    const newManagerMember = await this.stores.findMemberByUserId(dto.newManagerId);
    if (newManagerMember && newManagerMember.storeId !== storeId) {
      throw new BadRequestException("该用户已是其他门店的成员");
    }

    await this.stores.changeManager({
      storeId,
      actorId,
      newManagerId: dto.newManagerId,
      currentManagerId: currentManager?.id,
      existingNewManagerMemberId: newManagerMember?.id
    });
    this.writeAudit({
      action: "STORE_MANAGER_CHANGED",
      targetType: "store",
      targetId: storeId,
      metadata: {
        previousManagerId: currentManager?.userId,
        newManagerId: dto.newManagerId
      }
    });

    if (currentManager) {
      await (this.notificationDispatcher?.dispatch({
        userId: currentManager.userId,
        type: "REMOVED_FROM_STORE",
        payload: {
          storeId,
          storeName: store.name,
          reason: "店长职位已变更"
        }
      }) ?? this.notifications.send(currentManager.userId, "REMOVED_FROM_STORE", {
        storeId,
        storeName: store.name,
        reason: "店长职位已变更"
      }));
    }

    return { success: true };
  }

  private writeAudit(event: Parameters<AuditLogService["record"]>[0]) {
    return this.auditWriter?.write(event) ?? this.auditLog.record(event);
  }
}
