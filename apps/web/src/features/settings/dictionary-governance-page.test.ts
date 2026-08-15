import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const page = readFileSync("app/settings/dictionaries/page.tsx", "utf8");

test("dictionary settings page consumes one governance API seam", () => {
  assert.match(page, /dictionaryGovernanceApi/);
  assert.doesNotMatch(page, /dictionaryApi|dictionaryTemplateApi/);
  assert.doesNotMatch(page, /fetchRange|globalOffset|templateOffset/);
});

test("dictionary settings page keeps source kind for rendering only", () => {
  assert.match(page, /selected\.kind/);
  assert.doesNotMatch(page, /selected\.kind === "template" \? await/);
});
