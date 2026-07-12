/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateExpenseDto, CreateReimbursementDto, ListFinanceDto, ReviewFinanceDto } from "./dto/finance.dto";
import { FinanceService, type AuthenticatedFinanceUser } from "./finance.service";

type AuthRequest = Request & { user: AuthenticatedFinanceUser };

@UseGuards(JwtAuthGuard)
@Controller("finance")
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get("expenses")
  listExpenses(@Req() req: AuthRequest, @Query() query: ListFinanceDto) {
    return this.finance.listExpenses(req.user, query);
  }

  @Post("expenses")
  createExpense(@Req() req: AuthRequest, @Body() dto: CreateExpenseDto) {
    return this.finance.createExpense(req.user, dto);
  }

  @Get("reimbursements")
  listReimbursements(@Req() req: AuthRequest, @Query() query: ListFinanceDto) {
    return this.finance.listReimbursements(req.user, query);
  }

  @Post("reimbursements")
  createReimbursement(@Req() req: AuthRequest, @Body() dto: CreateReimbursementDto) {
    return this.finance.createReimbursement(req.user, dto);
  }

  @Post("reimbursements/:id/review")
  approveReimbursement(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReviewFinanceDto) {
    return this.finance.approveReimbursement(req.user, id, dto);
  }

  @Get("payment-records")
  listPaymentRecords(@Req() req: AuthRequest, @Query() query: ListFinanceDto) {
    return this.finance.listPaymentRecords(req.user, query);
  }
}
