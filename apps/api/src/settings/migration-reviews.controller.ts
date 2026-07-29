import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { SettingsMigrationReviewsService } from "./migration-reviews.service";
import type { SettingsUser } from "./settings-access.service";
import { ResolveMigrationReviewDto } from "./dto/migration-review.dto";
type AuthRequest = Request & { user: SettingsUser };

@UseGuards(JwtAuthGuard)
@Controller("settings/migration-reviews")
export class SettingsMigrationReviewsController {
  constructor(private readonly reviews: SettingsMigrationReviewsService) {}
  @Get() list(@Req() req: AuthRequest, @Query("status") status?: string) { return this.reviews.list(req.user, status); }
  @Patch(":id") resolve(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ResolveMigrationReviewDto) { return this.reviews.resolve(req.user, id, dto); }
}