import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { StorePosition, StoreStatus, SubmissionStatus } from "@prisma/client";
import { NotificationsService } from "../../notifications/notifications.service";
import { PrismaService } from "../../prisma/prisma.service";
import { ReviewAction, ReviewStoreDto } from "../dto/review-store.dto";
import { StorePolicy } from "../domain/store-policy";

@Injectable()
export class ReviewStoreSubmissionUseCase {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  async execute(auditorId: string, isAuditor: boolean, submissionId: string, dto: ReviewStoreDto) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    StorePolicy.assertReviewInput(dto.action, dto.reviewNote);

    const submission = await this.prisma.storeAuditSubmission.findUnique({
      where: { id: submissionId },
      include: { photos: true, store: true }
    });

    if (!submission) throw new NotFoundException("提交记录不存在");
    if (submission.status !== SubmissionStatus.PENDING) {
      throw new BadRequestException("该提交已处理");
    }

    if (dto.action === ReviewAction.APPROVE) {
      await this.approveSubmission(auditorId, submissionId, submission);
      return { success: true };
    }

    await this.rejectSubmission(auditorId, submissionId, dto.reviewNote, submission);
    return { success: true };
  }

  private async approveSubmission(
    auditorId: string,
    submissionId: string,
    submission: {
      storeId: string;
      name: string;
      address: string | null;
      description: string | null;
      photos: Array<{ url: string; isCover: boolean; order: number }>;
    }
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

    const manager = await this.prisma.storeMember.findFirst({
      where: { storeId: submission.storeId, position: StorePosition.MANAGER }
    });
    if (manager) {
      await this.notifications.send(manager.userId, "AUDIT_APPROVED", {
        storeId: submission.storeId,
        storeName: submission.name
      });
    }
  }

  private async rejectSubmission(
    auditorId: string,
    submissionId: string,
    reviewNote: string | undefined,
    submission: { storeId: string; store: { name: string } }
  ) {
    await this.prisma.storeAuditSubmission.update({
      where: { id: submissionId },
      data: {
        status: SubmissionStatus.REJECTED,
        reviewNote,
        reviewedById: auditorId,
        reviewedAt: new Date()
      }
    });

    const hasApproved = await this.prisma.storeAuditSubmission.count({
      where: { storeId: submission.storeId, status: SubmissionStatus.APPROVED }
    });
    const newStatus = StorePolicy.statusAfterRejectedSubmission(hasApproved > 0);

    await this.prisma.store.update({
      where: { id: submission.storeId },
      data: { status: newStatus }
    });

    const manager = await this.prisma.storeMember.findFirst({
      where: { storeId: submission.storeId, position: StorePosition.MANAGER }
    });
    if (manager) {
      await this.notifications.send(manager.userId, "AUDIT_REJECTED", {
        storeId: submission.storeId,
        storeName: submission.store.name,
        reviewNote
      });
    }
  }
}
