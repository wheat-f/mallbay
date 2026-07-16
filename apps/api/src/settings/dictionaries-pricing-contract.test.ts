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
