# Inventory Base Unit Outbound Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support purchase/warehouse stock by package unit, while locking and outbounding sales order inventory by actual measured base unit such as meter, square meter, square centimeter, or piece.

**Architecture:** Keep purchase and sales display units as business-facing units, but make inventory quantity columns represent a canonical base stock unit per batch. Preserve package information on each batch so the UI can show both "1 卷" and "18 米", and add unit-aware allocation/outbound APIs so partial outbound updates remaining stock correctly.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Next.js, Ant Design, Node test runner, TypeScript.

---

## Scope And Business Rules

This plan covers inventory quantity semantics for purchase receiving, inventory matching, and sales-order outbound.

Primary examples:

- Purchase: receive `1 卷` of film.
- Batch conversion: `1 卷 = 18 米`, or `1 卷 = 15 米`, or `1 卷 = 30 米`.
- Stock: canonical available quantity is stored as `18 米`, `15 米`, or `30 米`.
- Outbound: user can outbound `12 米`.
- Remaining stock: batch shows `6 米`, with equivalent package quantity `0.333 卷` if the package rate is `18 米/卷`.
- Window film can use area units: square meter or square centimeter.

Rules:

- Inventory locking and outbound deduct from canonical base quantity.
- Purchase receiving may still be entered as package quantity.
- Batch owns the conversion rate because the same product can be received in different roll lengths later.
- Existing quantity fields on `InventoryBatch`, `OrderInventoryAllocation`, and `InventoryMovement` should be interpreted as base-unit quantities after migration.
- Order item sales quantity can remain sales-facing, but matching must convert to required base quantity.
- A partial outbound should not force manual "split batch" first.
- Batch split remains useful for explicit physical split/labeling, but is not required for normal outbound.

## File Structure

### Database And API

- Modify: `apps/api/prisma/schema.prisma`
  - Extend `ProductUnit`.
  - Add package/base conversion fields to `InventoryBatch`.
  - Add snapshot unit fields to `OrderItem` if required by matching.
  - Add unit fields to allocation/outbound DTOs if needed for user-entered units.
- Create: `apps/api/prisma/migrations/<timestamp>_inventory_base_units/migration.sql`
  - Migrate existing rows to base-unit semantics.
- Create: `apps/api/src/inventory/domain/unit-conversion.ts`
  - Central conversion and formatting-safe numeric helpers.
- Test: `apps/api/src/inventory/domain/unit-conversion.test.ts`
- Modify: `apps/api/src/inventory/dto/inventory.dto.ts`
  - Add unit-aware receive, lock, and outbound DTO shapes.
- Modify: `apps/api/src/inventory/inventory.service.ts`
  - Receiving converts package quantity to base quantity.
  - Locking validates and stores base quantity.
  - Outbound accepts partial line quantities and decrements locked/base quantities.
  - Purchase requirements use base quantities.
- Test: `apps/api/src/inventory/inventory.service.test.ts`
- Modify: `apps/api/src/orders/use-cases/create-order.use-case.ts`
  - Snapshot order item sales/base unit conversion.
- Test: `apps/api/src/orders/use-cases/create-order.use-case.test.ts`

### Web

- Create: `apps/web/src/features/inventory/unit-conversion.ts`
  - UI-side conversion helpers for labels and form payloads.
- Test: `apps/web/src/features/inventory/unit-conversion.test.ts`
- Modify: `apps/web/src/features/inventory/api.ts`
  - Add unit-aware payload types.
- Modify: `apps/web/src/features/inventory/display.ts`
  - Display package and base stock quantities together.
- Test: `apps/web/src/features/inventory/display.test.ts`
- Modify: `apps/web/app/inventory/matching/page.tsx`
  - Show order demand in sales unit and base unit.
  - Allow locking by selected quantity/unit.
  - Allow partial outbound by selected quantity/unit.
- Test: `apps/web/src/features/inventory/matching.test.ts`
- Modify: `apps/web/app/inventory/page.tsx`
  - Inventory overview shows current available base quantity and package equivalent.
- Modify: `apps/web/app/purchases/inbound/page.tsx` and/or `apps/web/app/purchases/orders/[id]/page.tsx`
  - Receiving form captures package unit, package quantity, and conversion rate.

