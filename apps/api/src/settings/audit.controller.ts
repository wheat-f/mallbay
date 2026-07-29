import { Controller, Get, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SettingsAuditService } from "./audit.service";
import type { SettingsUser } from "./settings-access.service";
type AuthRequest = Request & { user: SettingsUser };
@UseGuards(JwtAuthGuard)
@Controller("settings/audit")
export class SettingsAuditController {
  constructor(private readonly audit: SettingsAuditService) {}
  @Get() list(@Req() req: AuthRequest, @Query() query: { action?: string; from?: string; to?: string; limit?: string; offset?: string; page?: string; pageSize?: string; domain?: string }) { return this.audit.list(req.user, { ...query, limit: query.limit ? Number(query.limit) : undefined, offset: query.offset ? Number(query.offset) : undefined, page: query.page ? Number(query.page) : undefined, pageSize: query.pageSize ? Number(query.pageSize) : undefined }); }
  @Get("export") export(@Req() req: AuthRequest, @Query() query: { action?: string; from?: string; to?: string; domain?: string }) { return this.audit.export(req.user, query); }
}