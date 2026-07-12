/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { AfterSalePhotoStage, AfterSaleStatus, Prisma, StorePosition } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import type { MulterFile } from "../users/multer-file.type";
import { OssService } from "../users/oss.service";
import { AssignAfterSaleDto, CreateAfterSaleDto, JudgeAfterSaleDto, ListAfterSalesDto, SubmitAfterSaleEvidenceDto, UploadAfterSalePhotoDto } from "./dto/after-sales.dto";

export type AuthenticatedAfterSalesUser = UserWithStoreMember & {
  username?: string;
};

@Injectable()
export class AfterSalesService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(OssService) private readonly oss?: OssService
  ) {}

  async create(user: AuthenticatedAfterSalesUser, dto: CreateAfterSaleDto) {
    const actor = await this.withStoreMember(user);
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { warranty: true }
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (!PermissionPolicy.canManageAfterSales(actor, order.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const issuePhotos = sanitizePhotoEvidence(dto.issuePhotos, dto.issuePhotoUrls, "问题照片");
    const issuePhotoUrls = issuePhotos.map((photo) => photo.url);
    const afterSale = await this.prisma.afterSale.create({
      data: {
        storeId: order.storeId,
        orderId: order.id,
        warrantyId: order.warranty?.id,
        customerId: order.customerId,
        description: dto.description,
        issuePhotoUrls,
        createdById: actor.id
      }
    });
    await this.createPhotoEvidence(
      afterSale.id,
      buildAfterSalePhotoRows(AfterSalePhotoStage.ISSUE, issuePhotos, actor.id)
    );
    await this.recordAuditEvent({
      action: "AFTER_SALE_CREATED",
      actorId: actor.id,
      storeId: order.storeId,
      targetId: afterSale.id,
      metadata: { orderId: order.id }
    });
    return afterSale;
  }

  async list(user: AuthenticatedAfterSalesUser, query: ListAfterSalesDto) {
    const actor = await this.withStoreMember(user);
    if (!PermissionPolicy.canViewStoreData(actor, query.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const where = buildAfterSalesListScope(actor, query.storeId);
    return this.prisma.afterSale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: afterSaleSummarySelect
    });
  }

  async detail(user: AuthenticatedAfterSalesUser, id: string) {
    const actor = await this.withStoreMember(user);
    const afterSale = await this.prisma.afterSale.findFirst({
      where: buildAfterSalesDetailScope(actor, id),
      select: afterSaleSummarySelect
    });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!PermissionPolicy.canViewStoreData(actor, afterSale.storeId)) {
      throw new ForbiddenException("无权限");
    }
    const events = this.prisma.auditEvent
      ? await this.prisma.auditEvent.findMany({
          where: { targetType: "after_sale", targetId: id },
          orderBy: { createdAt: "asc" }
        })
      : [];
    return { ...afterSale, events, capabilities: buildAfterSaleCapabilities(actor, afterSale) };
  }

  async assign(user: AuthenticatedAfterSalesUser, id: string, dto: AssignAfterSaleDto) {
    const actor = await this.withStoreMember(user);
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!PermissionPolicy.canManageAfterSales(actor, afterSale.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (afterSale.status !== AfterSaleStatus.OPEN && afterSale.status !== AfterSaleStatus.ASSIGNED) {
      throw new BadRequestException("售后已进入处理完成阶段，不能再次派单");
    }
    const workerIds = [...new Set(dto.workerUserIds)];
    const members = await this.prisma.storeMember.findMany({
      where: {
        storeId: afterSale.storeId,
        userId: { in: workerIds },
        position: { in: [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE] }
      }
    });
    if (members.length !== workerIds.length) {
      throw new BadRequestException("售后施工人员必须属于本门店且岗位有效");
    }
    await this.prisma.afterSaleAssignment.createMany({
      data: workerIds.map((workerUserId) => ({
        afterSaleId: id,
        workerUserId,
        assignedById: actor.id
      })),
      skipDuplicates: true
    });
    await this.recordAuditEvent({
      action: "AFTER_SALE_ASSIGNED",
      actorId: actor.id,
      storeId: afterSale.storeId,
      targetId: id,
      metadata: { workerUserIds: workerIds }
    });
    return this.prisma.afterSale.update({
      where: { id },
      data: { status: AfterSaleStatus.ASSIGNED }
    });
  }

  async judgeResponsibility(user: AuthenticatedAfterSalesUser, id: string, dto: JudgeAfterSaleDto) {
    const actor = await this.withStoreMember(user);
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!PermissionPolicy.canManageAfterSales(actor, afterSale.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (afterSale.status !== AfterSaleStatus.ASSIGNED) {
      throw new BadRequestException("售后必须在派单处理中完成责任判定");
    }
    const constructionPhotos = sanitizePhotoEvidence(dto.constructionPhotos, dto.constructionPhotoUrls, "施工后照片");
    const supplementPhotos = sanitizePhotoEvidence(dto.supplementPhotos, dto.supplementPhotoUrls, "补充证据");
    const existingConstructionPhoto = await this.prisma.afterSalePhoto?.findFirst?.({
      where: { afterSaleId: id, stage: AfterSalePhotoStage.CONSTRUCTION_AFTER }
    });
    if (constructionPhotos.length === 0 && !existingConstructionPhoto) {
      throw new BadRequestException("责任判定前必须有施工后照片证据");
    }
    const constructionPhotoUrls = constructionPhotos.map((photo) => photo.url);
    const updated = await this.prisma.afterSale.update({
      where: { id },
      data: {
        responsibility: dto.responsibility,
        constructionIssueCategory: dto.constructionIssueCategory?.trim() || undefined,
        constructionPhotoUrls,
        resolutionNote: dto.resolutionNote,
        status: AfterSaleStatus.RESOLVED
      }
    });
    await this.createPhotoEvidence(afterSale.id, [
      ...buildAfterSalePhotoRows(AfterSalePhotoStage.CONSTRUCTION_AFTER, constructionPhotos, actor.id),
      ...buildAfterSalePhotoRows(AfterSalePhotoStage.SUPPLEMENT, supplementPhotos, actor.id)
    ]);
    if (dto.penaltyWorkerUserId && dto.penaltyAmountCents && dto.penaltyAmountCents > 0) {
      await this.prisma.penalty.create({
        data: {
          afterSaleId: id,
          workerUserId: dto.penaltyWorkerUserId,
          amountCents: dto.penaltyAmountCents,
          reason: dto.penaltyReason ?? "售后责任处罚",
          createdById: actor.id
        }
      });
    }
    await this.recordAuditEvent({
      action: "AFTER_SALE_RESPONSIBILITY_JUDGED",
      actorId: actor.id,
      storeId: afterSale.storeId,
      targetId: id,
      metadata: { responsibility: dto.responsibility, constructionIssueCategory: dto.constructionIssueCategory }
    });
    return updated;
  }

  async submitEvidence(user: AuthenticatedAfterSalesUser, id: string, dto: SubmitAfterSaleEvidenceDto) {
    const actor = await this.withStoreMember(user);
    const afterSale = await this.prisma.afterSale.findFirst({
      where: buildAfterSalesDetailScope(actor, id),
      select: { id: true, storeId: true, status: true }
    });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    const isAssignedWorker =
      actor.storeMember?.position === StorePosition.CONSTRUCTION || actor.storeMember?.position === StorePosition.APPRENTICE;
    if (!isAssignedWorker) {
      throw new ForbiddenException("无权限");
    }
    if (afterSale.status !== AfterSaleStatus.ASSIGNED) {
      throw new BadRequestException("当前售后阶段不能提交处理证据");
    }
    const existingConstructionPhoto = await this.prisma.afterSalePhoto.findFirst({ where: { afterSaleId: id, stage: AfterSalePhotoStage.CONSTRUCTION_AFTER } });
    const constructionPhotos = sanitizePhotoEvidence(dto.constructionPhotos, undefined, "施工后照片");
    const supplementPhotos = sanitizePhotoEvidence(dto.supplementPhotos, undefined, "补充证据");
    const evidenceNote = dto.evidenceNote?.trim();
    if (constructionPhotos.length === 0 && !existingConstructionPhoto) {
      throw new BadRequestException("请至少提交一张施工后照片");
    }
    await this.createPhotoEvidence(afterSale.id, [
      ...buildAfterSalePhotoRows(AfterSalePhotoStage.CONSTRUCTION_AFTER, constructionPhotos, actor.id),
      ...buildAfterSalePhotoRows(AfterSalePhotoStage.SUPPLEMENT, supplementPhotos, actor.id)
    ]);
    if (this.prisma.afterSale.update) {
      await this.prisma.afterSale.update({
        where: { id },
        data: { evidenceNote: evidenceNote || undefined }
      });
    }
    await this.recordAuditEvent({
      action: "AFTER_SALE_EVIDENCE_SUBMITTED",
      actorId: actor.id,
      storeId: afterSale.storeId,
      targetId: id,
      metadata: { constructionPhotoCount: constructionPhotos.length, supplementPhotoCount: supplementPhotos.length, hasNote: Boolean(evidenceNote) }
    });
    return this.detail(user, id);
  }

  async uploadPhoto(
    user: AuthenticatedAfterSalesUser,
    id: string,
    dto: UploadAfterSalePhotoDto,
    file?: MulterFile
  ) {
    if (!file || !file.mimetype.startsWith("image/")) {
      throw new BadRequestException("请上传图片文件");
    }
    if (dto.stage !== AfterSalePhotoStage.CONSTRUCTION_AFTER && dto.stage !== AfterSalePhotoStage.SUPPLEMENT) {
      throw new BadRequestException("售后证据照片阶段无效");
    }
    const actor = await this.withStoreMember(user);
    const afterSale = await this.prisma.afterSale.findFirst({
      where: buildAfterSalesDetailScope(actor, id),
      select: {
        id: true,
        storeId: true,
        status: true,
        assignments: { select: { workerUserId: true } }
      }
    });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    const isAssignedWorker = afterSale.assignments.some((assignment) => assignment.workerUserId === actor.id);
    if (!isAssignedWorker) throw new ForbiddenException("只有已派单施工人员可以上传售后证据");
    if (afterSale.status !== AfterSaleStatus.ASSIGNED) {
      throw new BadRequestException("当前售后阶段不能上传处理证据");
    }
    if (!this.oss) throw new BadRequestException("图片存储服务未配置");
    const url = await this.oss.uploadAfterSalePhoto(afterSale.storeId, afterSale.id, file);
    const photo = await this.prisma.afterSalePhoto.create({
      data: {
        afterSaleId: afterSale.id,
        stage: dto.stage,
        url,
        note: dto.note?.trim() || undefined,
        uploadedById: actor.id
      }
    });
    if (dto.stage === AfterSalePhotoStage.CONSTRUCTION_AFTER && this.prisma.afterSale.update) {
      await this.prisma.afterSale.update({
        where: { id: afterSale.id },
        data: { constructionPhotoUrls: { push: url } }
      });
    }
    await this.recordAuditEvent({
      action: "AFTER_SALE_PHOTO_UPLOADED",
      actorId: actor.id,
      storeId: afterSale.storeId,
      targetId: afterSale.id,
      metadata: { stage: dto.stage, url }
    });
    return photo;
  }

  async close(user: AuthenticatedAfterSalesUser, id: string) {
    const actor = await this.withStoreMember(user);
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!PermissionPolicy.canManageAfterSales(actor, afterSale.storeId)) {
      throw new ForbiddenException("无权限");
    }
    if (afterSale.status === AfterSaleStatus.CLOSED) {
      return afterSale;
    }
    if (afterSale.status !== AfterSaleStatus.RESOLVED) {
      throw new BadRequestException("售后单需先完成判责处理后才能归档");
    }
    const closed = await this.prisma.afterSale.update({
      where: { id },
      data: {
        status: AfterSaleStatus.CLOSED,
        closedAt: new Date()
      }
    });
    await this.recordAuditEvent({
      action: "AFTER_SALE_CLOSED",
      actorId: actor.id,
      storeId: afterSale.storeId,
      targetId: id,
      metadata: {}
    });
    return closed;
  }

  private async recordAuditEvent(event: {
    action: string;
    actorId: string;
    storeId: string;
    targetId: string;
    metadata: Record<string, unknown>;
  }) {
    if (!this.prisma.auditEvent) return;
    await this.prisma.auditEvent.create({
      data: {
        action: event.action,
        actorId: event.actorId,
        storeId: event.storeId,
        targetType: "after_sale",
        targetId: event.targetId,
          metadata: event.metadata as Prisma.InputJsonValue
      }
    });
  }

  private async withStoreMember(user: AuthenticatedAfterSalesUser): Promise<UserWithStoreMember> {
    if (user.storeMember !== undefined) return user;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: user.id },
      select: { storeId: true, position: true }
    });
    return { id: user.id, isAuditor: user.isAuditor, storeMember: member };
  }

  private async createPhotoEvidence(
    afterSaleId: string,
    photos: Array<{ stage: AfterSalePhotoStage; url: string; note: string; uploadedById: string }>
  ) {
    if (photos.length === 0) return;
    await this.prisma.afterSalePhoto.createMany({
      data: photos.map((photo) => ({
        afterSaleId,
        stage: photo.stage,
        url: photo.url,
        note: photo.note,
        uploadedById: photo.uploadedById
      }))
    });
  }
}

