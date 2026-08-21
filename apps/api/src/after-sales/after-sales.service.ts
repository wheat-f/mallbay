/* eslint-disable @typescript-eslint/consistent-type-imports */
import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { AfterSaleCostCategory, AfterSaleCostDirection, AfterSaleCostStatus, AfterSalePhotoStage, AfterSaleStatus, Prisma, StorePosition } from "@prisma/client";
import { AccessContext, type AccessSubject } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import type { MulterFile } from "../users/multer-file.type";
import { OssService } from "../users/oss.service";
import { AssignAfterSaleDto, CreateAfterSaleCostDto, CreateAfterSaleDto, JudgeAfterSaleDto, ListAfterSalesDto, ReverseAfterSaleCostDto, SubmitAfterSaleEvidenceDto, UploadAfterSalePhotoDto } from "./dto/after-sales.dto";

export type AuthenticatedAfterSalesUser = {
  id: string;
  username?: string;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  isAuditor?: boolean;
  /** @deprecated Adapter compatibility only; permission decisions ignore these fields. */
  storeMember?: { storeId: string; position: string } | null;
};

@Injectable()
export class AfterSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accessContext: AccessContext,
    @Optional() @Inject(OssService) private readonly oss?: OssService
  ) {}

  async create(user: AuthenticatedAfterSalesUser, dto: CreateAfterSaleDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const order = await this.prisma.order.findUnique({
      where: { id: dto.orderId },
      include: { warranty: true }
    });
    if (!order) throw new NotFoundException("订单不存在");
    if (!await this.accessContext.can(actor, "after-sales", "write", { storeId: order.storeId })) {
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
        createdById: actor.userId
      }
    });
    await this.createPhotoEvidence(
      afterSale.id,
      buildAfterSalePhotoRows(AfterSalePhotoStage.ISSUE, issuePhotos, actor.userId)
    );
    await this.recordAuditEvent({
      action: "AFTER_SALE_CREATED",
      actorId: actor.userId,
      storeId: order.storeId,
      targetId: afterSale.id,
      metadata: { orderId: order.id }
    });
    return afterSale;
  }

  async list(user: AuthenticatedAfterSalesUser, query: ListAfterSalesDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    if (!await this.accessContext.can(actor, "after-sales", "read", { storeId: query.storeId })) {
      throw new ForbiddenException("无权限");
    }
    const where = buildAfterSalesListScope(actor, query.storeId, await this.isSalesActor(actor, query.storeId), await this.isWorkerActor(actor, query.storeId));
    return this.prisma.afterSale.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: afterSaleSummarySelect
    });
  }

  async detail(user: AuthenticatedAfterSalesUser, id: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const afterSale = await this.prisma.afterSale.findFirst({
      where: await this.buildAfterSalesDetailScope(actor, id),
      select: afterSaleSummarySelect
    });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!await this.accessContext.can(actor, "after-sales", "read", { storeId: afterSale.storeId })) {
      throw new ForbiddenException("无权限");
    }
    const events = this.prisma.auditEvent
      ? await this.prisma.auditEvent.findMany({
          where: { targetType: "after_sale", targetId: id },
          orderBy: { createdAt: "asc" }
        })
      : [];
    return { ...afterSale, events, capabilities: await this.buildAfterSaleCapabilities(actor, afterSale) };
  }

  async assign(user: AuthenticatedAfterSalesUser, id: string, dto: AssignAfterSaleDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!await this.accessContext.can(actor, "after-sales", "write", { storeId: afterSale.storeId })) {
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
        assignedById: actor.userId
      })),
      skipDuplicates: true
    });
    await this.recordAuditEvent({
      action: "AFTER_SALE_ASSIGNED",
      actorId: actor.userId,
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
    const actor = { userId: user.id } satisfies AccessSubject;
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!await this.accessContext.can(actor, "after-sales", "write", { storeId: afterSale.storeId })) {
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
      ...buildAfterSalePhotoRows(AfterSalePhotoStage.CONSTRUCTION_AFTER, constructionPhotos, actor.userId),
      ...buildAfterSalePhotoRows(AfterSalePhotoStage.SUPPLEMENT, supplementPhotos, actor.userId)
    ]);
    if (dto.penaltyWorkerUserId && dto.penaltyAmountCents && dto.penaltyAmountCents > 0) {
      await this.prisma.penalty.create({
        data: {
          afterSaleId: id,
          workerUserId: dto.penaltyWorkerUserId,
          amountCents: dto.penaltyAmountCents,
          reason: dto.penaltyReason ?? "售后责任处罚",
          createdById: actor.userId
        }
      });
    }
    await this.recordAuditEvent({
      action: "AFTER_SALE_RESPONSIBILITY_JUDGED",
      actorId: actor.userId,
      storeId: afterSale.storeId,
      targetId: id,
      metadata: { responsibility: dto.responsibility, constructionIssueCategory: dto.constructionIssueCategory }
    });
    return updated;
  }

  async submitEvidence(user: AuthenticatedAfterSalesUser, id: string, dto: SubmitAfterSaleEvidenceDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const afterSale = await this.prisma.afterSale.findFirst({
      where: await this.buildAfterSalesDetailScope(actor, id),
      select: {
        id: true,
        storeId: true,
        status: true,
        assignments: { select: { workerUserId: true } }
      }
    });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    const isAssignedWorker = (await this.isWorkerActor(actor, afterSale.storeId)) &&
      afterSale.assignments.some((assignment) => assignment.workerUserId === actor.userId) &&
      await this.accessContext.can(actor, "after-sales", "write", { storeId: afterSale.storeId, ownerId: actor.userId });
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
      ...buildAfterSalePhotoRows(AfterSalePhotoStage.CONSTRUCTION_AFTER, constructionPhotos, actor.userId),
      ...buildAfterSalePhotoRows(AfterSalePhotoStage.SUPPLEMENT, supplementPhotos, actor.userId)
    ]);
    if (this.prisma.afterSale.update) {
      await this.prisma.afterSale.update({
        where: { id },
        data: { evidenceNote: evidenceNote || undefined }
      });
    }
    await this.recordAuditEvent({
      action: "AFTER_SALE_EVIDENCE_SUBMITTED",
      actorId: actor.userId,
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
    const actor = { userId: user.id } satisfies AccessSubject;
    const afterSale = await this.prisma.afterSale.findFirst({
      where: await this.buildAfterSalesDetailScope(actor, id),
      select: {
        id: true,
        storeId: true,
        status: true,
        assignments: { select: { workerUserId: true } }
      }
    });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    const isAssignedWorker = afterSale.assignments.some((assignment) => assignment.workerUserId === actor.userId);
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
        uploadedById: actor.userId
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
      actorId: actor.userId,
      storeId: afterSale.storeId,
      targetId: afterSale.id,
      metadata: { stage: dto.stage, url }
    });
    return photo;
  }

  async close(user: AuthenticatedAfterSalesUser, id: string) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    if (!await this.accessContext.can(actor, "after-sales", "write", { storeId: afterSale.storeId })) {
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
      actorId: actor.userId,
      storeId: afterSale.storeId,
      targetId: id,
      metadata: {}
    });
    return closed;
  }

  /**
   * Store managers maintain operational after-sales costs; finance maintains
   * cash-impacting refunds and supplier recovery.  A confirmed ledger row is
   * immutable and can only be corrected through `reverseCost`.
   */
  async addCost(user: AuthenticatedAfterSalesUser, afterSaleId: string, dto: CreateAfterSaleCostDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const afterSale = await this.prisma.afterSale.findUnique({ where: { id: afterSaleId } });
    if (!afterSale) throw new NotFoundException("售后单不存在");
    await this.assertCanRecordAfterSaleCost(actor, afterSale.storeId, dto.category);
    if (!dto.reason.trim()) throw new BadRequestException("请填写成本或追偿原因");
    if (dto.paymentRecordId) {
      const payment = await this.prisma.paymentRecord.findFirst({ where: { id: dto.paymentRecordId, storeId: afterSale.storeId }, select: { id: true } });
      if (!payment) throw new BadRequestException("关联的实际付款记录不存在或不属于当前门店");
    }
    const entry = await this.prisma.afterSaleCostEntry.create({
      data: {
        storeId: afterSale.storeId,
        afterSaleId,
        category: dto.category,
        direction: dto.category === AfterSaleCostCategory.SUPPLIER_RECOVERY ? AfterSaleCostDirection.RECOVERY : AfterSaleCostDirection.EXPENSE,
        amountCents: dto.amountCents,
        reason: dto.reason.trim(),
        paymentRecordId: dto.paymentRecordId,
        recordedById: actor.userId
      }
    });
    await this.recordAuditEvent({
      action: "AFTER_SALE_COST_RECORDED",
      actorId: actor.userId,
      storeId: afterSale.storeId,
      targetId: afterSaleId,
      metadata: { entryId: entry.id, category: entry.category, direction: entry.direction, amountCents: entry.amountCents, reason: entry.reason }
    });
    return entry;
  }

  async reverseCost(user: AuthenticatedAfterSalesUser, afterSaleId: string, costId: string, dto: ReverseAfterSaleCostDto) {
    const actor = { userId: user.id } satisfies AccessSubject;
    const entry = await this.prisma.afterSaleCostEntry.findFirst({ where: { id: costId, afterSaleId } });
    if (!entry) throw new NotFoundException("售后成本记录不存在");
    await this.assertCanRecordAfterSaleCost(actor, entry.storeId, entry.category);
    if (entry.status !== AfterSaleCostStatus.CONFIRMED) throw new BadRequestException("该售后成本已红冲，不能重复操作");
    if (!dto.reason.trim()) throw new BadRequestException("请填写红冲或调整原因");
    const now = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.afterSaleCostEntry.updateMany({
        where: { id: entry.id, status: AfterSaleCostStatus.CONFIRMED },
        data: { status: AfterSaleCostStatus.REVERSED, reversedAt: now, reversedById: actor.userId, reversalReason: dto.reason.trim() }
      });
      if (updated.count !== 1) throw new BadRequestException("该售后成本已被其他操作处理，请刷新后重试");
      return tx.afterSaleCostEntry.create({
        data: {
          storeId: entry.storeId,
          afterSaleId,
          category: entry.category,
          direction: entry.direction === AfterSaleCostDirection.EXPENSE ? AfterSaleCostDirection.RECOVERY : AfterSaleCostDirection.EXPENSE,
          amountCents: entry.amountCents,
          reason: `红冲：${dto.reason.trim()}`,
          reversalOfId: entry.id,
          recordedById: actor.userId
        }
      });
    });
    await this.recordAuditEvent({
      action: "AFTER_SALE_COST_REVERSED",
      actorId: actor.userId,
      storeId: entry.storeId,
      targetId: afterSaleId,
      metadata: { entryId: entry.id, reversalEntryId: result.id, reason: dto.reason.trim() }
    });
    return result;
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

  private async assertCanRecordAfterSaleCost(actor: AccessSubject, storeId: string, category: AfterSaleCostCategory) {
    const financeCategory = category === AfterSaleCostCategory.REFUND_COMPENSATION || category === AfterSaleCostCategory.SUPPLIER_RECOVERY;
    if (financeCategory) {
      if (!await this.isFinanceOrAdmin(actor, storeId)) throw new ForbiddenException("退款/补偿和供应商追偿仅财务可录入或红冲");
      return;
    }
    if (!await this.isStoreManagerOrAdmin(actor, storeId)) throw new ForbiddenException("材料、施工人工和外包费用仅店长可录入或红冲");
  }

  private isFinanceOrAdmin(actor: AccessSubject, storeId: string) {
    return this.accessContext.can(actor, "finance.cost", "read", { storeId });
  }

  private isStoreManagerOrAdmin(actor: AccessSubject, storeId: string) {
    return this.accessContext.can(actor, "store", "write", { storeId });
  }

  private async isSalesActor(actor: AccessSubject, storeId: string) {
    const scope = await this.accessContext.scope(actor, "orders", "read", { storeId, ownerId: actor.userId });
    return scope.ownerId === actor.userId;
  }

  private async isWorkerActor(actor: AccessSubject, storeId: string) {
    const scope = await this.accessContext.scope(actor, "after-sales", "write", { storeId, ownerId: actor.userId });
    return scope.ownerId === actor.userId;
  }

  private async buildAfterSalesDetailScope(actor: AccessSubject, id: string) {
    return { id };
  }

  private async buildAfterSaleCapabilities(
    actor: AccessSubject,
    afterSale: { storeId: string; status: AfterSaleStatus; assignments?: Array<{ workerUserId: string }> }
  ) {
    return buildAfterSaleCapabilities(
      await this.accessContext.can(actor, "after-sales", "write", { storeId: afterSale.storeId }),
      actor.userId,
      afterSale
    );
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

function buildAfterSalesListScope(actor: AccessSubject, storeId: string, isSales: boolean, isWorker: boolean) {
  const where: {
    storeId: string;
    assignments?: { some: { workerUserId: string } };
    order?: { salesPersonId: string };
  } = { storeId };
  if (isSales) {
    where.order = { salesPersonId: actor.userId };
    return where;
  }
  if (
    isWorker
  ) {
    where.assignments = { some: { workerUserId: actor.userId } };
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
  costEntries: {
    select: {
      id: true,
      category: true,
      direction: true,
      amountCents: true,
      reason: true,
      paymentRecordId: true,
      status: true,
      reversalOfId: true,
      reversalReason: true,
      confirmedAt: true,
      reversedAt: true,
      recordedBy: { select: userDisplaySelect },
      reversedBy: { select: userDisplaySelect }
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
  canManage: boolean,
  actorId: string,
  afterSale: { storeId: string; status: AfterSaleStatus; assignments?: Array<{ workerUserId: string }> }
) {
  const isManager = canManage;
  const isAssignedWorker = Boolean(afterSale.assignments?.some((assignment) => assignment.workerUserId === actorId));
  return {
    canAssign: isManager && (afterSale.status === AfterSaleStatus.OPEN || afterSale.status === AfterSaleStatus.ASSIGNED),
    canSubmitEvidence: isAssignedWorker && afterSale.status === AfterSaleStatus.ASSIGNED,
    canJudgeResponsibility: isManager && afterSale.status === AfterSaleStatus.ASSIGNED,
    canClose: isManager && afterSale.status === AfterSaleStatus.RESOLVED
  };
}
