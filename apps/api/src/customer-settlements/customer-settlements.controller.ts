/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import {
  CreateCustomerReceiptDto,
  CreateCustomerStatementDto,
  ListCustomerReceiptsDto,
  ListCustomerStatementsDto,
  ListStatementCandidatesDto,
  PreviewCustomerReceiptDto,
  ReverseCustomerReceiptDto,
  StatementActionDto
} from "./dto/customer-settlement.dto";
import {
  type AuthenticatedSettlementUser
} from "./customer-settlements.service";
import { SettlementView } from "./domain/settlement-view";
import { SettlementWorkflow } from "./domain/settlement-workflow";

type AuthRequest = Request & { user: AuthenticatedSettlementUser };

@UseGuards(JwtAuthGuard)
@Controller("customer-statements")
export class CustomerStatementsController {
  constructor(
    private readonly settlementView: SettlementView,
    private readonly workflow: SettlementWorkflow
  ) {}

  @Get("candidate-orders")
  listCandidateOrders(
    @Req() req: AuthRequest,
    @Query() query: ListStatementCandidatesDto
  ) {
    return this.settlementView.listCandidateOrders(req.user, query);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListCustomerStatementsDto) {
    return this.settlementView.getSettlementView(req.user, query);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.settlementView.getStatement(req.user, id);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateCustomerStatementDto) {
    return this.workflow.createStatement(req.user, dto);
  }

  @Post(":id/confirm")
  confirm(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.workflow.confirmStatement(req.user, id);
  }

  @Post(":id/void")
  void(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: StatementActionDto
  ) {
    return this.workflow.voidStatement(req.user, id, dto);
  }
}

@UseGuards(JwtAuthGuard)
@Controller("customer-receipts")
export class CustomerReceiptsController {
  constructor(
    private readonly settlementView: SettlementView,
    private readonly workflow: SettlementWorkflow
  ) {}

  @Post("preview-allocation")
  preview(
    @Req() req: AuthRequest,
    @Body() dto: PreviewCustomerReceiptDto
  ) {
    return this.workflow.previewReceipt(req.user, dto);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListCustomerReceiptsDto) {
    return this.settlementView.listReceipts(req.user, query);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.settlementView.getReceipt(req.user, id);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateCustomerReceiptDto) {
    return this.workflow.createReceipt(req.user, dto);
  }

  @Post(":id/reverse")
  reverse(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ReverseCustomerReceiptDto
  ) {
    return this.workflow.reverseReceipt(req.user, id, dto);
  }
}
