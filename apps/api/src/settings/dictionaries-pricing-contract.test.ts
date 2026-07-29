import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("pricing dictionaries expose stable system codes for rule persistence", () => {
  const service = readFileSync("src/settings/dictionaries.service.ts", "utf8");
  assert.match(service, /code: "CONSTRUCTION_TYPE"[\s\S]*itemCodes: \["PPF", "COLOR_FILM", "HEAT_FILM", "MODIFICATION", "INSPECTION"\]/);
  assert.match(service, /code: "CONSTRUCTION_LOCATION"[\s\S]*itemCodes: \["IN_STORE", "OUTSIDE"\]/);
  assert.match(service, /code: "PRODUCT_CATEGORY"[\s\S]*itemCodes: \["PPF", "COLOR_FILM", "HEAT_FILM", "MODIFICATION", "OTHER"\]/);
  assert.match(service, /code: "PRODUCT_UNIT"[\s\S]*itemCodes: \["ROLL", "METER", "SQUARE_METER", "SQUARE_CENTIMETER", "PIECE"\]/);
  assert.match(service, /syncItems\(dictionary\.id, item\.items, FIXED_DICTIONARY_CODES\.has\(item\.code\), item\.itemCodes\)/);
});

test("dictionary dangerous operations enforce HQ disable and reasons", () => {
  const service = readFileSync("src/settings/dictionaries.service.ts", "utf8");
  assert.match(service, /item\.status === DictionaryStatus\.INACTIVE && dto\.status === DictionaryStatus\.ACTIVE/);
  assert.match(service, /总部已禁用项不可重新启用/);
  assert.match(service, /dto\.status === DictionaryStatus\.INACTIVE && !dto\.disabledReason\?\.trim\(\)/);
});

test("HQ dictionary templates are global and inherited as read-only store rows", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const service = readFileSync("src/settings/dictionaries.service.ts", "utf8");
  const templateService = readFileSync("src/settings/dictionary-templates.service.ts", "utf8");
  assert.match(schema, /model DictionaryTemplate \{/);
  assert.match(schema, /model DictionaryTemplateItem \{/);
  assert.match(templateService, /仅总部管理员可维护总部字典模板/);
  assert.match(service, /source: "HQ_TEMPLATE"/);
  assert.match(service, /template: \{ status: DictionaryStatus\.ACTIVE \}/);
  assert.match(service, /编码已存在，请更换编码/);
  assert.match(service, /recordFailure/);
});
test("parent dictionary disable requires a reason and records the reason", () => { const controller = readFileSync("src/settings/dictionaries.controller.ts", "utf8"); const dto = readFileSync("src/settings/dto/dictionary.dto.ts", "utf8"); const service = readFileSync("src/settings/dictionaries.service.ts", "utf8"); assert.match(controller, /DisableDictionaryDto/); assert.match(dto, /class DisableDictionaryDto/); assert.match(service, /停用字典必须填写原因/); assert.match(service, /reason: reason\.trim\(\)/); });