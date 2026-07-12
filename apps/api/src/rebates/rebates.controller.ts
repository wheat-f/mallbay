/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ApplyRebateDto, ListRebatesDto, PayRebateDto, ReviewRebateDto } from "./dto/rebate.dto";
import { RebatesService, type AuthenticatedRebateUser } from "./rebates.service";

type AuthRequest = Request & { user: AuthenticatedRebateUser };

@UseGuards(JwtAuthGuard)
@Controller("rebates")
export class RebatesController {
  constructor(private readonly rebates: RebatesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListRebatesDto) {
    return this.rebates.list(req.user, query);
  }

  @Post()
  apply(@Req() req: AuthRequest, @Body() dto: ApplyRebateDto) {
    return this.rebates.apply(req.user, dto);
  }

  @Post(":id/review")
  approve(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ReviewRebateDto) {
    return this.rebates.approve(req.user, id, dto);
  }

  @Post(":id/pay")
  pay(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: PayRebateDto) {
    return this.rebates.pay(req.user, id, dto);
  }
}
