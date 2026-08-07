/* eslint-disable @typescript-eslint/consistent-type-imports */
import { Controller, Get, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { Public } from "../auth/decorators/public.decorator";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ListWarrantiesDto } from "./dto/warranty.dto";
import { WarrantiesService, type AuthenticatedWarrantyUser } from "./warranties.service";

type AuthRequest = Request & {
  user: AuthenticatedWarrantyUser;
};

@UseGuards(JwtAuthGuard)
@Controller("warranties")
export class WarrantiesController {
  constructor(private readonly warranties: WarrantiesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListWarrantiesDto) {
    return this.warranties.list(req.user, query);
  }

  @Public()
  @Get("lookup")
  lookup(@Query("no") warrantyNo: string) {
    return this.warranties.lookup(warrantyNo);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.warranties.detail(req.user, id);
  }
}
