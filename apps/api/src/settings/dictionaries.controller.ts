import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateDictionaryDto, UpdateDictionaryDto } from "./dto/dictionary.dto";
import { DictionariesService, type AuthenticatedSettingsUser } from "./dictionaries.service";

type AuthRequest = Request & { user: AuthenticatedSettingsUser };

@UseGuards(JwtAuthGuard)
@Controller("settings/dictionaries")
export class DictionariesController {
  constructor(private readonly dictionaries: DictionariesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query("storeId") storeId?: string) { return this.dictionaries.list(req.user, storeId); }

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateDictionaryDto) { return this.dictionaries.create(req.user, dto); }

  @Patch(":id")
  update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateDictionaryDto) { return this.dictionaries.update(req.user, id, dto); }

  @Delete(":id")
  remove(@Req() req: AuthRequest, @Param("id") id: string) { return this.dictionaries.remove(req.user, id); }
}