---

## Task 1: Add Shared Unit Conversion Domain

**Files:**
- Create: `apps/api/src/inventory/domain/unit-conversion.ts`
- Create: `apps/api/src/inventory/domain/unit-conversion.test.ts`
- Create: `apps/web/src/features/inventory/unit-conversion.ts`
- Create: `apps/web/src/features/inventory/unit-conversion.test.ts`

- [ ] **Step 1: Write failing API unit conversion tests**

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ProductUnit } from "@prisma/client";
import {
  convertToBaseQuantity,
  convertFromBaseQuantity,
  normalizeInventoryQuantity
} from "./unit-conversion";

test("unit conversion converts roll outbound meters into base meter quantity", () => {
  assert.equal(
    convertToBaseQuantity({
      quantity: 12,
      fromUnit: ProductUnit.METER,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 18,
      packageUnit: ProductUnit.ROLL
    }),
    12
  );
});

test("unit conversion converts package quantity into base quantity", () => {
  assert.equal(
    convertToBaseQuantity({
      quantity: 1,
      fromUnit: ProductUnit.ROLL,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 18,
      packageUnit: ProductUnit.ROLL
    }),
    18
  );
});

test("unit conversion converts base meters into package equivalent", () => {
  assert.equal(
    convertFromBaseQuantity({
      baseQuantity: 6,
      toUnit: ProductUnit.ROLL,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 18,
      packageUnit: ProductUnit.ROLL
    }),
    0.333
  );
});

test("unit conversion normalizes decimal precision", () => {
  assert.equal(normalizeInventoryQuantity(1 / 3, 3), 0.333);
});
```

- [ ] **Step 2: Run the failing API test**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.app.json --test src/inventory/domain/unit-conversion.test.ts
```

Expected: FAIL because `unit-conversion.ts` does not exist.

- [ ] **Step 3: Implement API conversion helper**

```ts
import { ProductUnit } from "@prisma/client";

type ToBaseInput = {
  quantity: number;
  fromUnit: ProductUnit;
  baseUnit: ProductUnit;
  packageUnit?: ProductUnit | null;
  baseQuantityPerPackage?: number | null;
  precision?: number | null;
};

type FromBaseInput = {
  baseQuantity: number;
  toUnit: ProductUnit;
  baseUnit: ProductUnit;
  packageUnit?: ProductUnit | null;
  baseQuantityPerPackage?: number | null;
  precision?: number | null;
};

export function convertToBaseQuantity(input: ToBaseInput) {
  const precision = input.precision ?? 3;
  if (input.fromUnit === input.baseUnit) return normalizeInventoryQuantity(input.quantity, precision);
  if (input.fromUnit === input.packageUnit) {
    const rate = requirePositiveRate(input.baseQuantityPerPackage);
    return normalizeInventoryQuantity(input.quantity * rate, precision);
  }
  throw new Error("不支持当前单位换算");
}

export function convertFromBaseQuantity(input: FromBaseInput) {
  const precision = input.precision ?? 3;
  if (input.toUnit === input.baseUnit) return normalizeInventoryQuantity(input.baseQuantity, precision);
  if (input.toUnit === input.packageUnit) {
    const rate = requirePositiveRate(input.baseQuantityPerPackage);
    return normalizeInventoryQuantity(input.baseQuantity / rate, precision);
  }
  throw new Error("不支持当前单位换算");
}

export function normalizeInventoryQuantity(value: number, precision = 3) {
  return Number(value.toFixed(precision));
}

function requirePositiveRate(value?: number | null) {
  if (!value || value <= 0) throw new Error("单位换算比例必须大于 0");
  return value;
}
```

- [ ] **Step 4: Run the API conversion test**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.app.json --test src/inventory/domain/unit-conversion.test.ts
```

Expected: PASS.

- [ ] **Step 5: Mirror helper and tests in web**

Create `apps/web/src/features/inventory/unit-conversion.ts` with the same public functions, using `type ProductUnit = "ROLL" | "METER" | "PIECE" | "SQUARE_METER" | "SQUARE_CENTIMETER"`.

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.json --test src/features/inventory/unit-conversion.test.ts
```

