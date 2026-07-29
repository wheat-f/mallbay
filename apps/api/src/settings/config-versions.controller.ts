import { Body, Controller, Get, Param, Patch, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { createHash } from "crypto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ConfigVersionsService } from "./config-versions.service";
import { CreateConfigVersionDto, UpdateConfigVersionDto, WithdrawConfigVersionDto } from "./dto/config-version.dto";
import type { SettingsUser } from "./settings-access.service";
type AuthRequest = Request & { user: SettingsUser };
@UseGuards(JwtAuthGuard)
@Controller("settings/config-versions")
export class ConfigVersionsController {
  constructor(private readonly versions: ConfigVersionsService) {}
  @Get()
  async list(@Req() req: AuthRequest, @Res({ passthrough: true }) res: Response, @Query("capabilityCode") capabilityCode?: string, @Query("scopeId") scopeId?: string, @Query("page") page?: string, @Query("pageSize") pageSize?: string) {
    const rows = await this.versions.list(req.user, capabilityCode, scopeId, Number(page ?? 1), Number(pageSize ?? 20));
    const etag = `"${createHash("sha256").update(JSON.stringify(rows)).digest("hex")}"`;
    res.setHeader("ETag", etag);
    if (req.headers["if-none-match"] === etag) { res.statusCode = 304; return null; }
    return rows;
  }
  @Post() create(@Req() req: AuthRequest, @Body() dto: CreateConfigVersionDto) { const requestId = req.headers["x-request-id"]; return this.versions.create(req.user, { ...dto, requestId: typeof requestId === "string" ? requestId : dto.requestId }); }
  @Patch(":id") update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateConfigVersionDto) { const requestId = req.headers["x-request-id"]; return this.versions.update(req.user, id, { ...dto, requestId: typeof requestId === "string" ? requestId : dto.requestId }); }
  @Post(":id/validate") validate(@Req() req: AuthRequest, @Param("id") id: string) { const requestId = req.headers["x-request-id"]; return this.versions.validate(req.user, id, typeof requestId === "string" ? requestId : undefined); }
  @Post(":id/clone") clone(@Req() req: AuthRequest, @Param("id") id: string) { return this.versions.clone(req.user, id); }
  @Post(":id/publish") publish(@Req() req: AuthRequest, @Param("id") id: string) { const requestId = req.headers["x-request-id"]; return this.versions.publish(req.user, id, typeof requestId === "string" ? requestId : undefined); }
  @Post(":id/withdraw") withdraw(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: WithdrawConfigVersionDto) { const requestId = req.headers["x-request-id"]; return this.versions.withdraw(req.user, id, dto.reason, typeof requestId === "string" ? requestId : undefined); }
}
