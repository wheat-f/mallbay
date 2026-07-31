import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { DictionaryStatus } from "@prisma/client";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CreateDictionaryDto, CreateDictionaryItemDto, ImportDictionaryItemsDto, SetDictionaryItemStatusDto, UpdateDictionaryDto, UpdateDictionaryItemDto, DeleteDictionaryItemDto, DisableDictionaryDto, DictionaryCatalogQueryDto, DictionaryItemsQueryDto } from "./dto/dictionary.dto";
import { DictionariesService, type AuthenticatedSettingsUser } from "./dictionaries.service";

type AuthRequest = Request & { user: AuthenticatedSettingsUser };

@UseGuards(JwtAuthGuard)
@Controller("settings/dictionaries")
export class DictionariesController {
  constructor(private readonly dictionaries: DictionariesService) {}

  @Get()
  list(@Req() req: AuthRequest, @Query("storeId") storeId?: string) { return this.dictionaries.list(req.user, storeId); }

  @Get("defaults/backfill/preview")
  previewDefaultBackfill(@Req() req: AuthRequest, @Query("storeId") storeId: string) { return this.dictionaries.previewDefaultBackfill(req.user, storeId); }

  @Post("defaults/backfill")
  backfillDefaults(@Req() req: AuthRequest, @Body("storeId") storeId: string) { return this.dictionaries.backfillDefaults(req.user, storeId); }

  @Get("catalog")
  catalog(@Req() req: AuthRequest, @Query() query: DictionaryCatalogQueryDto, @Query("storeId") storeId?: string) { return this.dictionaries.catalog(req.user, query, storeId); }
  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateDictionaryDto) { return this.dictionaries.create(req.user, dto); }

  @Get(":id/items")
  listItems(@Req() req: AuthRequest, @Param("id") id: string, @Query() query: DictionaryItemsQueryDto) { return this.dictionaries.listItems(req.user, id, query); }

  @Post(":id/items/import/preview")
  previewImport(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ImportDictionaryItemsDto) { return this.dictionaries.previewImportItems(req.user, id, dto.items); }

  @Post(":id/items/import/commit")
  commitImport(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ImportDictionaryItemsDto) { return this.dictionaries.commitImportItems(req.user, id, dto.items, dto.version); }
  @Post(":id/items/import")
  importItems(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ImportDictionaryItemsDto) { return this.dictionaries.importItems(req.user, id, dto.items); }

  @Post(":id/items")
  createItem(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CreateDictionaryItemDto) { return this.dictionaries.createItem(req.user, id, dto); }

  @Patch("items/:itemId")
  updateItem(@Req() req: AuthRequest, @Param("itemId") itemId: string, @Body() dto: UpdateDictionaryItemDto) { return this.dictionaries.updateItem(req.user, itemId, dto); }

  @Patch("items/:itemId/status")
  setItemStatus(@Req() req: AuthRequest, @Param("itemId") itemId: string, @Body() body: SetDictionaryItemStatusDto) { return this.dictionaries.setItemStatus(req.user, itemId, body.status, body.reason, body.version); }

  @Delete("items/:itemId")
  removeItem(@Req() req: AuthRequest, @Param("itemId") itemId: string, @Body() dto: DeleteDictionaryItemDto) { return this.dictionaries.removeItem(req.user, itemId, dto.reason); }

  @Patch(":id")
  update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateDictionaryDto) { return this.dictionaries.update(req.user, id, dto); }

  @Delete(":id")
  remove(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: DisableDictionaryDto) { return this.dictionaries.remove(req.user, id, dto.reason); }
}