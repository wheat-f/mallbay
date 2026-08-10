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

  assert.equal(queries.length, 7);
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

test("checkDatabaseInvariants audits customer vehicle identity and ownership", async () => {
  const prisma = {
    $queryRawUnsafe: async (query: string) => {
      if (query.includes("customer_vehicle_unique_normalized_plate") || query.includes('AS "carPlateNormalized"')) {
        return [{ storeId: "store-1", carPlateNormalized: "京A12345", count: 2 }];
      }
      if (query.includes('vehicle."vinHash", COUNT(*)')) {
        return [{ storeId: "store-1", vinHash: "hash", count: 2 }];
      }
      if (query.includes("至少需要车牌") || query.includes('AND vehicle."vinHash" IS NULL')) {
        return [{ id: "vehicle-empty", customerId: "customer-1" }];
      }
      if (query.includes('orders."customerId" <> vehicle."customerId"')) {
        return [{ orderId: "order-1", vehicleId: "vehicle-2" }];
      }
      return [];
    }
  };

  const violations = await checkDatabaseInvariants(prisma);

  assert.deepEqual(
    violations.map((item) => item.invariant),
    [
      "customer_vehicle_unique_normalized_plate",
      "customer_vehicle_unique_vin",
      "customer_vehicle_has_identity",
      "order_vehicle_customer_consistency"
    ]
  );
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
    "model CustomerNote ",
    "model CustomerTag ",
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
    "enum CustomerNoteType",
    "enum ProductCategory",
    "enum ConstructionType",
    "enum OrderStatus",
    "enum PaymentType"
  ]) {
    assert.ok(schema.includes(enumName), `${enumName} is missing`);
  }

  assert.ok(schema.includes("CUSTOMER_SERVICE"), "StorePosition must include customer service for V1.7");
  assert.ok(schema.includes("amountCents"), "money fields must use integer cents");
  assert.match(schema, /suggestedLaborCostCents\s+Int\?/, "order amount must keep suggested labor snapshot");
  assert.match(schema, /laborCostAdjustmentReason\s+String\?/, "order amount must keep labor adjustment reason");
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
    "model ConstructionQualityHistory ",
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
  assert.ok(schema.includes("isRevoked"), "quality history must preserve revoked evidence state");
  assert.ok(schema.includes("@@index([recordId, checkedAt])"), "quality history must be chronologically queryable");
});

test("phase three schema exposes inventory purchase and warranty models", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

  for (const model of [
    "model InventoryBatch ",
    "model InventoryMovement ",
    "model OrderInventoryAllocation ",
    "model PurchaseRequirement ",
    "model PurchaseRequirementItem ",
    "model PurchaseOrder ",
    "model PurchaseOrderItem ",
    "model Supplier ",
    "model SupplierContact ",
    "model SupplierRatingHistory ",
    "model Warranty ",
    "model WarrantyPhoto "
  ]) {
    assert.ok(schema.includes(model), `${model.trim()} is missing`);
  }

  for (const enumName of [
    "enum InventoryMovementType",
    "enum InventoryAllocationStatus",
    "enum PurchaseRequirementStatus",
    "enum PurchaseOrderStatus",
    "enum WarrantyStatus"
  ]) {
    assert.ok(schema.includes(enumName), `${enumName} is missing`);
  }

  for (const field of [
    "inventoryUnit",
    "salesUnit",
    "rollWidthMeters",
    "rollLengthMeters",
    "metersPerRoll",
    "quantityPrecision"
  ]) {
    assert.ok(schema.includes(field), `Product inventory spec field ${field} is missing`);
  }

  assert.match(schema, /totalQuantity\s+Decimal/, "InventoryBatch totalQuantity must use Decimal");
  assert.match(schema, /availableQuantity\s+Decimal/, "InventoryBatch availableQuantity must use Decimal");
  assert.match(schema, /lockedQuantity\s+Decimal/, "InventoryBatch lockedQuantity must use Decimal");
  assert.match(schema, /outboundQuantity\s+Decimal/, "InventoryBatch outboundQuantity must use Decimal");
  assert.match(schema, /SQUARE_METER/, "ProductUnit must support square meter");
  assert.match(schema, /SQUARE_CENTIMETER/, "ProductUnit must support square centimeter");
  assert.match(schema, /packageUnit\s+ProductUnit/, "InventoryBatch must preserve package unit");
  assert.match(schema, /packageQuantity\s+Decimal/, "InventoryBatch must preserve package quantity");
  assert.match(schema, /baseUnit\s+ProductUnit/, "InventoryBatch must store canonical base unit");
  assert.match(schema, /baseQuantityPerPackage\s+Decimal/, "InventoryBatch must store batch conversion rate");
  assert.match(schema, /lockedQuantity\s+Decimal/, "OrderInventoryAllocation must store locked quantity");
  assert.match(schema, /outboundQuantity\s+Decimal/, "OrderInventoryAllocation must store outbound quantity");
  assert.ok(schema.includes("COUNT_IN"), "inventory movement types must include count-in");
  assert.ok(schema.includes("COUNT_OUT"), "inventory movement types must include count-out");
  assert.ok(schema.includes("DAMAGE_OUT"), "inventory movement types must include damage-out");
  assert.ok(schema.includes("TRANSFER_IN"), "inventory movement types must include transfer-in");
  assert.ok(schema.includes("TRANSFER_OUT"), "inventory movement types must include transfer-out");
  assert.ok(schema.includes("RETURN_IN"), "inventory movement types must include return-in");
  assert.ok(schema.includes("RETURN_OUT"), "inventory movement types must include return-out");
  assert.ok(schema.includes("BATCH_SPLIT"), "inventory movement types must include batch split");
  assert.ok(schema.includes("@@unique([storeId, productId, batchNo])"), "batch number must be unique per store product");
  assert.ok(schema.includes("@@unique([orderId, orderItemId, batchId])"), "order inventory allocation must be unique per order item batch");
  assert.ok(schema.includes("@@unique([storeId, name])"), "supplier name must be unique per store");
  assert.ok(schema.includes("@@index([storeId, isActive])"), "supplier list must support active filtering by store");
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
  assert.match(schema, /fileUrl\s+String\?/, "invoice must keep electronic invoice file url");
  assert.ok(schema.includes("@@index([storeId, status])"), "phase five workflow tables must be scoped by store and status");
  assert.ok(schema.includes("amountCents"), "phase five money fields must use integer cents");
  assert.ok(schema.includes("REVIEWED"), "rebate workflow must separate business review from finance approval");
  assert.ok(schema.includes("idempotencyKey String?"), "cash and receipt operations must persist idempotency keys");
  assert.ok(schema.includes("@@unique([storeId, idempotencyKey])"), "cash facts must reject duplicate operation keys per store");
});

test("schema exposes persistent audit events for business critical changes", () => {
  const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");

  assert.ok(schema.includes("model AuditEvent "), "AuditEvent model is missing");
  assert.ok(schema.includes("targetType"), "AuditEvent must record target type");
  assert.ok(schema.includes("targetId"), "AuditEvent must record target id");
  assert.ok(schema.includes("metadata   Json"), "AuditEvent must store structured metadata");
  assert.ok(
    schema.includes("@@index([targetType, targetId, createdAt(sort: Desc)])"),
    "AuditEvent must be queryable by target"
  );
});
