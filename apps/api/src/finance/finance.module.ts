import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { ExpenseWorkflowService } from "./expense-workflow.service";
import { FinanceQueryService } from "./finance-query.service";
import { ReimbursementWorkflowService } from "./reimbursement-workflow.service";
import { UsersModule } from "../users/users.module";
import { FinanceAttachmentService } from "./finance-attachment.service";
import { FinancialDocument } from "./domain/financial-document";

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinancialDocument, ExpenseWorkflowService, FinanceQueryService, ReimbursementWorkflowService, FinanceAttachmentService],
  exports: [FinanceService, ExpenseWorkflowService, FinanceQueryService, FinancialDocument, ReimbursementWorkflowService, FinanceAttachmentService]
})
export class FinanceModule {}
