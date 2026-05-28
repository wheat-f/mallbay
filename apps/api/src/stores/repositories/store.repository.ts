import { Injectable } from "@nestjs/common";
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
    await this.prisma.$transaction(async (tx) => {
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
    });
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
}
