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
import { CashFactWriter } from "./domain/cash-fact-writer";

@Module({
  imports: [PrismaModule, UsersModule, PermissionsModule],
  controllers: [FinanceController],
  providers: [FinanceService, CashFactWriter, FinancialDocumentQuery, ExpenseWorkflowService, FinanceQueryService, ReimbursementWorkflowService, FinanceAttachmentService],
  exports: [FinanceService, CashFactWriter, ExpenseWorkflowService, FinancialDocumentQuery, ReimbursementWorkflowService, FinanceAttachmentService]
})
export class FinanceModule {}