function sanitizePhotoUrls(urls?: string[]) {
  return [...new Set((urls ?? []).map((url) => url.trim()).filter(Boolean))].slice(0, 12);
}

function sanitizePhotoEvidence(
  photos: Array<{ url?: string; note?: string | null }> | undefined,
  urls: string[] | undefined,
  defaultNote: string
) {
  const merged = [
    ...(photos ?? []).map((photo) => ({ url: photo.url?.trim() ?? "", note: photo.note?.trim() || defaultNote })),
    ...sanitizePhotoUrls(urls).map((url) => ({ url, note: defaultNote }))
  ];
  const seen = new Set<string>();
  const result: Array<{ url: string; note: string }> = [];
  for (const photo of merged) {
    if (!photo.url || seen.has(photo.url)) continue;
    seen.add(photo.url);
    result.push(photo);
  }
  return result.slice(0, 12);
}

function buildAfterSalePhotoRows(stage: AfterSalePhotoStage, photos: Array<{ url: string; note: string }>, uploadedById: string) {
  return photos.map((photo) => ({ stage, url: photo.url, uploadedById, note: photo.note }));
}

function buildAfterSalesListScope(actor: UserWithStoreMember, storeId: string) {
  const where: {
    storeId: string;
    assignments?: { some: { workerUserId: string } };
    order?: { salesPersonId: string };
  } = { storeId };
  if (!actor.isAuditor && actor.storeMember?.position === StorePosition.SALES) {
    where.order = { salesPersonId: actor.id };
    return where;
  }
  if (
    !actor.isAuditor &&
    (actor.storeMember?.position === StorePosition.CONSTRUCTION || actor.storeMember?.position === StorePosition.APPRENTICE)
  ) {
    where.assignments = { some: { workerUserId: actor.id } };
  }
  return where;
}

