/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ApplyInvoiceDto, InvoiceActionDto, IssueInvoiceDto, ListInvoicesDto, SendInvoiceDto } from "./dto/invoice.dto";
import { INVOICE_WORKFLOW, type InvoiceWorkflow } from "./domain/invoice-workflow";
import type { AuthenticatedInvoiceUser } from "./invoices.service";
import { FinancialDocumentQuery } from "../finance/domain/financial-document-query";

type AuthRequest = Request & { user: AuthenticatedInvoiceUser };

@UseGuards(JwtAuthGuard)
@Controller("invoices")
export class InvoicesController {
  constructor(@Inject(INVOICE_WORKFLOW) private readonly workflow: InvoiceWorkflow, private readonly documents: FinancialDocumentQuery) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListInvoicesDto) {
    return this.documents.listInvoices(req.user, query);
  }

  @Post()
  apply(@Req() req: AuthRequest, @Body() dto: ApplyInvoiceDto) {
    return this.workflow.apply(req.user, dto);
  }

  @Post(":id/issue")
  issue(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: IssueInvoiceDto) {
    return this.workflow.issue(req.user, id, dto);
  }

  @Post(":id/void")
  void(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: InvoiceActionDto) {
    return this.workflow.void(req.user, id, dto);
  }

  @Post(":id/reissue")
  reissue(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: IssueInvoiceDto) {
    return this.workflow.reissue(req.user, id, dto);
  }

  @Post(":id/send")
  send(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: SendInvoiceDto) {
    return this.workflow.send(req.user, id, dto);
  }
}
