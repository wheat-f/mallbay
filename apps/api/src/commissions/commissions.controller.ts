/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CommissionsService, type AuthenticatedCommissionUser } from "./commissions.service";
import { CreateSalesCommissionRuleDto, GenerateWorkerCommissionsDto, ListCommissionRulesDto } from "./dto/commissions.dto";

type AuthRequest = Request & {
  user: AuthenticatedCommissionUser;
};

@UseGuards(JwtAuthGuard)
@Controller("commissions")
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get("sales-rules")
  listRules(@Req() req: AuthRequest, @Query() query: ListCommissionRulesDto) {
    return this.commissions.listSalesRules(req.user, query);
  }

  @Post("sales-rules")
  createRule(@Req() req: AuthRequest, @Body() dto: CreateSalesCommissionRuleDto) {
    return this.commissions.createSalesRule(req.user, dto);
  }

  @Post("orders/:orderId/sales")
  generateSales(@Req() req: AuthRequest, @Param("orderId") orderId: string) {
    return this.commissions.generateSalesCommission(req.user, orderId);
  }

  @Post("records/:recordId/workers")
  generateWorkers(@Req() req: AuthRequest, @Param("recordId") recordId: string, @Body() dto: GenerateWorkerCommissionsDto) {
    return this.commissions.generateWorkerCommissions(req.user, recordId, dto);
  }
}
