import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional
} from "@nestjs/common";
import { SubmissionStatus } from "@prisma/client";
import { NotificationsService } from "../../notifications/notifications.service";
import { NotificationDispatcher } from "../../notifications/notification-dispatcher";
import { AuditLogService } from "../../observability/audit-log.service";
import { AuditEventWriter } from "../../observability/audit-event-writer";
import { ReviewAction, ReviewStoreDto } from "../dto/review-store.dto";
import { StorePolicy } from "../domain/store-policy";
import { StoreRepository } from "../repositories/store.repository";

@Injectable()
export class ReviewStoreSubmissionUseCase {
  constructor(
    private readonly stores: StoreRepository,
    private readonly notifications: NotificationsService,
    private readonly auditLog: AuditLogService,
    @Optional() private readonly notificationDispatcher?: NotificationDispatcher,
    @Optional() private readonly auditWriter?: AuditEventWriter
  ) {}

  async execute(auditorId: string, isAuditor: boolean, submissionId: string, dto: ReviewStoreDto) {
    if (!isAuditor) throw new ForbiddenException("无权限");

    StorePolicy.assertReviewInput(dto.action, dto.reviewNote);

    const submission = await this.stores.findSubmissionWithStore(submissionId);

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
    await this.stores.approveSubmission(auditorId, submissionId, submission);
    this.writeAudit({
      action: "STORE_REVIEW_APPROVED",
      actorId: auditorId,
      targetType: "storeSubmission",
      targetId: submissionId,
      metadata: { storeId: submission.storeId }
    });

    const manager = await this.stores.findStoreManager(submission.storeId);
    if (manager) {
      await this.dispatchNotification(manager.userId, "AUDIT_APPROVED", {
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
    await this.stores.rejectSubmission(auditorId, submissionId, reviewNote);
    this.writeAudit({
      action: "STORE_REVIEW_REJECTED",
      actorId: auditorId,
      targetType: "storeSubmission",
      targetId: submissionId,
      metadata: { storeId: submission.storeId }
    });

    const hasApproved = await this.stores.countApprovedSubmissions(submission.storeId);
    const newStatus = StorePolicy.statusAfterRejectedSubmission(hasApproved > 0);

    await this.stores.updateStoreStatus(submission.storeId, newStatus);

    const manager = await this.stores.findStoreManager(submission.storeId);
    if (manager) {
      await this.dispatchNotification(manager.userId, "AUDIT_REJECTED", {
        storeId: submission.storeId,
        storeName: submission.store.name,
        reviewNote
      });
    }
  }

  private dispatchNotification(userId: string, type: "AUDIT_APPROVED" | "AUDIT_REJECTED", payload: object) {
    return this.notificationDispatcher?.dispatch({ userId, type, payload })
      ?? this.notifications.send(userId, type, payload);
  }

  private writeAudit(event: Parameters<AuditLogService["record"]>[0]) {
    return this.auditWriter?.write(event) ?? this.auditLog.record(event);
  }
}
