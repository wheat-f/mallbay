import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { DictionaryStatus } from "@prisma/client";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import type { AuthenticatedSettingsUser } from "./dictionaries.service";
import { DictionaryGovernanceService } from "./dictionary-governance.service";
import { DeleteDictionaryItemDto, DictionaryCatalogQueryDto, DictionaryItemsQueryDto, CreateDictionaryItemDto, ImportDictionaryItemsDto, UpdateDictionaryItemDto } from "./dto/dictionary.dto";

type AuthRequest = Request & { user: AuthenticatedSettingsUser };

@UseGuards(JwtAuthGuard)
@Controller("settings/dictionary-governance")
export class DictionaryGovernanceController {
  constructor(private readonly governance: DictionaryGovernanceService) {}

  @Get("catalog")
  catalog(@Req() req: AuthRequest, @Query() query: DictionaryCatalogQueryDto, @Query("storeId") storeId?: string) {
    return this.governance.catalog(req.user, query, storeId);
  }

  @Get(":kind/:id/items")
  listItems(@Req() req: AuthRequest, @Param("kind") kind: string, @Param("id") id: string, @Query() query: DictionaryItemsQueryDto) {
    return this.governance.listItems(req.user, kind, id, query);
  }

  @Post(":kind/:id/items/import/preview")
  previewImport(@Req() req: AuthRequest, @Param("kind") kind: string, @Param("id") id: string, @Body() body: ImportDictionaryItemsDto) {
    return this.governance.previewImport(req.user, kind, id, body.items);
  }

  @Post(":kind/:id/items/import/commit")
  commitImport(@Req() req: AuthRequest, @Param("kind") kind: string, @Param("id") id: string, @Body() body: ImportDictionaryItemsDto) {
    return this.governance.commitImport(req.user, kind, id, body.items, body.version);
  }

  @Post(":kind/:id/items")
  createItem(@Req() req: AuthRequest, @Param("kind") kind: string, @Param("id") id: string, @Body() body: CreateDictionaryItemDto) {
    return this.governance.createItem(req.user, kind, id, body);
  }

  @Patch(":kind/items/:itemId")
  updateItem(@Req() req: AuthRequest, @Param("kind") kind: string, @Param("itemId") itemId: string, @Body() body: UpdateDictionaryItemDto) {
    return this.governance.updateItem(req.user, kind, itemId, body);
  }

  @Patch(":kind/items/:itemId/status")
  setItemStatus(@Req() req: AuthRequest, @Param("kind") kind: string, @Param("itemId") itemId: string, @Body() body: { status: DictionaryStatus; reason?: string; version?: number }) {
    return this.governance.setItemStatus(req.user, kind, itemId, body.status, body.reason, body.version);
  }

  @Delete(":kind/items/:itemId")
  removeItem(@Req() req: AuthRequest, @Param("kind") kind: string, @Param("itemId") itemId: string, @Body() body: DeleteDictionaryItemDto) {
    return this.governance.removeItem(req.user, kind, itemId, body.reason);
  }
}
