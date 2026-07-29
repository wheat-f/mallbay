import { Body, Controller, ForbiddenException, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { OssConnectionService } from "./oss-connection.service";
import type { SettingsUser } from "./settings-access.service";
import { TestOssConnectionDto } from "./dto/oss.dto";
type AuthRequest = Request & { user: SettingsUser };
@UseGuards(JwtAuthGuard)
@Controller("settings/oss")
export class OssConnectionController {
  constructor(private readonly service: OssConnectionService) {}
  @Post("test-connection") test(@Req() req: AuthRequest, @Body() dto: TestOssConnectionDto) {
    const scopeId = req.user.storeMember?.storeId;
    if (!scopeId) throw new ForbiddenException("未绑定门店");
    return this.service.test(req.user, scopeId, dto);
  }
}