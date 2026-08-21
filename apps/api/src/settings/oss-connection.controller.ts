import { Body, Controller, Post, Req, UseGuards } from "@nestjs/common";
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
    return this.service.test(req.user, undefined, dto);
  }
}
