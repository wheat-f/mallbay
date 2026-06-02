/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ApplyInvoiceDto, InvoiceActionDto, IssueInvoiceDto, ListInvoicesDto } from "./dto/invoice.dto";
import { InvoicesService, type AuthenticatedInvoiceUser } from "./invoices.service";

type AuthRequest = Request & { user: AuthenticatedInvoiceUser };

@UseGuards(JwtAuthGuard)
@Controller("invoices")
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListInvoicesDto) {
    return this.invoices.list(req.user, query);
  }

  @Post()
  apply(@Req() req: AuthRequest, @Body() dto: ApplyInvoiceDto) {
    return this.invoices.apply(req.user, dto);
  }

  @Post(":id/issue")
  issue(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: IssueInvoiceDto) {
    return this.invoices.issue(req.user, id, dto);
  }

  @Post(":id/void")
  void(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: InvoiceActionDto) {
    return this.invoices.void(req.user, id, dto);
  }

  @Post(":id/reissue")
  reissue(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: IssueInvoiceDto) {
    return this.invoices.reissue(req.user, id, dto);
  }
}
