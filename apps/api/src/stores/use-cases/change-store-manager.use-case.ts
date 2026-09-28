import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { NotificationsService } from "../../notifications/notifications.service";
import { NotificationDispatcher } from "../../notifications/notification-dispatcher";
import { ChangeManagerDto } from "../dto/change-manager.dto";
import { StoreRepository } from "../repositories/store.repository";
import { PermissionsService } from "../../permissions/permissions.service";
import { randomUUID } from "crypto";

@Injectable()
export class ChangeStoreManagerUseCase {
  constructor(
    private readonly stores: StoreRepository,
    private readonly notifications: NotificationsService,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcher,
    @Optional() private readonly permissions?: PermissionsService
  ) {}

  async execute(actorId: string, storeId: string, dto: ChangeManagerDto, commandId?: string) {
    const store = await this.stores.findStore(storeId);
    if (!store) throw new NotFoundException("门店不存在");

    const newManager = await this.stores.findUser(dto.newManagerId);
    if (!newManager) throw new NotFoundException("指定的用户不存在");

    const currentManager = await this.stores.findStoreManager(storeId);

    const newManagerMember = await this.stores.findMemberByUserId(dto.newManagerId);
    if (newManagerMember && newManagerMember.storeId !== storeId) {
      throw new BadRequestException("该用户已是其他门店的成员");
    }

    const stableCommandId = commandId ?? randomUUID();
    const committed = await this.stores.changeManager({
      storeId,
      actorId,
      newManagerId: dto.newManagerId,
      currentManagerId: currentManager?.id,
      currentManagerUserId: currentManager?.userId,
      existingNewManagerMemberId: newManagerMember?.id,
      commandId: stableCommandId
    });
    if (!committed.replayed) {
      this.permissions?.invalidateUserCache(dto.newManagerId);
      if (committed.value.previousManagerUserId) this.permissions?.invalidateUserCache(committed.value.previousManagerUserId);
    }

    if (committed.value.previousManagerUserId) {
      await (this.notificationDispatcher?.dispatch({
        userId: committed.value.previousManagerUserId,
        type: "REMOVED_FROM_STORE",
        payload: {
          storeId,
          storeName: store.name,
          reason: "店长职位已变更"
        },
        dedupeKey: `store-manager:${stableCommandId}:removed`
      }) ?? this.notifications.send(committed.value.previousManagerUserId, "REMOVED_FROM_STORE", {
        storeId,
        storeName: store.name,
        reason: "店长职位已变更"
      }, `store-manager:${stableCommandId}:removed`));
    }

    return { success: true };
  }
}
