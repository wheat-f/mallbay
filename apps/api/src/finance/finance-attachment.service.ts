import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FinanceApplicationType, FinanceAttachmentCategory } from "@prisma/client";
import type { UserWithStoreMember } from "../permissions/domain/access-types";
import { AccessContext } from "../permissions/domain/access-context";
import { PrismaService } from "../prisma/prisma.service";
import { OssService } from "../users/oss.service";
import type { MulterFile } from "../users/multer-file.type";
import { UploadFinanceAttachmentDto } from "./dto/finance.dto";
import { FINANCE_CAPABILITIES } from "./domain/finance-capabilities";

type FinanceActor = UserWithStoreMember & { username?: string };

@Injectable()
export class FinanceAttachmentService {
  constructor(private readonly prisma: PrismaService, private readonly oss: OssService, private readonly accessContext: AccessContext) {}

  async upload(actor: FinanceActor, applicationType: "EXPENSE" | "REIMBURSEMENT", applicationId: string, dto: UploadFinanceAttachmentDto, file: MulterFile) {
    actor = await this.withStoreMember(actor);
    const application = applicationType === "EXPENSE"
      ? await this.prisma.expenseApplication.findUnique({ where: { id: applicationId }, select: { id: true, storeId: true, applicantId: true } })
      : await this.prisma.reimbursementApplication.findUnique({ where: { id: applicationId }, select: { id: true, storeId: true, applicantId: true } });
    if (!application) throw new NotFoundException("财务申请不存在");
    if (!file) throw new NotFoundException("请上传附件");
    const canViewOwn = await this.accessContext.can(actor.id, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.attach, { storeId: application.storeId, ownerId: application.applicantId });
    const canViewAll = await this.accessContext.can(actor.id, FINANCE_CAPABILITIES.document.capability, FINANCE_CAPABILITIES.document.attach, { storeId: application.storeId });
    if (!canViewOwn && !canViewAll) throw new ForbiddenException("无权限");
    const url = await this.oss.uploadFinanceAttachment(application.storeId, applicationId, file);
    return this.prisma.financeAttachment.create({ data: { storeId: application.storeId, applicationType: applicationType as FinanceApplicationType, applicationId, category: dto.category as FinanceAttachmentCategory, fileUrl: url, fileName: file.originalname, contentType: file.mimetype, fileSize: file.size ?? file.buffer.length, uploadedById: actor.id } });
  }

  private async withStoreMember(actor: FinanceActor): Promise<FinanceActor> {
    if (actor.storeMember !== undefined) return actor;
    const member = await this.prisma.storeMember.findUnique({
      where: { userId: actor.id },
      select: { storeId: true, position: true }
    });
    return { ...actor, storeMember: member };
  }
}
