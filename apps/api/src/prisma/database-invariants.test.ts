import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  checkDatabaseInvariants,
  formatDatabaseInvariantViolations
} from "./database-invariants";

test("checkDatabaseInvariants reports duplicate cover and pending submission risks", async () => {
  const queries: string[] = [];
  const prisma = {
    $queryRawUnsafe: async (query: string) => {
      queries.push(query);
      if (query.includes('"StorePhoto"')) {
        return [{ storeId: "store-1", count: 2 }];
      }
      if (query.includes('"StoreAuditSubmission"')) {
        return [{ storeId: "store-2", count: 3 }];
      }
      if (query.includes('"StoreSubmissionPhoto"')) {
        return [{ submissionId: "submission-1", count: 2 }];
      }
      return [];
    }
  };

  const violations = await checkDatabaseInvariants(prisma);

  assert.equal(queries.length, 3);
  assert.deepEqual(violations, [
    {
      invariant: "store_photo_single_cover",
      message: "同一门店最多只能有一张对外展示封面图",
      rows: [{ storeId: "store-1", count: 2 }]
    },
    {
      invariant: "store_audit_submission_single_pending",
      message: "同一门店同一时间最多只能有一条待审核提交",
      rows: [{ storeId: "store-2", count: 3 }]
    },
    {
      invariant: "store_submission_photo_single_cover",
      message: "同一送审提交最多只能有一张封面图",
      rows: [{ submissionId: "submission-1", count: 2 }]
    }
  ]);
});

test("formatDatabaseInvariantViolations produces deploy-safe failure output", () => {
  const message = formatDatabaseInvariantViolations([
    {
      invariant: "store_photo_single_cover",
      message: "同一门店最多只能有一张对外展示封面图",
      rows: [{ storeId: "store-1", count: 2 }]
    }
  ]);

  assert.match(message, /数据库不变量预检失败/);
  assert.match(message, /store_photo_single_cover/);
  assert.match(message, /store-1/);
});

test("phase one schema exposes customer order and payment models", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

  for (const model of [
    "model Customer ",
    "model CustomerVehicle ",
    "model Product ",
    "model Order ",
    "model OrderItem ",
    "model OrderAmount ",
    "model PaymentAccount ",
    "model OrderPayment "
  ]) {
    assert.ok(schema.includes(model), `${model.trim()} is missing`);
  }

  for (const enumName of [
    "enum CustomerType",
    "enum ProductCategory",
    "enum ConstructionType",
    "enum OrderStatus",
    "enum PaymentType"
  ]) {
    assert.ok(schema.includes(enumName), `${enumName} is missing`);
  }

  assert.ok(schema.includes("amountCents"), "money fields must use integer cents");
  assert.ok(schema.includes("phoneHash"), "customer phone search must use a hash field");
  assert.ok(schema.includes("vinHash"), "VIN search must use a hash field");
});

test("phase two schema exposes construction capacity assignment and record models", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

  for (const model of [
    "model DailyCapacity ",
    "model ConstructionWorkerProfile ",
    "model ConstructionAssignment ",
    "model ConstructionRecord ",
    "model ConstructionPhoto ",
    "model LeaveRequest ",
    "model Schedule ",
    "model WorkerCommissionSnapshot "
  ]) {
    assert.ok(schema.includes(model), `${model.trim()} is missing`);
  }

  for (const enumName of [
    "enum ConstructionTaskStatus",
    "enum ConstructionPhotoStage",
    "enum QualityCheckResult",
    "enum WorkerSkillTag"
  ]) {
    assert.ok(schema.includes(enumName), `${enumName} is missing`);
  }

  assert.ok(schema.includes("@@unique([storeId, date])"), "DailyCapacity must be unique per store date");
  assert.ok(schema.includes("@@unique([orderId, workerUserId])"), "assignment must prevent duplicate workers");
  assert.match(schema, /orderId\s+String\s+@unique/, "ConstructionRecord must be unique per order");
});

test("phase three schema exposes inventory purchase and warranty models", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

  for (const model of [
    "model InventoryBatch ",
    "model InventoryMovement ",
    "model PurchaseOrder ",
    "model PurchaseOrderItem ",
    "model Warranty ",
    "model WarrantyPhoto "
  ]) {
    assert.ok(schema.includes(model), `${model.trim()} is missing`);
  }

  for (const enumName of [
    "enum InventoryMovementType",
    "enum PurchaseOrderStatus",
    "enum WarrantyStatus"
  ]) {
    assert.ok(schema.includes(enumName), `${enumName} is missing`);
  }

  assert.ok(schema.includes("@@unique([storeId, productId, batchNo])"), "batch number must be unique per store product");
  assert.match(schema, /orderId\s+String\s+@unique/, "Warranty must be unique per order");
  assert.match(schema, /warrantyNo\s+String\s+@unique/, "Warranty number must be globally unique");
});

test("phase four schema exposes after-sales penalty and commission models", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

  for (const model of [
    "model AfterSale ",
    "model AfterSaleAssignment ",
    "model Penalty ",
    "model SalesCommissionRule ",
    "model SalesCommissionLog ",
    "model WorkerCommission "
  ]) {
    assert.ok(schema.includes(model), `${model.trim()} is missing`);
  }

  for (const enumName of [
    "enum AfterSaleStatus",
    "enum AfterSaleResponsibility",
    "enum CommissionRuleType"
  ]) {
    assert.ok(schema.includes(enumName), `${enumName} is missing`);
  }

  assert.ok(schema.includes("@@unique([afterSaleId, workerUserId])"), "after-sale assignment must prevent duplicate workers");
  assert.match(schema, /orderId\s+String\s+@unique/, "sales commission snapshot must be unique per order");
  assert.ok(schema.includes("@@unique([orderId, workerUserId])"), "worker commission must be unique per order worker");
});

test("phase five schema exposes finance invoice rebate and report source models", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

  for (const model of [
    "model ExpenseApplication ",
    "model ReimbursementApplication ",
    "model PaymentRecord ",
    "model Invoice ",
    "model InvoiceLog ",
    "model CustomerRebate ",
    "model RebateLog "
  ]) {
    assert.ok(schema.includes(model), `${model.trim()} is missing`);
  }

  for (const enumName of [
    "enum FinanceApprovalStatus",
    "enum PaymentRecordType",
    "enum InvoiceStatus",
    "enum RebateStatus"
  ]) {
    assert.ok(schema.includes(enumName), `${enumName} is missing`);
  }

  assert.match(schema, /invoiceNo\s+String\?\s+@unique/, "invoice number must be unique when issued");
  assert.ok(schema.includes("@@index([storeId, status])"), "phase five workflow tables must be scoped by store and status");
  assert.ok(schema.includes("amountCents"), "phase five money fields must use integer cents");
});
