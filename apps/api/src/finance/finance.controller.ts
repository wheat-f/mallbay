/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { MulterFile } from "../users/multer-file.type";
import {
  CreateExpenseDto,
  CreateReimbursementDto,
  ListFinanceDto,
  PayReimbursementDto,
  ResubmitExpenseDto,
  ResubmitReimbursementDto,
  ReviewExpenseDto,
  ReviewReimbursementDto,
  UploadFinanceAttachmentDto,
  WithdrawFinanceDto,
} from "./dto/finance.dto";
import { ExpenseWorkflowService } from "./expense-workflow.service";
import { ReimbursementWorkflowService } from "./reimbursement-workflow.service";
import { FinanceAttachmentService } from "./finance-attachment.service";
import { FinancialDocumentQuery } from "./domain/financial-document-query";
import {
  FinanceService,
  type AuthenticatedFinanceUser,
} from "./finance.service";

type AuthRequest = Request & { user: AuthenticatedFinanceUser };

@UseGuards(JwtAuthGuard)
@Controller("finance")
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly expenseWorkflow: ExpenseWorkflowService,
    private readonly reimbursementWorkflow: ReimbursementWorkflowService,
    private readonly attachmentService: FinanceAttachmentService,
    private readonly financialDocument: FinancialDocumentQuery,
  ) {}

  @Get("expenses")
  listExpenses(@Req() req: AuthRequest, @Query() query: ListFinanceDto) {
    return this.financialDocument.listExpenses(req.user, query);
  }

  @Post("expenses")
  createExpense(@Req() req: AuthRequest, @Body() dto: CreateExpenseDto) {
    return this.expenseWorkflow.create(req.user, dto);
  }

  @Get("overview")
  getOverview(@Req() req: AuthRequest, @Query("storeId") storeId: string) {
    return this.financialDocument.getOverview(req.user, storeId);
  }

  @Get("expenses/:id")
  getExpense(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.financialDocument.getDocumentView(req.user, { kind: "expense", id });
  }

  @Post("expenses/:id/review")
  reviewExpense(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ReviewExpenseDto,
  ) {
    return this.expenseWorkflow.review(req.user, id, dto);
  }

  @Post("expenses/:id/withdraw")
  withdrawExpense(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: WithdrawFinanceDto,
  ) {
    return this.expenseWorkflow.withdraw(req.user, id, dto.note);
  }

  @Post("expenses/:id/resubmit")
  resubmitExpense(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ResubmitExpenseDto,
  ) {
    return this.expenseWorkflow.resubmit(req.user, id, dto);
  }

  @Get("reimbursements")
  listReimbursements(@Req() req: AuthRequest, @Query() query: ListFinanceDto) {
    return this.financialDocument.listReimbursements(req.user, query);
  }

  @Post("reimbursements")
  createReimbursement(
    @Req() req: AuthRequest,
    @Body() dto: CreateReimbursementDto,
  ) {
    return this.reimbursementWorkflow.create(req.user, dto);
  }

  @Get("reimbursements/:id")
  getReimbursement(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.financialDocument.getDocumentView(req.user, { kind: "reimbursement", id });
  }

  @Post("reimbursements/:id/review")
  reviewReimbursement(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ReviewReimbursementDto,
  ) {
    return this.reimbursementWorkflow.review(req.user, id, dto);
  }

  @Post("reimbursements/:id/withdraw")
  withdrawReimbursement(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: WithdrawFinanceDto,
  ) {
    return this.reimbursementWorkflow.withdraw(req.user, id, dto.note);
  }

  @Post("reimbursements/:id/resubmit")
  resubmitReimbursement(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ResubmitReimbursementDto,
  ) {
    return this.reimbursementWorkflow.resubmit(req.user, id, dto);
  }

  @Post("reimbursements/:id/pay")
  payReimbursement(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: PayReimbursementDto,
  ) {
    return this.reimbursementWorkflow.pay(req.user, id, dto);
  }

  @Post(":applicationType/:id/attachments")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 10 * 1024 * 1024 },
      fileFilter(_req, file, cb) {
        if (
          !file.mimetype.startsWith("image/") &&
          file.mimetype !== "application/pdf"
        )
          return cb(new BadRequestException("仅支持图片或 PDF 文件"), false);
        cb(null, true);
      },
    }),
  )
  uploadAttachment(
    @Req() req: AuthRequest,
    @Param("applicationType") applicationType: "expenses" | "reimbursements",
    @Param("id") id: string,
    @Body() dto: UploadFinanceAttachmentDto,
    @UploadedFile() file: MulterFile,
  ) {
    return this.attachmentService.upload(
      req.user,
      applicationType === "expenses" ? "EXPENSE" : "REIMBURSEMENT",
      id,
      dto,
      file,
    );
  }

  @Get("payment-records")
  listPaymentRecords(@Req() req: AuthRequest, @Query() query: ListFinanceDto) {
    return this.financialDocument.listCashFacts(req.user, query);
  }
}
