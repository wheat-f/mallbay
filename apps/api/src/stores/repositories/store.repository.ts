import { Injectable } from "@nestjs/common";
import { StoreStatus, SubmissionStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { NormalizedSubmissionPhoto } from "../domain/store-policy";

type CreateAuditSubmissionInput = {
  storeId: string;
  submittedById: string;
  name: string;
  address?: string;
  description?: string;
  photos: NormalizedSubmissionPhoto[];
};

@Injectable()
export class StoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMemberByUserId(userId: string) {
    return this.prisma.storeMember.findUnique({
      where: { userId }
    });
  }

  getStoreOrThrow(storeId: string) {
    return this.prisma.store.findUniqueOrThrow({ where: { id: storeId } });
  }

  closePendingSubmissions(storeId: string) {
    return this.prisma.storeAuditSubmission.updateMany({
      where: { storeId, status: SubmissionStatus.PENDING },
      data: { status: SubmissionStatus.REJECTED, reviewNote: "新提交覆盖，自动关闭" }
    });
  }

  createAuditSubmission(input: CreateAuditSubmissionInput) {
    return this.prisma.storeAuditSubmission.create({
      data: {
        storeId: input.storeId,
        submittedById: input.submittedById,
        name: input.name,
        address: input.address,
        description: input.description,
        photos: {
          create: input.photos.map((p) => ({
            url: p.url,
            isCover: p.isCover,
            order: p.order
          }))
        }
      },
      include: { photos: true }
    });
  }

  updateStoreStatus(storeId: string, status: StoreStatus) {
    return this.prisma.store.update({
      where: { id: storeId },
      data: { status }
    });
  }
}
