import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SettingsAccessService, type SettingsUser } from "./settings-access.service";

type AuthRequest = Request & { user: SettingsUser };

@UseGuards(JwtAuthGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly access: SettingsAccessService) {}

  @Get("capabilities")
  capabilities(@Req() req: AuthRequest) {
    return this.access.getCapabilities(req.user);
  }
  @Get("summary")
  summary(@Req() req: AuthRequest) {
    return this.access.getSummary(req.user);
  }
}
