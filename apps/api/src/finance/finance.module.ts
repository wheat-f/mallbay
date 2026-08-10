import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { ExpenseWorkflowService } from "./expense-workflow.service";
import { FinanceQueryService } from "./finance-query.service";
import { ReimbursementWorkflowService } from "./reimbursement-workflow.service";
import { UsersModule } from "../users/users.module";
import { FinanceAttachmentService } from "./finance-attachment.service";
import { FinancialDocumentQuery } from "./domain/financial-document-query";
import { PermissionsModule } from "../permissions/permissions.module";

@Module({
  imports: [PrismaModule, UsersModule, PermissionsModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinancialDocumentQuery, ExpenseWorkflowService, FinanceQueryService, ReimbursementWorkflowService, FinanceAttachmentService],
  exports: [FinanceService, ExpenseWorkflowService, FinancialDocumentQuery, ReimbursementWorkflowService, FinanceAttachmentService]
})
export class FinanceModule {}
