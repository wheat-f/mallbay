import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const schemaPath = resolve(__dirname, "../../prisma/schema.prisma");
const schema = readFileSync(schemaPath, "utf8");

test("finance workflow schema keeps auditable application and payment fields", () => {
  assert.match(schema, /applicationNo\s+String\s+@unique/);
  assert.match(schema, /currentNode\s+FinanceApprovalNode\?/);
  assert.match(schema, /submittedAt\s+DateTime\?/);
  assert.match(schema, /direction\s+PaymentDirection/);
  assert.match(schema, /occurredAt\s+DateTime\s+@default\(now\(\)\)/);
  assert.match(schema, /model FinanceApprovalRecord\s*\{/);
  assert.match(schema, /model FinanceAttachment\s*\{/);
});

test("finance workflow schema defines explicit node, action, attachment and cash direction enums", () => {
  for (const enumName of [
    "PaymentDirection",
    "FinanceApplicationType",
    "FinanceApprovalNode",
    "FinanceApprovalAction",
    "FinanceAttachmentCategory"
  ]) {
    assert.match(schema, new RegExp(`enum ${enumName}\\s*\\{`));
  }

  assert.match(schema, /enum FinanceApprovalNode[\s\S]*MANAGER_REVIEW[\s\S]*FINANCE_REVIEW[\s\S]*PAYMENT/);
  assert.match(schema, /enum FinanceApprovalAction[\s\S]*SUBMITTED[\s\S]*APPROVED[\s\S]*REJECTED[\s\S]*WITHDRAWN[\s\S]*RESUBMITTED[\s\S]*PAID/);
});
