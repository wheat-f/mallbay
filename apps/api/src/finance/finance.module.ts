import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { FinanceController } from "./finance.controller";
import { FinanceService } from "./finance.service";
import { ExpenseWorkflowService } from "./expense-workflow.service";
import { FinanceQueryService } from "./finance-query.service";
import { ReimbursementWorkflowService } from "./reimbursement-workflow.service";
import { UsersModule } from "../users/users.module";
import { FinanceAttachmentService } from "./finance-attachment.service";

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [FinanceController],
  providers: [FinanceService, ExpenseWorkflowService, FinanceQueryService, ReimbursementWorkflowService, FinanceAttachmentService],
  exports: [FinanceService, ExpenseWorkflowService, FinanceQueryService, ReimbursementWorkflowService, FinanceAttachmentService]
})
export class FinanceModule {}