Expected: PASS.

---

## Task 2: Extend Unit Model And Migrate Existing Inventory

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/<timestamp>_inventory_base_units/migration.sql`
- Test: `apps/api/src/prisma/database-invariants.test.ts`

- [ ] **Step 1: Write failing schema invariant tests**

Add assertions:

```ts
assert.match(schema, /SQUARE_METER/, "ProductUnit must support square meter");
assert.match(schema, /SQUARE_CENTIMETER/, "ProductUnit must support square centimeter");
assert.match(schema, /packageUnit\s+ProductUnit/, "InventoryBatch must preserve package unit");
assert.match(schema, /packageQuantity\s+Decimal/, "InventoryBatch must preserve package quantity");
assert.match(schema, /baseUnit\s+ProductUnit/, "InventoryBatch must store canonical base unit");
assert.match(schema, /baseQuantityPerPackage\s+Decimal/, "InventoryBatch must store batch conversion rate");
```

- [ ] **Step 2: Run schema invariant test**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.app.json --test src/prisma/database-invariants.test.ts
```

Expected: FAIL because the schema does not yet contain the new units and fields.

- [ ] **Step 3: Update Prisma schema**

Add enum values:

```prisma
enum ProductUnit {
  ROLL
  METER
  SQUARE_METER
  SQUARE_CENTIMETER
  PIECE
}
```

Add fields to `InventoryBatch`:

```prisma
packageUnit            ProductUnit?
packageQuantity        Decimal?    @db.Decimal(12, 3)
baseUnit               ProductUnit @default(PIECE)
baseQuantityPerPackage Decimal?    @db.Decimal(12, 3)
```

Interpret existing `InventoryBatch.unit`, `totalQuantity`, `availableQuantity`, `lockedQuantity`, and `outboundQuantity` as the canonical base unit after migration.

- [ ] **Step 4: Write migration**

Migration logic:

```sql
ALTER TYPE "ProductUnit" ADD VALUE IF NOT EXISTS 'SQUARE_METER';
ALTER TYPE "ProductUnit" ADD VALUE IF NOT EXISTS 'SQUARE_CENTIMETER';

ALTER TABLE "InventoryBatch"
  ADD COLUMN "packageUnit" "ProductUnit",
  ADD COLUMN "packageQuantity" DECIMAL(12,3),
  ADD COLUMN "baseUnit" "ProductUnit" NOT NULL DEFAULT 'PIECE',
  ADD COLUMN "baseQuantityPerPackage" DECIMAL(12,3);

UPDATE "InventoryBatch" b
SET
  "packageUnit" = b."unit",
  "packageQuantity" = b."totalQuantity",
  "baseUnit" = CASE
    WHEN b."unit" = 'ROLL' AND p."metersPerRoll" IS NOT NULL AND p."metersPerRoll" > 0 THEN 'METER'::"ProductUnit"
    ELSE b."unit"
  END,
  "baseQuantityPerPackage" = CASE
    WHEN b."unit" = 'ROLL' AND p."metersPerRoll" IS NOT NULL AND p."metersPerRoll" > 0 THEN p."metersPerRoll"
    ELSE 1
  END
FROM "Product" p
WHERE b."productId" = p."id";

UPDATE "InventoryBatch" b
SET
  "totalQuantity" = b."totalQuantity" * b."baseQuantityPerPackage",
  "availableQuantity" = b."availableQuantity" * b."baseQuantityPerPackage",
  "lockedQuantity" = b."lockedQuantity" * b."baseQuantityPerPackage",
  "outboundQuantity" = b."outboundQuantity" * b."baseQuantityPerPackage",
  "unit" = b."baseUnit"
WHERE b."packageUnit" = 'ROLL' AND b."baseUnit" = 'METER';
```

- [ ] **Step 5: Run Prisma generate and schema test**

Run:

```powershell
pnpm --filter @mallbay/api prisma:generate
pnpm exec tsx --tsconfig tsconfig.app.json --test src/prisma/database-invariants.test.ts
```

Expected: PASS.

---

