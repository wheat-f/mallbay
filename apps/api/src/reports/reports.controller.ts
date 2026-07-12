/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ReportQueryDto } from "./dto/reports.dto";
import { ReportsService, type AuthenticatedReportUser } from "./reports.service";

type AuthRequest = Request & { user: AuthenticatedReportUser };

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("summary")
  summary(@Req() req: AuthRequest, @Query() query: ReportQueryDto) {
    return this.reports.summary(req.user, query);
  }
}
