import { ForbiddenException, Injectable } from "@nestjs/common";
import { StorePosition, StoreStatus, SubmissionStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SubmitStoreDto } from "../dto/submit-store.dto";
import { StorePolicy } from "../domain/store-policy";

@Injectable()
export class SubmitStoreForReviewUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(userId: string, storeId: string, dto: SubmitStoreDto) {
    await this.assertStoreManager(userId, storeId);

    const store = await this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });

    StorePolicy.assertCanSubmit(store.status);
    const photos = StorePolicy.normalizeSubmissionPhotos(dto.photos);

    await this.prisma.storeAuditSubmission.updateMany({
      where: { storeId, status: SubmissionStatus.PENDING },
      data: { status: SubmissionStatus.REJECTED, reviewNote: "新提交覆盖，自动关闭" }
    });

    const submission = await this.prisma.storeAuditSubmission.create({
      data: {
        storeId,
        submittedById: userId,
        name: dto.name,
        address: dto.address,
        description: dto.description,
        photos: {
          create: photos.map((p) => ({
            url: p.url,
            isCover: p.isCover,
            order: p.order
          }))
        }
      },
      include: { photos: true }
    });

    await this.prisma.store.update({
      where: { id: storeId },
      data: { status: StoreStatus.PENDING_REVIEW }
    });

    return submission;
  }

  private async assertStoreManager(userId: string, storeId: string) {
    const member = await this.prisma.storeMember.findUnique({
      where: { userId }
    });

    if (!member || member.storeId !== storeId || member.position !== StorePosition.MANAGER) {
      throw new ForbiddenException("仅店长可执行此操作");
    }

    return member;
  }
}
