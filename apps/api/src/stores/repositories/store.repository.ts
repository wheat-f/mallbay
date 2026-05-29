import { ConflictException, Injectable } from "@nestjs/common";
import { StorePosition, StoreStatus, SubmissionStatus } from "@prisma/client";
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

type ReviewableSubmission = {
  storeId: string;
  name: string;
  address: string | null;
  description: string | null;
  photos: Array<{ url: string; isCover: boolean; order: number }>;
};

type ChangeManagerInput = {
  storeId: string;
  newManagerId: string;
  currentManagerId?: string;
  existingNewManagerMemberId?: string;
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

  findStore(storeId: string) {
    return this.prisma.store.findUnique({ where: { id: storeId } });
  }

  findUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  closePendingSubmissions(storeId: string) {
    return this.prisma.storeAuditSubmission.updateMany({
      where: { storeId, status: SubmissionStatus.PENDING },
      data: { status: SubmissionStatus.REJECTED, reviewNote: "新提交覆盖，自动关闭" }
    });
  }

  createAuditSubmission(input: CreateAuditSubmissionInput) {
    return this.mapInvariantConflict(() =>
      this.prisma.storeAuditSubmission.create({
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
      })
    );
  }

  private async mapInvariantConflict<T>(operation: () => Promise<T>) {
    try {
      return await operation();
    } catch (error) {
      const constraint = getUniqueConstraintName(error);
      if (constraint === "StoreAuditSubmission_one_pending_per_store_uidx") {
        throw new ConflictException("该门店已有待审核提交，请刷新后重试");
      }
      if (constraint === "StorePhoto_one_cover_per_store_uidx") {
        throw new ConflictException("该门店已有封面图，请刷新后重试");
      }
      if (constraint === "StoreSubmissionPhoto_one_cover_per_submission_uidx") {
        throw new ConflictException("该送审提交已有封面图，请刷新后重试");
      }
      throw error;
    }
  }

  updateStoreStatus(storeId: string, status: StoreStatus) {
    return this.prisma.store.update({
      where: { id: storeId },
      data: { status }
    });
  }

  findSubmissionWithStore(submissionId: string) {
    return this.prisma.storeAuditSubmission.findUnique({
      where: { id: submissionId },
      include: { photos: true, store: true }
    });
  }

  async approveSubmission(
    auditorId: string,
    submissionId: string,
    submission: ReviewableSubmission
  ) {
    await this.mapInvariantConflict(() =>
      this.prisma.$transaction(async (tx) => {
        await tx.storeAuditSubmission.update({
          where: { id: submissionId },
          data: {
            status: SubmissionStatus.APPROVED,
            reviewedById: auditorId,
            reviewedAt: new Date()
          }
        });

        await tx.store.update({
          where: { id: submission.storeId },
          data: {
            name: submission.name,
            address: submission.address,
            description: submission.description,
            status: StoreStatus.PUBLISHED
          }
        });

        await tx.storePhoto.deleteMany({ where: { storeId: submission.storeId } });
        await tx.storePhoto.createMany({
          data: submission.photos.map((p) => ({
            storeId: submission.storeId,
            url: p.url,
            isCover: p.isCover,
            order: p.order
          }))
        });
      })
    );
  }

  rejectSubmission(auditorId: string, submissionId: string, reviewNote: string | undefined) {
    return this.prisma.storeAuditSubmission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.REJECTED,
        reviewNote,
        reviewedById: auditorId,
        reviewedAt: new Date()
      }
    });
  }

  countApprovedSubmissions(storeId: string) {
    return this.prisma.storeAuditSubmission.count({
      where: { storeId, status: SubmissionStatus.APPROVED }
    });
  }

  findStoreManager(storeId: string) {
    return this.prisma.storeMember.findFirst({
      where: { storeId, position: StorePosition.MANAGER }
    });
  }

  findStoreMembers(storeId: string) {
    return this.prisma.storeMember.findMany({ where: { storeId } });
  }

  async changeManager(input: ChangeManagerInput) {
    await this.prisma.$transaction(async (tx) => {
      if (input.currentManagerId) {
        await tx.storeMember.delete({ where: { id: input.currentManagerId } });
      }

      if (input.existingNewManagerMemberId) {
        await tx.storeMember.update({
          where: { id: input.existingNewManagerMemberId },
          data: { position: StorePosition.MANAGER }
        });
      } else {
        await tx.storeMember.create({
          data: {
            storeId: input.storeId,
            userId: input.newManagerId,
            position: StorePosition.MANAGER
          }
        });
      }
    });
  }
}

function getUniqueConstraintName(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error) || error.code !== "P2002") {
    return null;
  }

  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  if (typeof target === "string") {
    return target;
  }
  if (Array.isArray(target)) {
    return target.join("_");
  }
  return null;
}
