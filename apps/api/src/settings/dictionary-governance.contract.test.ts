import test from "node:test";
import assert from "node:assert/strict";
import { DictionaryGovernanceService } from "./dictionary-governance.service";

const user = { id: "hq-user", isAuditor: true, storeMember: undefined } as any;

test("DictionaryGovernanceService owns stable cross-source catalog pagination", async () => {
  const dictionaries = {
    catalog: async (_user: unknown, query: { page?: number }) => {
      const all = [
        { id: "store-z", name: "Z 门店字典", code: "Z", activeItemCount: 1, inactiveItemCount: 0 },
        { id: "store-a", name: "A 门店字典", code: "A", activeItemCount: 1, inactiveItemCount: 0 },
      ];
      return { items: query.page === 1 ? all : [], total: all.length, page: query.page ?? 1, pageSize: 100 };
    },
  };
  const templates = {
    catalog: async (_user: unknown, query: { page?: number }) => {
      const all = [{ id: "hq-a", name: "A 总部模板", code: "A", activeItemCount: 1, inactiveItemCount: 0 }];
      return { items: query.page === 1 ? all : [], total: all.length, page: query.page ?? 1, pageSize: 100 };
    },
  };
  const service = new DictionaryGovernanceService(dictionaries as any, templates as any);

  const first = await service.catalog(user, { page: 1, pageSize: 2 } as any, "store-1");
  const second = await service.catalog(user, { page: 2, pageSize: 2 } as any, "store-1");

  assert.deepEqual(first.items.map((item) => `${item.kind}:${item.code}`), ["dictionary:A", "template:A"]);
  assert.deepEqual(second.items.map((item) => `${item.kind}:${item.code}`), ["dictionary:Z"]);
  assert.equal(first.total, 3);
  assert.equal(first.items[0].readOnly, false);
  assert.equal(first.items[0].inherited, false);
});

test("DictionaryGovernanceService routes item commands through the source adapter", async () => {
  const calls: string[] = [];
  const dictionaries = {
    listItems: async () => { calls.push("store:list"); return { items: [], total: 0, page: 1, pageSize: 20, dictionaryVersion: 1, parent: null }; },
    previewImportItems: async () => { calls.push("store:preview"); return { dictionaryId: "d", dictionaryVersion: 1, canCommit: true, summary: { total: 0, create: 0, update: 0, error: 0 }, changes: [], errors: [] }; },
    commitImportItems: async () => { calls.push("store:commit"); return { created: [], updated: [], version: 2 }; },
    createItem: async () => { calls.push("store:create"); return {}; },
    updateItem: async () => { calls.push("store:update"); return {}; },
    setItemStatus: async () => { calls.push("store:status"); return {}; },
    removeItem: async () => { calls.push("store:remove"); return {}; },
  };
  const templates = {
    listItems: async () => { calls.push("hq:list"); return { items: [], total: 0, page: 1, pageSize: 20, dictionaryVersion: 1, parent: null }; },
    previewImportItems: async () => { calls.push("hq:preview"); return {}; },
    commitImportItems: async () => { calls.push("hq:commit"); return {}; },
    createItem: async () => { calls.push("hq:create"); return {}; },
    updateItem: async () => { calls.push("hq:update"); return {}; },
    updateItemStatus: async () => { calls.push("hq:status"); return {}; },
  };
  const service = new DictionaryGovernanceService(dictionaries as any, templates as any);

  await service.listItems(user, "dictionary", "d", {} as any);
  await service.listItems(user, "template", "t", {} as any);
  await service.previewImport(user, "dictionary", "d", []);
  await service.commitImport(user, "template", "t", [], 1);
  await service.createItem(user, "dictionary", "d", { code: "C", name: "C" });
  await service.updateItem(user, "template", "item", { name: "N" });
  await service.setItemStatus(user, "dictionary", "item", "ACTIVE" as any);
  await service.removeItem(user, "dictionary", "item", "reason");

  assert.deepEqual(calls, ["store:list", "hq:list", "store:preview", "hq:commit", "store:create", "hq:update", "store:status", "store:remove"]);
});