## Task 3: Receive Purchase Stock As Package And Store Base Quantity

**Files:**
- Modify: `apps/api/src/inventory/dto/inventory.dto.ts`
- Modify: `apps/api/src/inventory/inventory.service.ts`
- Test: `apps/api/src/inventory/inventory.service.test.ts`

- [ ] **Step 1: Write failing receive test**

Add a test:

```ts
test("InventoryService receives one roll as base meter stock with package snapshot", async () => {
  const creates: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    warehouse: { findUnique: async () => null },
    inventoryBatch: {
      create: async (args: unknown) => {
        creates.push(args);
        return { id: "batch-1" };
      }
    },
    inventoryMovement: { create: async (args: unknown) => creates.push(args) }
  };
  const service = new InventoryService(prisma as never);

  await service.createBatch(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
    {
      storeId: "store-1",
      productId: "product-1",
      batchNo: "ROLL-001",
      totalQuantity: 1,
      unit: ProductUnit.ROLL,
      baseUnit: ProductUnit.METER,
      baseQuantityPerPackage: 18
    }
  );

  const serialized = JSON.stringify(creates);
  assert.match(serialized, /"packageUnit":"ROLL"/);
  assert.match(serialized, /"packageQuantity":1/);
  assert.match(serialized, /"unit":"METER"/);
  assert.match(serialized, /"totalQuantity":18/);
  assert.match(serialized, /"availableQuantity":18/);
});
```

- [ ] **Step 2: Run failing receive test**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.app.json --test src/inventory/inventory.service.test.ts
```

Expected: FAIL because DTO/service do not accept base conversion fields yet.

- [ ] **Step 3: Extend `CreateInventoryBatchDto`**

Add:

```ts
@IsOptional()
@IsEnum(ProductUnit)
unit?: ProductUnit;

@IsOptional()
@IsEnum(ProductUnit)
baseUnit?: ProductUnit;

@IsOptional()
@Type(() => Number)
@Min(0.001)
baseQuantityPerPackage?: number;
```

- [ ] **Step 4: Update create batch conversion**

In `createBatch`, compute:

```ts
const packageUnit = dto.unit ?? ProductUnit.PIECE;
const baseUnit = dto.baseUnit ?? packageUnit;
const baseQuantityPerPackage = dto.baseQuantityPerPackage ?? 1;
const baseTotalQuantity = convertToBaseQuantity({
  quantity: dto.totalQuantity,
  fromUnit: packageUnit,
  baseUnit,
  packageUnit,
  baseQuantityPerPackage
});
```

Persist:

```ts
unit: baseUnit,
totalQuantity: baseTotalQuantity,
availableQuantity: baseTotalQuantity,
packageUnit,
packageQuantity: dto.totalQuantity,
baseUnit,
baseQuantityPerPackage
```

Movement:

```ts
quantity: baseTotalQuantity,
unit: baseUnit,
metadata: {
  packageQuantity: dto.totalQuantity,
  packageUnit,
  baseQuantityPerPackage
}
```

- [ ] **Step 5: Run inventory service test**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.app.json --test src/inventory/inventory.service.test.ts
```

Expected: PASS.

---

## Task 4: Snapshot Order Item Base Demand

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Modify: `apps/api/src/orders/use-cases/create-order.use-case.ts`
- Test: `apps/api/src/orders/use-cases/create-order.use-case.test.ts`

- [ ] **Step 1: Write failing order creation test**

Expected behavior:

```ts
assert.match(serializedOrderCreate, /"salesUnit":"ROLL"/);
assert.match(serializedOrderCreate, /"baseUnit":"METER"/);
assert.match(serializedOrderCreate, /"baseQuantityPerSalesUnit":18/);
assert.match(serializedOrderCreate, /"requiredBaseQuantity":18/);
```

- [ ] **Step 2: Add `OrderItem` snapshot fields**

```prisma
salesUnit                ProductUnit?
baseUnit                 ProductUnit?
baseQuantityPerSalesUnit Decimal? @db.Decimal(12, 3)
requiredBaseQuantity     Decimal? @db.Decimal(12, 3)
```

- [ ] **Step 3: Implement snapshot**

