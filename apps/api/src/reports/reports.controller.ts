/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OperationalReportQueryDto, ReportQueryDto } from "./dto/reports.dto";
import { ReportsService, type AuthenticatedReportUser } from "./reports.service";
import { AccessContext } from "../permissions/domain/access-context";

type AuthRequest = Request & { user: AuthenticatedReportUser };

@UseGuards(JwtAuthGuard)
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService, private readonly access: AccessContext) {}

  private authorize(req: AuthRequest, storeId?: string) {
    return storeId
      ? this.access.require(req.user.id, "reports", "read", { storeId })
      : Promise.resolve();
  }

  @Get("summary")
  summary(@Req() req: AuthRequest, @Query() query: ReportQueryDto) {
    return this.authorize(req, query.storeId).then(() => this.reports.summary(req.user, query));
  }

  /**
   * A purpose-built operational data set for the six business reports.  The
   * legacy summary endpoint is intentionally left untouched because it also
   * powers the workbench cards.
   */
  @Get("operational")
  operational(@Req() req: AuthRequest, @Query() query: OperationalReportQueryDto) {
    return this.authorize(req, query.storeId).then(() => this.reports.operational(req.user, query));
  }

  @Get("filter-options")
  filterOptions(@Req() req: AuthRequest, @Query() query: ReportQueryDto) {
    return this.authorize(req, query.storeId).then(() => this.reports.filterOptions(req.user, query));
  }
}
