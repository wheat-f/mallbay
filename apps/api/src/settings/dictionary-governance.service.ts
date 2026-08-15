import { BadRequestException, Injectable } from "@nestjs/common";
import { DictionaryStatus } from "@prisma/client";
import type { AuthenticatedSettingsUser } from "./dictionaries.service";
import { DictionariesService } from "./dictionaries.service";
import { DictionaryTemplatesService } from "./dictionary-templates.service";
import { DictionaryCatalogQueryDto, DictionaryItemsQueryDto } from "./dto/dictionary.dto";
import { CreateDictionaryItemDto, UpdateDictionaryItemDto } from "./dto/dictionary.dto";
import { CreateDictionaryTemplateItemDto, UpdateDictionaryTemplateItemDto } from "./dto/dictionary-template.dto";
import { normalizePagination } from "../common/pagination";

export type DictionaryGovernanceKind = "dictionary" | "template";
export type DictionaryGovernanceItemInput = {
  code: string;
  name: string;
  sortOrder?: number;
  parentId?: string | null;
  status?: DictionaryStatus;
};

type CatalogEntry = {
  id: string;
  name: string;
  code: string;
  [key: string]: unknown;
};

type CatalogPage = {
  items: CatalogEntry[];
  total: number;
  page: number;
  pageSize: number;
};

/**
 * The external dictionary governance seam. STORE and HQ_TEMPLATE remain
 * internal adapters; callers never need to know which persistence model owns
 * a directory or item.
 */
@Injectable()
export class DictionaryGovernanceService {
  constructor(
    private readonly dictionaries: DictionariesService,
    private readonly templates: DictionaryTemplatesService,
  ) {}

  private assertKind(kind: string): asserts kind is DictionaryGovernanceKind {
    if (kind !== "dictionary" && kind !== "template") {
      throw new BadRequestException("不支持的字典来源");
    }
  }

  private async collectCatalog(
    load: (page: number) => Promise<CatalogPage>,
  ): Promise<CatalogEntry[]> {
    const pageSize = 100;
    const first = await load(1);
    const rows = [...first.items];
    const pages = Math.ceil(first.total / pageSize);
    for (let page = 2; page <= pages; page += 1) {
      const next = await load(page);
      rows.push(...next.items);
    }
    return rows;
  }

  async catalog(user: AuthenticatedSettingsUser, query: DictionaryCatalogQueryDto, storeId?: string) {
    const { page, pageSize, skip } = normalizePagination(query.page, query.pageSize);
    const [storeRows, templateRows] = await Promise.all([
      this.collectCatalog((sourcePage) => this.dictionaries.catalog(user, { ...query, page: sourcePage, pageSize: 100 }, storeId) as Promise<CatalogPage>),
      this.collectCatalog((sourcePage) => this.templates.catalog(user, { ...query, page: sourcePage, pageSize: 100 }) as Promise<CatalogPage>),
    ]);
    const items = [
      ...storeRows.map((item) => ({ ...item, kind: "dictionary" as const, readOnly: false, inherited: false })),
      ...templateRows.map((item) => ({ ...item, kind: "template" as const, readOnly: !user.isAuditor, inherited: !user.isAuditor })),
    ].sort((left, right) => {
      // Sort by the stable business key first so page boundaries do not move
      // when HQ and store adapters use different display names for one code.
      const code = String(left.code).localeCompare(String(right.code));
      if (code !== 0) return code;
      const source = String(left.kind).localeCompare(String(right.kind));
      if (source !== 0) return source;
      const name = String(left.name).localeCompare(String(right.name));
      return name !== 0 ? name : String(left.id).localeCompare(String(right.id));
    });
    return { items: items.slice(skip, skip + pageSize), total: items.length, page, pageSize };
  }

  async listItems(user: AuthenticatedSettingsUser, kind: string, id: string, query: DictionaryItemsQueryDto) {
    this.assertKind(kind);
    if (kind === "dictionary") return this.dictionaries.listItems(user, id, query);
    return this.templates.listItems(user, id, query);
  }

  async previewImport(user: AuthenticatedSettingsUser, kind: string, id: string, items: DictionaryGovernanceItemInput[]) {
    this.assertKind(kind);
    if (kind === "dictionary") return this.dictionaries.previewImportItems(user, id, items);
    return this.templates.previewImportItems(user, id, items);
  }

  async commitImport(user: AuthenticatedSettingsUser, kind: string, id: string, items: DictionaryGovernanceItemInput[], version?: number) {
    this.assertKind(kind);
    if (kind === "dictionary") return this.dictionaries.commitImportItems(user, id, items, version);
    return this.templates.commitImportItems(user, id, items, version);
  }

  async createItem(user: AuthenticatedSettingsUser, kind: string, id: string, input: CreateDictionaryItemDto | CreateDictionaryTemplateItemDto) {
    this.assertKind(kind);
    if (kind === "dictionary") return this.dictionaries.createItem(user, id, input as CreateDictionaryItemDto);
    return this.templates.createItem(user, id, input as CreateDictionaryTemplateItemDto);
  }

  async updateItem(user: AuthenticatedSettingsUser, kind: string, itemId: string, input: UpdateDictionaryItemDto | UpdateDictionaryTemplateItemDto | Record<string, unknown>) {
    this.assertKind(kind);
    if (kind === "dictionary") return this.dictionaries.updateItem(user, itemId, input as UpdateDictionaryItemDto);
    return this.templates.updateItem(user, itemId, input as UpdateDictionaryTemplateItemDto);
  }

  async setItemStatus(user: AuthenticatedSettingsUser, kind: string, itemId: string, status: DictionaryStatus, reason?: string, version?: number) {
    this.assertKind(kind);
    if (kind === "dictionary") return this.dictionaries.setItemStatus(user, itemId, status, reason, version);
    return this.templates.updateItemStatus(user, itemId, { status, reason, version });
  }

  async removeItem(user: AuthenticatedSettingsUser, kind: string, itemId: string, reason: string) {
    this.assertKind(kind);
    if (kind === "template") throw new BadRequestException("总部模板字典项不可删除");
    return this.dictionaries.removeItem(user, itemId, reason);
  }
}