When creating order items, read product fields:

```ts
const salesUnit = product.salesUnit ?? product.unit;
const baseUnit = product.inventoryUnit ?? salesUnit;
const baseQuantityPerSalesUnit = product.metersPerRoll && salesUnit === ProductUnit.ROLL
  ? decimalToNumber(product.metersPerRoll)
  : 1;
const requiredBaseQuantity = item.quantity * baseQuantityPerSalesUnit;
```

Persist those snapshot fields on each `OrderItem`.

- [ ] **Step 4: Run order creation tests**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.app.json --test src/orders/use-cases/create-order.use-case.test.ts
```

Expected: PASS.

---

## Task 5: Lock Inventory By Base Quantity

**Files:**
- Modify: `apps/api/src/inventory/dto/inventory.dto.ts`
- Modify: `apps/api/src/inventory/inventory.service.ts`
- Test: `apps/api/src/inventory/inventory.service.test.ts`
- Modify: `apps/web/app/inventory/matching/page.tsx`
- Test: `apps/web/src/features/inventory/matching.test.ts`

- [ ] **Step 1: Write failing backend lock test**

Use a batch with `availableQuantity: 18`, `unit: METER`, `packageUnit: ROLL`, `baseQuantityPerPackage: 18`.

Lock request:

```ts
allocations: [{ orderItemId: "item-1", batchId: "batch-1", quantity: 12, unit: ProductUnit.METER }]
```

Expect:

```ts
assert.match(serialized, /"availableQuantity":\{"decrement":12\}/);
assert.match(serialized, /"lockedQuantity":\{"increment":12\}/);
assert.match(serialized, /"lockedQuantity":12/);
```

- [ ] **Step 2: Extend allocation DTO**

```ts
@IsOptional()
@IsEnum(ProductUnit)
unit?: ProductUnit;
```

- [ ] **Step 3: Convert lock quantity**

For each allocation:

```ts
const lockBaseQuantity = convertToBaseQuantity({
  quantity: allocation.quantity,
  fromUnit: allocation.unit ?? batch.unit,
  baseUnit: batch.unit,
  packageUnit: batch.packageUnit,
  baseQuantityPerPackage: decimalToNumber(batch.baseQuantityPerPackage ?? 1)
});
```

Validate `lockBaseQuantity <= batch.availableQuantity`.

- [ ] **Step 4: Update matching UI**

Show:

- Demand: `1 卷 / 18 米`
- Available batch: `批次 1111 · 可用 18 米 · 原始 1 卷`
- Lock input: quantity input + unit select.

Payload:

```ts
{
  allocations: [{
    orderItemId: row.orderItemId,
    batchId: selectedBatchId,
    quantity: Number(inputQuantity),
    unit: selectedUnit
  }]
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.app.json --test src/inventory/inventory.service.test.ts
pnpm exec tsx --tsconfig tsconfig.json --test src/features/inventory/matching.test.ts
```

Expected: PASS.

---

## Task 6: Partial Outbound By Selected Unit

**Files:**
- Modify: `apps/api/src/inventory/dto/inventory.dto.ts`
- Modify: `apps/api/src/inventory/inventory.controller.ts`
- Modify: `apps/api/src/inventory/inventory.service.ts`
- Test: `apps/api/src/inventory/inventory.service.test.ts`
- Modify: `apps/web/src/features/inventory/api.ts`
- Modify: `apps/web/app/inventory/matching/page.tsx`
- Test: `apps/web/src/features/inventory/matching.test.ts`

- [ ] **Step 1: Write failing outbound test**

Set up allocation:

```ts
lockedQuantity: 18,
outboundQuantity: 0,
status: "LOCKED",
batch: {
  id: "batch-1",
  unit: ProductUnit.METER,
  availableQuantity: 0,
  lockedQuantity: 18,
  outboundQuantity: 0,
  packageUnit: ProductUnit.ROLL,
  packageQuantity: 1,
  baseQuantityPerPackage: 18
}
```

Outbound payload:

```ts
{ lines: [{ allocationId: "allocation-1", quantity: 12, unit: ProductUnit.METER }] }
```

Expected:

```ts
assert.match(serialized, /"lockedQuantity":\{"decrement":12\}/);
assert.match(serialized, /"outboundQuantity":\{"increment":12\}/);
assert.match(serialized, /"movementType":"ORDER_OUT"/);
assert.match(serialized, /"quantity":12/);
assert.doesNotMatch(serialized, /"status":"OUTBOUND".*"outboundQuantity":18/);
```

The allocation remains `LOCKED` if `outboundQuantity + 12 < lockedQuantity`; it becomes `OUTBOUND` only when fully outbounded.

- [ ] **Step 2: Add outbound DTO**

```ts
export class OutboundOrderInventoryLineDto {
  @IsString()
  allocationId!: string;

  @Type(() => Number)
  @Min(0.001)
  quantity!: number;

  @IsEnum(ProductUnit)
  unit!: ProductUnit;
}

export class OutboundOrderInventoryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OutboundOrderInventoryLineDto)
  lines!: OutboundOrderInventoryLineDto[];
}
```

- [ ] **Step 3: Update controller**

```ts
@Post("orders/:orderId/outbound")
outboundOrderInventory(
  @Req() req: AuthRequest,
  @Param("orderId") orderId: string,
  @Body() dto: OutboundOrderInventoryDto
) {
  return this.inventory.outboundOrderInventory(req.user, orderId, dto);
}
```

- [ ] **Step 4: Update service**

For each line:

```ts
const remainingLocked = lockedQuantity - outboundQuantity;
const outboundBaseQuantity = convertToBaseQuantity({
  quantity: line.quantity,
  fromUnit: line.unit,
  baseUnit: allocation.batch.unit,
  packageUnit: allocation.batch.packageUnit,
  baseQuantityPerPackage: decimalToNumber(allocation.batch.baseQuantityPerPackage ?? 1)
});
if (outboundBaseQuantity > remainingLocked) {
  throw new BadRequestException("出库数量不能超过已锁定未出库数量");
}
```

Update:

```ts
inventoryBatch.lockedQuantity decrement outboundBaseQuantity
inventoryBatch.outboundQuantity increment outboundBaseQuantity
orderInventoryAllocation.outboundQuantity increment outboundBaseQuantity
orderInventoryAllocation.status = fullyOutbound ? "OUTBOUND" : "LOCKED"
inventoryMovement.quantity = outboundBaseQuantity
inventoryMovement.unit = allocation.batch.unit
inventoryMovement.metadata = { inputQuantity: line.quantity, inputUnit: line.unit }
```

- [ ] **Step 5: Update web API**

```ts
export type OutboundOrderInventoryPayload = {
  lines: Array<{
    allocationId: string;
    quantity: number;
    unit: ProductUnit;
  }>;
};

