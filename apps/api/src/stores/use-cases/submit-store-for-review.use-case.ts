import { ForbiddenException, Injectable } from "@nestjs/common";
import { StorePosition, StoreStatus } from "@prisma/client";
import { SubmitStoreDto } from "../dto/submit-store.dto";
import { StorePolicy } from "../domain/store-policy";
import { StoreRepository } from "../repositories/store.repository";

@Injectable()
export class SubmitStoreForReviewUseCase {
  constructor(private readonly stores: StoreRepository) {}

  async execute(userId: string, storeId: string, dto: SubmitStoreDto) {
    await this.assertStoreManager(userId, storeId);

    const store = await this.stores.getStoreOrThrow(storeId);

    StorePolicy.assertCanSubmit(store.status);
    const photos = StorePolicy.normalizeSubmissionPhotos(dto.photos);

    await this.stores.closePendingSubmissions(storeId);

    const submission = await this.stores.createAuditSubmission({
      storeId,
      submittedById: userId,
      name: dto.name,
      address: dto.address,
      description: dto.description,
      photos
    });

    await this.stores.updateStoreStatus(storeId, StoreStatus.PENDING_REVIEW);

    return submission;
  }

  private async assertStoreManager(userId: string, storeId: string) {
    const member = await this.stores.findMemberByUserId(userId);

    if (!member || member.storeId !== storeId || member.position !== StorePosition.MANAGER) {
      throw new ForbiddenException("仅店长可执行此操作");
    }

    return member;
  }
}
