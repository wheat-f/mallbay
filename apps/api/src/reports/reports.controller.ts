/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Controller, Get, Query, Req, UseGuards, Inject } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OperationalReportQueryDto, ReportQueryDto } from "./dto/reports.dto";
import { type AuthenticatedReportUser } from "./reports.service";
import { OPERATIONAL_REPORT, type OperationalReport } from "./domain/operational-report";

type AuthRequest = Request & { user: AuthenticatedReportUser };

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ReportsController {
  constructor(@Inject(OPERATIONAL_REPORT) private readonly reports: OperationalReport) {}

  @Get("summary")
  summary(@Req() req: AuthRequest, @Query() query: ReportQueryDto) {
    return this.reports.summary(req.user, query);
  }

  /**
   * A purpose-built operational data set for the six business reports.  The
   * legacy summary endpoint is intentionally left untouched because it also
   * powers the workbench cards.
   */
  @Get("operational")
  operational(@Req() req: AuthRequest, @Query() query: OperationalReportQueryDto) {
    return this.reports.operational(req.user, query);
  }

  @Get("filter-options")
  filterOptions(@Req() req: AuthRequest, @Query() query: ReportQueryDto) {
    return this.reports.filterOptions(req.user, query);
  }
}