outboundOrder: (orderId: string, payload: OutboundOrderInventoryPayload) =>
  request<unknown>(`/inventory/orders/${orderId}/outbound`, {
    method: "POST",
    body: JSON.stringify(payload)
  })
```

- [ ] **Step 6: Update matching page**

Replace "确认出库" all-or-nothing action with allocation rows:

- Batch number
- Locked remaining
- Outbound input quantity
- Unit select
- Button: `确认本行出库`

For a locked 18 米 allocation, user can input `12` and choose `米`.

- [ ] **Step 7: Run tests**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.app.json --test src/inventory/inventory.service.test.ts
pnpm exec tsx --tsconfig tsconfig.json --test src/features/inventory/api.test.ts src/features/inventory/matching.test.ts
```

Expected: PASS.

---

## Task 7: Display Package Quantity And Base Quantity Everywhere

**Files:**
- Modify: `apps/web/src/features/inventory/display.ts`
- Test: `apps/web/src/features/inventory/display.test.ts`
- Modify: `apps/web/app/inventory/page.tsx`
- Modify: `apps/web/app/inventory/matching/page.tsx`
- Modify: `apps/web/app/inventory/movements/page.tsx`

- [ ] **Step 1: Write display tests**

```ts
assert.equal(
  formatBatchStockLabel({
    availableQuantity: 6,
    unit: "METER",
    packageUnit: "ROLL",
    baseQuantityPerPackage: 18
  }),
  "可用 6 米 / 折合 0.333 卷"
);
```

