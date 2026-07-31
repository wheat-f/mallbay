import { Body, Controller, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedSettingsUser } from "./dictionaries.service";
import { DictionaryTemplatesService } from "./dictionary-templates.service";
import { CreateDictionaryTemplateDto, CreateDictionaryTemplateItemDto, SetDictionaryTemplateItemStatusDto, UpdateDictionaryTemplateDto, UpdateDictionaryTemplateItemDto } from "./dto/dictionary-template.dto";
import { DictionaryCatalogQueryDto, DictionaryItemsQueryDto, ImportDictionaryItemsDto } from "./dto/dictionary.dto";

type AuthRequest = Request & { user: AuthenticatedSettingsUser };

@UseGuards(JwtAuthGuard)
@Controller("settings/dictionary-templates")
export class DictionaryTemplatesController {
  constructor(private readonly templates: DictionaryTemplatesService) {}

  @Get()
  list(@Req() req: AuthRequest) { return this.templates.list(req.user); }

  @Get("catalog")
  catalog(@Req() req: AuthRequest, @Query() query: DictionaryCatalogQueryDto) { return this.templates.catalog(req.user, query); }

  @Get(":id/items")
  listItems(@Req() req: AuthRequest, @Param("id") id: string, @Query() query: DictionaryItemsQueryDto) { return this.templates.listItems(req.user, id, query); }
  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateDictionaryTemplateDto) { return this.templates.create(req.user, dto); }

  @Patch(":id")
  update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateDictionaryTemplateDto) { return this.templates.update(req.user, id, dto); }

  @Post(":id/items/import/preview")
  previewImport(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ImportDictionaryItemsDto) { return this.templates.previewImportItems(req.user, id, dto.items); }

  @Post(":id/items/import/commit")
  commitImport(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: ImportDictionaryItemsDto) { return this.templates.commitImportItems(req.user, id, dto.items, dto.version); }
  @Post(":id/items")
  createItem(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: CreateDictionaryTemplateItemDto) { return this.templates.createItem(req.user, id, dto); }

  @Patch("items/:itemId")
  updateItem(@Req() req: AuthRequest, @Param("itemId") itemId: string, @Body() dto: UpdateDictionaryTemplateItemDto) { return this.templates.updateItem(req.user, itemId, dto); }

  @Patch("items/:itemId/status")
  updateItemStatus(@Req() req: AuthRequest, @Param("itemId") itemId: string, @Body() dto: SetDictionaryTemplateItemStatusDto) { return this.templates.updateItemStatus(req.user, itemId, dto); }
}