function buildAfterSalesDetailScope(actor: UserWithStoreMember, id: string) {
  const where: {
    id: string;
    storeId?: string;
    assignments?: { some: { workerUserId: string } };
    order?: { salesPersonId: string };
  } = { id };
  if (!actor.isAuditor) {
    where.storeId = actor.storeMember?.storeId ?? "__no_store__";
  }
  if (
    !actor.isAuditor &&
    (actor.storeMember?.position === StorePosition.CONSTRUCTION || actor.storeMember?.position === StorePosition.APPRENTICE)
  ) {
    where.assignments = { some: { workerUserId: actor.id } };
  }
  if (!actor.isAuditor && actor.storeMember?.position === StorePosition.SALES) {
    where.order = { salesPersonId: actor.id };
  }
  return where;
}

const userDisplaySelect = {
  id: true,
  username: true,
  nickname: true,
  avatarUrl: true
} as const;

const afterSaleSummarySelect = {
  id: true,
  storeId: true,
  orderId: true,
  warrantyId: true,
  customerId: true,
  description: true,
  status: true,
  responsibility: true,
  issuePhotoUrls: true,
  constructionPhotoUrls: true,
  constructionIssueCategory: true,
  evidenceNote: true,
  resolutionNote: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
  assignments: {
    select: {
      id: true,
      workerUserId: true,
      assignedAt: true,
      worker: { select: userDisplaySelect }
    }
  },
  photos: {
    select: {
      id: true,
      stage: true,
      url: true,
      note: true,
      uploadedById: true,
      createdAt: true,
      uploadedBy: { select: userDisplaySelect }
    },
    orderBy: { createdAt: "asc" }
  },
  penalties: {
    select: {
      id: true,
      workerUserId: true,
      amountCents: true,
      reason: true,
      createdAt: true,
      worker: { select: userDisplaySelect },
      createdBy: { select: userDisplaySelect }
    },
    orderBy: { createdAt: "desc" }
  },
  warranty: { select: { warrantyNo: true, status: true, scope: true } },
  order: {
    select: {
      orderNo: true,
      customer: { select: { name: true, companyName: true, contactPerson: true } },
      vehicle: { select: { carPlate: true, carModel: true, carColor: true } },
      constructionRecord: {
        select: {
          id: true,
          photos: {
            select: {
              id: true,
              stage: true,
              url: true,
              uploadedById: true,
              createdAt: true,
              uploadedBy: { select: userDisplaySelect }
            },
            orderBy: { createdAt: "asc" }
          }
        }
      }
    }
  }
} as const;

function buildAfterSaleCapabilities(
  actor: UserWithStoreMember,
  afterSale: { storeId: string; status: AfterSaleStatus; assignments?: Array<{ workerUserId: string }> }
) {
  const isManager = PermissionPolicy.canManageAfterSales(actor, afterSale.storeId);
  const isAssignedWorker = Boolean(afterSale.assignments?.some((assignment) => assignment.workerUserId === actor.id));
  return {
    canAssign: isManager && (afterSale.status === AfterSaleStatus.OPEN || afterSale.status === AfterSaleStatus.ASSIGNED),
    canSubmitEvidence: isAssignedWorker && afterSale.status === AfterSaleStatus.ASSIGNED,
    canJudgeResponsibility: isManager && afterSale.status === AfterSaleStatus.ASSIGNED,
    canClose: isManager && afterSale.status === AfterSaleStatus.RESOLVED
  };
}
