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
  CustomerSettlementsService,
  type AuthenticatedSettlementUser
} from "./customer-settlements.service";

type AuthRequest = Request & { user: AuthenticatedSettlementUser };

@UseGuards(JwtAuthGuard)
@Controller("customer-statements")
export class CustomerStatementsController {
  constructor(private readonly settlements: CustomerSettlementsService) {}

  @Get("candidate-orders")
  listCandidateOrders(
    @Req() req: AuthRequest,
    @Query() query: ListStatementCandidatesDto
  ) {
    return this.settlements.listStatementCandidates(req.user, query);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListCustomerStatementsDto) {
    return this.settlements.listStatements(req.user, query);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.settlements.getStatement(req.user, id);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateCustomerStatementDto) {
    return this.settlements.createStatement(req.user, dto);
  }

  @Post(":id/confirm")
  confirm(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.settlements.confirmStatement(req.user, id);
  }

  @Post(":id/void")
  void(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: StatementActionDto
  ) {
    return this.settlements.voidStatement(req.user, id, dto);
  }
}

@UseGuards(JwtAuthGuard)
@Controller("customer-receipts")
export class CustomerReceiptsController {
  constructor(private readonly settlements: CustomerSettlementsService) {}

  @Post("preview-allocation")
  preview(
    @Req() req: AuthRequest,
    @Body() dto: PreviewCustomerReceiptDto
  ) {
    return this.settlements.previewReceiptAllocation(req.user, dto);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListCustomerReceiptsDto) {
    return this.settlements.listReceipts(req.user, query);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.settlements.getReceipt(req.user, id);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateCustomerReceiptDto) {
    return this.settlements.createReceipt(req.user, dto);
  }

  @Post(":id/reverse")
  reverse(
    @Req() req: AuthRequest,
    @Param("id") id: string,
    @Body() dto: ReverseCustomerReceiptDto
  ) {
    return this.settlements.reverseReceipt(req.user, id, dto);
  }
}
