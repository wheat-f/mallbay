import { ForbiddenException, Injectable } from "@nestjs/common";
import { StoreStatus } from "@prisma/client";
import { AccessContext } from "../../permissions/domain/access-context";
import { SubmitStoreDto } from "../dto/submit-store.dto";
import { StorePolicy } from "../domain/store-policy";
import { StoreRepository } from "../repositories/store.repository";

@Injectable()
export class SubmitStoreForReviewUseCase {
  constructor(
    private readonly stores: StoreRepository,
    private readonly accessContext: AccessContext
  ) {}

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
    const scope = await this.accessContext.scope({ userId }, "store.profile", "write", { storeId });
    if (!scope.allowed) throw new ForbiddenException("当前角色无权提交门店资料");
    return scope;
  }
}
