/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { AfterSalesService, type AuthenticatedAfterSalesUser } from "./after-sales.service";
import { AssignAfterSaleDto, CreateAfterSaleDto, JudgeAfterSaleDto, ListAfterSalesDto } from "./dto/after-sales.dto";

type AuthRequest = Request & {
  user: AuthenticatedAfterSalesUser;
};

@UseGuards(JwtAuthGuard)
@Controller("after-sales")
export class AfterSalesController {
  constructor(private readonly afterSales: AfterSalesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListAfterSalesDto) {
    return this.afterSales.list(req.user, query);
  }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateAfterSaleDto) {
    return this.afterSales.create(req.user, dto);
  }

  @Post(":id/assign")
  assign(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: AssignAfterSaleDto) {
    return this.afterSales.assign(req.user, id, dto);
  }

  @Post(":id/responsibility")
  judge(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: JudgeAfterSaleDto) {
    return this.afterSales.judgeResponsibility(req.user, id, dto);
  }
}
