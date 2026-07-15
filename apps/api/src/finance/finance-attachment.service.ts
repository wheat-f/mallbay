import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { FinanceApplicationType, FinanceAttachmentCategory } from "@prisma/client";
import { PermissionPolicy, type UserWithStoreMember } from "../common/policies/permission.policy";
import { PrismaService } from "../prisma/prisma.service";
import { OssService } from "../users/oss.service";
import type { MulterFile } from "../users/multer-file.type";
import { UploadFinanceAttachmentDto } from "./dto/finance.dto";

type FinanceActor = UserWithStoreMember & { username?: string };

@Injectable()
export class FinanceAttachmentService {
  constructor(private readonly prisma: PrismaService, private readonly oss: OssService) {}

  async upload(actor: FinanceActor, applicationType: "EXPENSE" | "REIMBURSEMENT", applicationId: string, dto: UploadFinanceAttachmentDto, file: MulterFile) {
    const application = applicationType === "EXPENSE"
      ? await this.prisma.expenseApplication.findUnique({ where: { id: applicationId }, select: { id: true, storeId: true, applicantId: true } })
      : await this.prisma.reimbursementApplication.findUnique({ where: { id: applicationId }, select: { id: true, storeId: true, applicantId: true } });
    if (!application) throw new NotFoundException("财务申请不存在");
    if (!file) throw new NotFoundException("请上传附件");
    if (!PermissionPolicy.canViewOwnFinanceApplication(actor, application.storeId, application.applicantId) && !PermissionPolicy.canViewAllFinanceApplications(actor, application.storeId)) throw new ForbiddenException("无权限");
    const url = await this.oss.uploadFinanceAttachment(application.storeId, applicationId, file);
    return this.prisma.financeAttachment.create({ data: { storeId: application.storeId, applicationType: applicationType as FinanceApplicationType, applicationId, category: dto.category as FinanceAttachmentCategory, fileUrl: url, fileName: file.originalname, contentType: file.mimetype, fileSize: file.size ?? file.buffer.length, uploadedById: actor.id } });
  }
}
