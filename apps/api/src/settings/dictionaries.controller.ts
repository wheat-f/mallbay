import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { DictionaryStatus } from "@prisma/client";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateDictionaryDto, CreateDictionaryItemDto, SetDictionaryItemStatusDto, UpdateDictionaryDto, UpdateDictionaryItemDto } from "./dto/dictionary.dto";
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

  @Get(":id/items")
  listItems(@Req() req: AuthRequest, @Param("id") id: string) { return this.dictionaries.listItems(req.user, id); }

  @Post(":id/items")
  createItem(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CreateDictionaryItemDto) { return this.dictionaries.createItem(req.user, id, dto); }

  @Patch("items/:itemId")
  updateItem(@Req() req: AuthRequest, @Param("itemId") itemId: string, @Body() dto: UpdateDictionaryItemDto) { return this.dictionaries.updateItem(req.user, itemId, dto); }

  @Patch("items/:itemId/status")
  setItemStatus(@Req() req: AuthRequest, @Param("itemId") itemId: string, @Body() body: SetDictionaryItemStatusDto) { return this.dictionaries.setItemStatus(req.user, itemId, body.status, body.reason); }

  @Delete("items/:itemId")
  removeItem(@Req() req: AuthRequest, @Param("itemId") itemId: string) { return this.dictionaries.removeItem(req.user, itemId); }

  @Patch(":id")
  update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateDictionaryDto) { return this.dictionaries.update(req.user, id, dto); }

  @Delete(":id")
  remove(@Req() req: AuthRequest, @Param("id") id: string) { return this.dictionaries.remove(req.user, id); }
}