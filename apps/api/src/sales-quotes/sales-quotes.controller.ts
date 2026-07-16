/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { PricingAuthenticatedUser } from "../pricing/pricing.service";
import { CreateSalesQuoteDto, ListSalesQuotesDto, RecalculateSalesQuoteDto, ReviewSalesQuoteDto, SubmitSalesQuoteDto, WithdrawSalesQuoteDto } from "./dto/sales-quote.dto";
import { SalesQuotesService } from "./sales-quotes.service";

type AuthRequest = Request & { user: PricingAuthenticatedUser };

@UseGuards(JwtAuthGuard)
@Controller("sales-quotes")
export class SalesQuotesController {
  constructor(private readonly quotes: SalesQuotesService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateSalesQuoteDto) {
    return this.quotes.create(req.user, dto);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListSalesQuotesDto) {
    return this.quotes.list(req.user, query);
  }

  @Get(":id")
  get(@Req() req: AuthRequest, @Param("id") id: string, @Query("storeId") storeId: string) {
    return this.quotes.get(req.user, id, storeId);
  }

  @Post(":id/submit")
  submit(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: SubmitSalesQuoteDto) {
    return this.quotes.submit(req.user, id, dto);
  }

  @Post(":id/approve")
  approve(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReviewSalesQuoteDto) {
    return this.quotes.review(req.user, id, true, dto);
  }

  @Post(":id/reject")
  reject(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReviewSalesQuoteDto) {
    return this.quotes.review(req.user, id, false, dto);
  }

  @Post(":id/withdraw")
  withdraw(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: WithdrawSalesQuoteDto) {
    return this.quotes.withdraw(req.user, id, dto);
  }

  @Post(":id/recalculate")
  recalculate(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: RecalculateSalesQuoteDto) {
    return this.quotes.recalculate(req.user, id, dto);
  }

  @Post(":id/convert-to-order")
  convertToOrder(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.quotes.convertToOrder(req.user, id);
  }
}