```ts
assert.equal(
  formatPackageSnapshotLabel({
    packageQuantity: 1,
    packageUnit: "ROLL",
    baseQuantityPerPackage: 18,
    unit: "METER"
  }),
  "原始入库 1 卷 · 1 卷 = 18 米"
);
```

- [ ] **Step 2: Implement display helpers**

```ts
export function formatBatchStockLabel(row: {
  availableQuantity?: number | string | null;
  unit?: string | null;
  packageUnit?: string | null;
  baseQuantityPerPackage?: number | string | null;
}) {
  const available = toNumber(row.availableQuantity);
  const baseUnitLabel = getProductUnitLabel(row.unit);
  if (!row.packageUnit || !row.baseQuantityPerPackage) return `可用 ${available} ${baseUnitLabel}`;
  const packageQuantity = formatQuantity(available / toNumber(row.baseQuantityPerPackage), 3);
  return `可用 ${available} ${baseUnitLabel} / 折合 ${packageQuantity} ${getProductUnitLabel(row.packageUnit)}`;
}
```

- [ ] **Step 3: Apply display helpers**

Inventory batch cards/table:

- `当前可用：6 米`
- `折合：0.333 卷`
- `原始入库：1 卷`
- `规格：1 卷 = 18 米`

Matching page:

- `订单需求：1 卷 / 18 米`
- `已锁：12 米`
- `已出库：12 米`
- `待出库：6 米`

Movement page:

- `订单出库：12 米`
- `录入：12 米`
- `批次规格：1 卷 = 18 米`

- [ ] **Step 4: Run web tests**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.json --test src/features/inventory/display.test.ts src/features/inventory/matching.test.ts
```

Expected: PASS.

---

## Task 8: End-To-End Scenario And Build Verification

**Files:**
- Test: `apps/api/src/inventory/inventory.service.test.ts`
- Test: `apps/web/src/features/inventory/matching.test.ts`

- [ ] **Step 1: Add full scenario test**

Scenario:

1. Receive `1 卷`, `1 卷 = 18 米`.
2. Lock `18 米` for a sales order.
3. Outbound `12 米`.
4. Batch state: `lockedQuantity = 6`, `outboundQuantity = 12`.
5. Allocation state: `lockedQuantity = 18`, `outboundQuantity = 12`, `status = LOCKED`.
6. UI label: `待出库 6 米`.

- [ ] **Step 2: Run focused tests**

Run:

```powershell
pnpm exec tsx --tsconfig tsconfig.app.json --test src/inventory/inventory.service.test.ts src/orders/use-cases/create-order.use-case.test.ts
pnpm exec tsx --tsconfig tsconfig.json --test src/features/inventory/api.test.ts src/features/inventory/display.test.ts src/features/inventory/matching.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type checks**

Run:

```powershell
pnpm exec tsc -p tsconfig.app.json --noEmit
pnpm exec tsc -p tsconfig.json --noEmit
```

Expected: both PASS.

- [ ] **Step 4: Run builds**

Run:

```powershell
pnpm --filter @mallbay/api build
pnpm --filter @mallbay/web build
```

Expected: both PASS.

---

## Rollout Notes

- Existing roll batches with no `Product.metersPerRoll` cannot be safely converted. The migration should set `baseQuantityPerPackage = 1` for those rows and expose them in an admin correction list.
- New receiving forms should require conversion rate when package unit differs from base unit.
- The old "split batch" feature should remain, but its UI copy should clarify it is for physical relabeling/splitting, not required before normal outbound.
- Reports that sum stock quantity must group by `unit`; never add meters and pieces together.
- Inventory movement exports should include both `quantity/unit` and `metadata.inputQuantity/inputUnit` for auditability.

## Self-Review

- Spec coverage: package purchase, base stock, partial outbound, mixed roll lengths, square units, UI display, migration, and tests are covered.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: backend and frontend payloads use `quantity` plus `unit`; batch conversion fields use `packageUnit`, `packageQuantity`, `baseUnit`, and `baseQuantityPerPackage`.
