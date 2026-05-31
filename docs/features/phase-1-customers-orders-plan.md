# Phase 1 Customers Orders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Phase 1 business foundation for customers, vehicles, products, sales orders, order amounts, payment accounts, and order payments.

**Architecture:** Keep the current modular monolith. Add focused NestJS modules under `apps/api/src/customers`, `apps/api/src/products`, and `apps/api/src/orders`; keep role and data-scope decisions in a shared policy rather than scattering checks through services. Extend the current Next.js management UI with customers, products, and orders pages that call typed API clients.

**Tech Stack:** NestJS 11, Prisma 7.8, PostgreSQL, Next.js 16, React 19, Ant Design 6, TanStack Query 5, Node test runner, TypeScript.

---

## Scope

This plan implements the first usable Web management loop:

1. Customers and vehicles can be created, searched, viewed, and updated.
2. Products can be managed as orderable base data.
3. Sales can create orders with customer, vehicle, products, construction type, location, appointment, amount, and optional deposit.
4. Store managers, sales, customer service, finance, and admins see customer/order data according to the optimized role model.
5. Payment accounts and order payments are recorded so finance can see deposit and outstanding balance.

This plan does not implement construction dispatch, inventory stock deduction, warranty, after-sales, invoices, rebates, reports, OCR, or mini-program offline sync.

## Role Decisions

Use the optimized role model from `docs/features/paint-protection-film-system-plan.md`:

- `User.isAuditor=true` means administrator. This merges the previous auditor and administrator roles.
- `StoreMember.position = MANAGER` means store manager.
- `StoreMember.position = SCHEDULER` means construction supervisor.
- `CUSTOMER_SERVICE` is required for a complete customer-service role, but Phase 1 must not block on it. Until the enum is added, administrator and store manager can perform customer-service operations.
- `SALES`, `PURCHASING`, `FINANCE`, `CONSTRUCTION`, and `APPRENTICE` keep their current meanings.

## File Structure

Create or modify these files:

```text
apps/api/prisma/schema.prisma
apps/api/src/app.module.ts
apps/api/src/common/policies/permission.policy.ts
apps/api/src/common/policies/permission.policy.test.ts
apps/api/src/customers/customers.module.ts
apps/api/src/customers/customers.controller.ts
apps/api/src/customers/customers.service.ts
apps/api/src/customers/repositories/customer.repository.ts
apps/api/src/customers/domain/customer.policy.ts
apps/api/src/customers/dto/create-customer.dto.ts
apps/api/src/customers/dto/update-customer.dto.ts
apps/api/src/customers/dto/list-customers.dto.ts
apps/api/src/customers/dto/create-vehicle.dto.ts
apps/api/src/customers/dto/update-vehicle.dto.ts
apps/api/src/customers/dto/create-customer-note.dto.ts
apps/api/src/customers/customers.service.test.ts
apps/api/src/products/products.module.ts
apps/api/src/products/products.controller.ts
apps/api/src/products/products.service.ts
apps/api/src/products/repositories/product.repository.ts
apps/api/src/products/dto/create-product.dto.ts
apps/api/src/products/dto/update-product.dto.ts
apps/api/src/products/dto/list-products.dto.ts
apps/api/src/products/products.service.test.ts
apps/api/src/orders/orders.module.ts
apps/api/src/orders/orders.controller.ts
apps/api/src/orders/orders.service.ts
apps/api/src/orders/repositories/order.repository.ts
apps/api/src/orders/domain/order-policy.ts
apps/api/src/orders/domain/order-status.machine.ts
apps/api/src/orders/use-cases/create-order.use-case.ts
apps/api/src/orders/dto/create-order.dto.ts
apps/api/src/orders/dto/list-orders.dto.ts
apps/api/src/orders/dto/create-payment-account.dto.ts
apps/api/src/orders/dto/create-order-payment.dto.ts
apps/api/src/orders/orders.service.test.ts
apps/api/src/orders/use-cases/create-order.use-case.test.ts
packages/shared/src/index.ts
apps/web/src/features/customers/api.ts
apps/web/src/features/products/api.ts
apps/web/src/features/orders/api.ts
apps/web/src/lib/api.ts
apps/web/app/customers/page.tsx
apps/web/app/customers/[id]/page.tsx
apps/web/app/products/page.tsx
apps/web/app/orders/page.tsx
apps/web/app/orders/create/page.tsx
apps/web/app/orders/[id]/page.tsx
docs/features/phase-1-customers-orders.md
docs/README.md
```

## Data Model

Use these Prisma model names and enum names exactly so API, UI, and tests stay aligned:

```prisma
enum CustomerType {
  PERSONAL
  COMPANY
}

enum Gender {
  MALE
  FEMALE
  UNKNOWN
}

enum CustomerSourceType {
  ONLINE_DOUYIN
  ONLINE_XIAOHONGSHU
  ONLINE_KUAISHOU
  OFFLINE_STORE
  REFERRAL
  PARTNER
  OTHER
}

enum ProductCategory {
  PPF
  COLOR_FILM
  HEAT_FILM
  MODIFICATION
  OTHER
}

enum ProductUnit {
  ROLL
  METER
  PIECE
}

enum ProductStatus {
  ACTIVE
  INACTIVE
}

enum ConstructionType {
  PPF
  COLOR_FILM
  HEAT_FILM
  MODIFICATION
  INSPECTION
}

enum ConstructionLocation {
  IN_STORE
  OUTSIDE
}

enum OrderStatus {
  PENDING_DISPATCH
  DISPATCHED
  IN_CONSTRUCTION
  COMPLETED
  WARRANTIED
  CANCELLED
}

enum PaymentType {
  DEPOSIT
  BALANCE
  FULL
}

enum PaymentAccountType {
  CORPORATE
  PERSONAL
  WECHAT
  ALIPAY
  OTHER
}
```

## Task 1: Permission Policy Foundation

**Files:**
- Create: `apps/api/src/common/policies/permission.policy.ts`
- Create: `apps/api/src/common/policies/permission.policy.test.ts`

- [ ] **Step 1: Write the failing permission tests**

Create `apps/api/src/common/policies/permission.policy.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition } from "@prisma/client";
import { PermissionPolicy } from "./permission.policy";

const admin = { id: "admin-1", isAuditor: true, storeMember: null };
const manager = {
  id: "manager-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
};
const sales = {
  id: "sales-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.SALES }
};
const finance = {
  id: "finance-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
};
const worker = {
  id: "worker-1",
  isAuditor: false,
  storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
};

test("PermissionPolicy treats isAuditor as administrator", () => {
  assert.equal(PermissionPolicy.isAdmin(admin), true);
  assert.equal(PermissionPolicy.canViewStoreData(admin, "store-2"), true);
});

test("PermissionPolicy treats MANAGER as store manager for the same store", () => {
  assert.equal(PermissionPolicy.isStoreManager(manager, "store-1"), true);
  assert.equal(PermissionPolicy.isStoreManager(manager, "store-2"), false);
});

test("PermissionPolicy scopes sales to owned customers and orders", () => {
  assert.equal(PermissionPolicy.canViewCustomer(sales, "store-1", "sales-1"), true);
  assert.equal(PermissionPolicy.canViewCustomer(sales, "store-1", "sales-2"), false);
  assert.deepEqual(PermissionPolicy.getOrderScope(sales, "store-1"), {
    storeId: "store-1",
    salesPersonId: "sales-1"
  });
});

test("PermissionPolicy allows finance to manage payments but not customer edits", () => {
  assert.equal(PermissionPolicy.canManageOrderPayment(finance, "store-1"), true);
  assert.equal(PermissionPolicy.canEditCustomer(finance, "store-1", "sales-1"), false);
});

test("PermissionPolicy limits construction workers to assigned work", () => {
  assert.equal(PermissionPolicy.canCreateOrder(worker, "store-1"), false);
  assert.deepEqual(PermissionPolicy.getOrderScope(worker, "store-1"), {
    storeId: "store-1",
    assignedWorkerId: "worker-1"
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- permission.policy.test.ts
```

Expected: FAIL because `apps/api/src/common/policies/permission.policy.ts` does not exist.

- [ ] **Step 3: Implement the minimal policy**

Create `apps/api/src/common/policies/permission.policy.ts`:

```ts
import { StorePosition } from "@prisma/client";

export type UserWithStoreMember = {
  id: string;
  isAuditor: boolean;
  storeMember?: {
    storeId: string;
    position: StorePosition;
  } | null;
};

export type CustomerScope =
  | { all: true }
  | { storeId: string }
  | { storeId: string; ownerUserId: string };

export type OrderScope =
  | { all: true }
  | { storeId: string }
  | { storeId: string; salesPersonId: string }
  | { storeId: string; assignedWorkerId: string };

export class PermissionPolicy {
  static isAdmin(user: UserWithStoreMember) {
    return user.isAuditor;
  }

  static isStoreMember(user: UserWithStoreMember, storeId: string) {
    return user.storeMember?.storeId === storeId;
  }

  static isStoreManager(user: UserWithStoreMember, storeId: string) {
    return this.isAdmin(user) || (
      this.isStoreMember(user, storeId) &&
      user.storeMember?.position === StorePosition.MANAGER
    );
  }

  static canViewStoreData(user: UserWithStoreMember, storeId: string) {
    return this.isAdmin(user) || this.isStoreMember(user, storeId);
  }

  static canCreateOrder(user: UserWithStoreMember, storeId: string) {
    return this.isAdmin(user) || (
      this.isStoreMember(user, storeId) &&
      [StorePosition.MANAGER, StorePosition.SALES].includes(user.storeMember!.position)
    );
  }

  static canViewCustomer(user: UserWithStoreMember, storeId: string, ownerUserId: string) {
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    if (!this.isStoreMember(user, storeId)) return false;
    if (user.storeMember?.position === StorePosition.SALES) return ownerUserId === user.id;
    return [StorePosition.FINANCE, StorePosition.SCHEDULER].includes(user.storeMember!.position);
  }

  static canEditCustomer(user: UserWithStoreMember, storeId: string, ownerUserId: string) {
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    return this.isStoreMember(user, storeId) &&
      user.storeMember?.position === StorePosition.SALES &&
      ownerUserId === user.id;
  }

  static canManageOrderPayment(user: UserWithStoreMember, storeId: string) {
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    return this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.FINANCE;
  }

  static canDispatchConstruction(user: UserWithStoreMember, storeId: string) {
    if (this.isAdmin(user) || this.isStoreManager(user, storeId)) return true;
    return this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.SCHEDULER;
  }

  static getCustomerScope(user: UserWithStoreMember, storeId: string): CustomerScope {
    if (this.isAdmin(user)) return { all: true };
    if (this.isStoreManager(user, storeId)) return { storeId };
    if (this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.SALES) {
      return { storeId, ownerUserId: user.id };
    }
    return { storeId };
  }

  static getOrderScope(user: UserWithStoreMember, storeId: string): OrderScope {
    if (this.isAdmin(user)) return { all: true };
    if (this.isStoreManager(user, storeId)) return { storeId };
    if (this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.SALES) {
      return { storeId, salesPersonId: user.id };
    }
    if (this.isStoreMember(user, storeId) && [StorePosition.CONSTRUCTION, StorePosition.APPRENTICE].includes(user.storeMember!.position)) {
      return { storeId, assignedWorkerId: user.id };
    }
    return { storeId };
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- permission.policy.test.ts
```

Expected: PASS for all permission policy tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/common/policies/permission.policy.ts apps/api/src/common/policies/permission.policy.test.ts
git commit -m "feat: add phase one permission policy"
```

## Task 2: Prisma Models for Phase 1

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Test: `apps/api/src/prisma/database-invariants.test.ts`

- [ ] **Step 1: Add database invariant tests for Phase 1**

Append to `apps/api/src/prisma/database-invariants.test.ts`:

```ts
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
```

If the file currently does not import `readFileSync`, add:

```ts
import { readFileSync } from "node:fs";
```

- [ ] **Step 2: Run the invariant test and verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- database-invariants.test.ts
```

Expected: FAIL because Phase 1 models are missing.

- [ ] **Step 3: Extend the Prisma schema**

Modify `apps/api/prisma/schema.prisma` by adding the Phase 1 enums from the Data Model section and these models. Use relation names if Prisma reports ambiguity with `User` relations.

```prisma
model Customer {
  id             String       @id @default(cuid())
  storeId        String
  ownerUserId    String
  customerType   CustomerType
  name           String?
  gender         Gender?
  birthday       DateTime?
  companyName    String?
  contactPerson  String?
  phoneEncrypted String
  phoneHash      String
  wechat         String?
  sourceType     CustomerSourceType?
  sourceDetail   String?
  referrerId     String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  store      Store             @relation(fields: [storeId], references: [id], onDelete: Cascade)
  owner      User              @relation("CustomerOwner", fields: [ownerUserId], references: [id])
  referrer   Customer?         @relation("CustomerReferrals", fields: [referrerId], references: [id])
  referrals  Customer[]        @relation("CustomerReferrals")
  vehicles   CustomerVehicle[]
  notes      CustomerNote[]
  orders     Order[]

  @@unique([storeId, phoneHash])
  @@index([storeId, ownerUserId])
  @@index([storeId, name])
  @@index([storeId, companyName])
}

model CustomerVehicle {
  id           String   @id @default(cuid())
  customerId   String
  carPlate     String?
  vinEncrypted String?
  vinHash      String?
  carModel     String
  carColor     String?
  photoUrl     String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  customer Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  orders   Order[]

  @@index([customerId])
  @@index([carPlate])
  @@index([vinHash])
}

model CustomerNote {
  id          String   @id @default(cuid())
  customerId  String
  createdById String
  content     String
  createdAt   DateTime @default(now())

  customer  Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  createdBy User     @relation("CustomerNoteCreatedBy", fields: [createdById], references: [id])

  @@index([customerId, createdAt])
}

model Product {
  id             String        @id @default(cuid())
  storeId        String
  brand          String
  name           String
  model          String
  category       ProductCategory
  specification  String?
  unit           ProductUnit
  warrantyYears  Int?
  basePriceCents Int
  status         ProductStatus @default(ACTIVE)
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt

  store      Store       @relation(fields: [storeId], references: [id], onDelete: Cascade)
  orderItems OrderItem[]

  @@unique([storeId, brand, model])
  @@index([storeId, category])
  @@index([storeId, status])
}

model Order {
  id                    String               @id @default(cuid())
  storeId               String
  orderNo               String               @unique
  customerId            String
  vehicleId             String?
  salesPersonId         String
  constructionType      ConstructionType
  constructionLocation  ConstructionLocation
  constructionAddress   String?
  appointmentDate       DateTime?
  appointmentTimeSlot   String?
  status                OrderStatus          @default(PENDING_DISPATCH)
  remark                String?
  createdAt             DateTime             @default(now())
  updatedAt             DateTime             @updatedAt

  store       Store            @relation(fields: [storeId], references: [id], onDelete: Cascade)
  customer    Customer         @relation(fields: [customerId], references: [id])
  vehicle     CustomerVehicle? @relation(fields: [vehicleId], references: [id])
  salesPerson User             @relation("OrderSalesPerson", fields: [salesPersonId], references: [id])
  items       OrderItem[]
  amount      OrderAmount?
  payments    OrderPayment[]

  @@index([storeId, status])
  @@index([storeId, salesPersonId])
  @@index([customerId])
  @@index([vehicleId])
}

model OrderItem {
  id             String @id @default(cuid())
  orderId        String
  productId      String
  quantity       Int
  unitPriceCents Int
  amountCents    Int

  order   Order   @relation(fields: [orderId], references: [id], onDelete: Cascade)
  product Product @relation(fields: [productId], references: [id])

  @@index([orderId])
}

model OrderAmount {
  id                    String @id @default(cuid())
  orderId               String @unique
  productAmountCents    Int
  laborCostCents        Int
  totalAmountCents      Int
  paidAmountCents       Int    @default(0)
  outstandingCents      Int
  salesCommissionCents  Int    @default(0)
  materialCostCents     Int    @default(0)
  profitCents           Int    @default(0)

  order Order @relation(fields: [orderId], references: [id], onDelete: Cascade)
}

model PaymentAccount {
  id          String             @id @default(cuid())
  storeId     String
  name        String
  type        PaymentAccountType
  bankName    String?
  accountNo   String?
  isDefault   Boolean            @default(false)
  isActive    Boolean            @default(true)
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  store    Store          @relation(fields: [storeId], references: [id], onDelete: Cascade)
  payments OrderPayment[]

  @@index([storeId, isActive])
}

model OrderPayment {
  id               String      @id @default(cuid())
  orderId          String
  accountId        String
  paymentType      PaymentType
  amountCents      Int
  paidAt           DateTime
  createdById      String
  createdAt        DateTime    @default(now())

  order     Order          @relation(fields: [orderId], references: [id], onDelete: Cascade)
  account   PaymentAccount @relation(fields: [accountId], references: [id])
  createdBy User           @relation("OrderPaymentCreatedBy", fields: [createdById], references: [id])

  @@index([orderId])
  @@index([accountId])
}
```

Also add the corresponding back-relations to existing `User` and `Store` models:

```prisma
// User relations
ownedCustomers Customer[]     @relation("CustomerOwner")
customerNotes  CustomerNote[] @relation("CustomerNoteCreatedBy")
salesOrders    Order[]        @relation("OrderSalesPerson")
orderPayments  OrderPayment[] @relation("OrderPaymentCreatedBy")

// Store relations
customers       Customer[]
products        Product[]
orders          Order[]
paymentAccounts PaymentAccount[]
```

- [ ] **Step 4: Generate Prisma client and run invariant tests**

Run:

```bash
corepack pnpm --filter @mallbay/api prisma:generate
corepack pnpm --filter @mallbay/api test -- database-invariants.test.ts
```

Expected: Prisma generation succeeds and invariant test passes.

- [ ] **Step 5: Create and apply the migration**

Run:

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:55432/mallbay?schema=public' corepack pnpm --filter @mallbay/api prisma:migrate -- --name phase1_customers_orders
```

Expected: migration is created under `apps/api/prisma/migrations/` and applied to local PostgreSQL.

- [ ] **Step 6: Commit**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/prisma/database-invariants.test.ts
git commit -m "feat: add phase one data model"
```

## Task 3: Customers API

**Files:**
- Create: `apps/api/src/customers/`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/customers/customers.service.test.ts`

- [ ] **Step 1: Write customer service tests**

Create `apps/api/src/customers/customers.service.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { StorePosition } from "@prisma/client";
import { CustomersService } from "./customers.service";

test("CustomersService creates a personal customer owned by the current sales user", async () => {
  const calls: string[] = [];
  const prisma = {
    customer: {
      findUnique: async () => null,
      create: async (args: unknown) => {
        calls.push("customer.create");
        assert.deepEqual(args, {
          data: {
            storeId: "store-1",
            ownerUserId: "sales-1",
            customerType: "PERSONAL",
            name: "张三",
            gender: "UNKNOWN",
            birthday: undefined,
            companyName: undefined,
            contactPerson: undefined,
            phoneEncrypted: "enc:13800138000",
            phoneHash: "hash:13800138000",
            wechat: "wx-zhangsan",
            sourceType: "REFERRAL",
            sourceDetail: "老客户介绍",
            referrerId: undefined
          }
        });
        return { id: "customer-1", name: "张三" };
      }
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  });

  const result = await service.create(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    "store-1",
    {
      customerType: "PERSONAL",
      name: "张三",
      phone: "13800138000",
      wechat: "wx-zhangsan",
      sourceType: "REFERRAL",
      sourceDetail: "老客户介绍"
    }
  );

  assert.deepEqual(result, { id: "customer-1", name: "张三" });
  assert.deepEqual(calls, ["customer.create"]);
});

test("CustomersService rejects sales editing another sales user's customer", async () => {
  const service = new CustomersService({
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-2" })
    }
  } as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  });

  await assert.rejects(
    () => service.update(
      { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
      "customer-1",
      { name: "新名字" }
    ),
    { name: "ForbiddenException" }
  );
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- customers.service.test.ts
```

Expected: FAIL because `CustomersService` does not exist.

- [ ] **Step 3: Implement DTOs and service**

Create DTOs under `apps/api/src/customers/dto/`. Use class-validator decorators:

```ts
import { IsEnum, IsOptional, IsString, Matches, MaxLength, ValidateIf } from "class-validator";
import { CustomerSourceType, CustomerType, Gender } from "@prisma/client";

export class CreateCustomerDto {
  @IsEnum(CustomerType)
  customerType!: CustomerType;

  @ValidateIf((dto: CreateCustomerDto) => dto.customerType === CustomerType.PERSONAL)
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ValidateIf((dto: CreateCustomerDto) => dto.customerType === CustomerType.COMPANY)
  @IsString()
  @MaxLength(100)
  companyName?: string;

  @ValidateIf((dto: CreateCustomerDto) => dto.customerType === CustomerType.COMPANY)
  @IsString()
  @MaxLength(50)
  contactPerson?: string;

  @IsString()
  @Matches(/^1\d{10}$/)
  phone!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  wechat?: string;

  @IsOptional()
  @IsEnum(CustomerSourceType)
  sourceType?: CustomerSourceType;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  sourceDetail?: string;

  @IsOptional()
  @IsString()
  referrerId?: string;
}
```

Create `apps/api/src/customers/customers.service.ts` with constructor dependencies `PrismaService` and a small `SensitiveFieldCodec` helper. If no encryption helper exists yet, create an internal interface and use deterministic hash for query:

```ts
export type SensitiveFieldCodec = {
  encrypt(value: string): string;
  hash(value: string): string;
};
```

The `create()` method must:

1. Verify the current user can create customers in the store.
2. Hash the phone.
3. Reject duplicate `storeId + phoneHash`.
4. Persist encrypted phone and owner user id.

- [ ] **Step 4: Implement controller and module**

Create `apps/api/src/customers/customers.controller.ts`:

```ts
import { Body, Controller, Get, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { CustomersService } from "./customers.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { UpdateCustomerDto } from "./dto/update-customer.dto";
import { ListCustomersDto } from "./dto/list-customers.dto";
import { AuthRequest } from "../auth/auth.controller";

@Controller("customers")
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Post()
  create(@Req() req: AuthRequest, @Body() dto: CreateCustomerDto) {
    return this.customers.create(req.user, dto.storeId, dto);
  }

  @Get()
  list(@Req() req: AuthRequest, @Query() query: ListCustomersDto) {
    return this.customers.list(req.user, query);
  }

  @Get("search")
  search(@Req() req: AuthRequest, @Query("storeId") storeId: string, @Query("q") q: string) {
    return this.customers.search(req.user, storeId, q);
  }

  @Get(":id")
  detail(@Req() req: AuthRequest, @Param("id") id: string) {
    return this.customers.detail(req.user, id);
  }

  @Patch(":id")
  update(@Req() req: AuthRequest, @Param("id") id: string, @Body() dto: UpdateCustomerDto) {
    return this.customers.update(req.user, id, dto);
  }
}
```

If `storeId` is not in the DTO, add it to the DTO with `@IsString()`.

- [ ] **Step 5: Register module**

Modify `apps/api/src/app.module.ts`:

```ts
import { CustomersModule } from "./customers/customers.module";

@Module({
  imports: [
    CustomersModule
  ]
})
export class AppModule {}
```

Preserve existing imports and add `CustomersModule` to the current array.

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- customers.service.test.ts
corepack pnpm --filter @mallbay/api typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/customers apps/api/src/app.module.ts
git commit -m "feat: add customer management api"
```

## Task 4: Products API

**Files:**
- Create: `apps/api/src/products/`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/products/products.service.test.ts`

- [ ] **Step 1: Write product service tests**

Create `apps/api/src/products/products.service.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ProductCategory, ProductStatus, ProductUnit, StorePosition } from "@prisma/client";
import { ProductsService } from "./products.service";

test("ProductsService creates active products for store managers", async () => {
  const prisma = {
    product: {
      create: async (args: unknown) => {
        assert.deepEqual(args, {
          data: {
            storeId: "store-1",
            brand: "3M",
            name: "漆面保护膜",
            model: "PPF-100",
            category: ProductCategory.PPF,
            specification: "1.52*15m",
            unit: ProductUnit.ROLL,
            warrantyYears: 10,
            basePriceCents: 5000000,
            status: ProductStatus.ACTIVE
          }
        });
        return { id: "product-1" };
      }
    }
  };
  const service = new ProductsService(prisma as never);

  const result = await service.create(
    { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } },
    {
      storeId: "store-1",
      brand: "3M",
      name: "漆面保护膜",
      model: "PPF-100",
      category: ProductCategory.PPF,
      specification: "1.52*15m",
      unit: ProductUnit.ROLL,
      warrantyYears: 10,
      basePriceCents: 5000000
    }
  );

  assert.deepEqual(result, { id: "product-1" });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- products.service.test.ts
```

Expected: FAIL because `ProductsService` does not exist.

- [ ] **Step 3: Implement products module**

Create DTOs with class-validator. `CreateProductDto` must include:

```ts
storeId: string;
brand: string;
name: string;
model: string;
category: ProductCategory;
specification?: string;
unit: ProductUnit;
warrantyYears?: number;
basePriceCents: number;
```

Create `ProductsService` with:

- `create(user, dto)` restricted to admin or store manager.
- `list(user, query)` available to store members and admin.
- `update(user, id, dto)` restricted to admin or store manager.
- Soft delete by setting `status = INACTIVE`.

- [ ] **Step 4: Implement controller and register module**

Expose:

```text
POST /products
GET /products
GET /products/:id
PATCH /products/:id
DELETE /products/:id
```

Register `ProductsModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 5: Run tests and typecheck**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- products.service.test.ts
corepack pnpm --filter @mallbay/api typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/products apps/api/src/app.module.ts
git commit -m "feat: add product management api"
```

## Task 5: Orders and Payments API

**Files:**
- Create: `apps/api/src/orders/`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/orders/use-cases/create-order.use-case.test.ts`
- Test: `apps/api/src/orders/orders.service.test.ts`

- [ ] **Step 1: Write create-order use-case test**

Create `apps/api/src/orders/use-cases/create-order.use-case.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ConstructionLocation, ConstructionType, PaymentType, StorePosition } from "@prisma/client";
import { CreateOrderUseCase } from "./create-order.use-case";

test("CreateOrderUseCase creates order items amount and deposit payment in one transaction", async () => {
  const operations: string[] = [];
  const tx = {
    customer: { findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" }) },
    customerVehicle: { findUnique: async () => ({ id: "vehicle-1", customerId: "customer-1" }) },
    product: { findMany: async () => [{ id: "product-1", basePriceCents: 5000000, status: "ACTIVE" }] },
    order: {
      create: async () => {
        operations.push("order.create");
        return { id: "order-1", orderNo: "ORD202605310001" };
      }
    },
    orderItem: { createMany: async () => operations.push("orderItem.createMany") },
    orderAmount: { create: async () => operations.push("orderAmount.create") },
    orderPayment: { create: async () => operations.push("orderPayment.create") }
  };
  const prisma = {
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const useCase = new CreateOrderUseCase(prisma as never, {
    next: () => "ORD202605310001"
  });

  const result = await useCase.execute(
    { id: "sales-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SALES } },
    {
      storeId: "store-1",
      customerId: "customer-1",
      vehicleId: "vehicle-1",
      constructionType: ConstructionType.PPF,
      constructionLocation: ConstructionLocation.IN_STORE,
      appointmentDate: "2026-06-01",
      appointmentTimeSlot: "09:00-12:00",
      items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
      laborCostCents: 200000,
      deposit: {
        accountId: "account-1",
        amountCents: 1000000,
        paymentType: PaymentType.DEPOSIT,
        paidAt: "2026-05-31T10:00:00.000Z"
      }
    }
  );

  assert.deepEqual(result, { id: "order-1", orderNo: "ORD202605310001" });
  assert.deepEqual(operations, [
    "order.create",
    "orderItem.createMany",
    "orderAmount.create",
    "orderPayment.create"
  ]);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- create-order.use-case.test.ts
```

Expected: FAIL because `CreateOrderUseCase` does not exist.

- [ ] **Step 3: Implement order status machine**

Create `apps/api/src/orders/domain/order-status.machine.ts`:

```ts
import { BadRequestException } from "@nestjs/common";
import { OrderStatus } from "@prisma/client";

const transitions: Record<OrderStatus, OrderStatus[]> = {
  PENDING_DISPATCH: ["DISPATCHED", "CANCELLED"],
  DISPATCHED: ["IN_CONSTRUCTION", "CANCELLED"],
  IN_CONSTRUCTION: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["WARRANTIED"],
  WARRANTIED: [],
  CANCELLED: []
};

export function assertOrderTransition(from: OrderStatus, to: OrderStatus) {
  if (!transitions[from].includes(to)) {
    throw new BadRequestException(`订单状态不能从 ${from} 流转到 ${to}`);
  }
}
```

- [ ] **Step 4: Implement create order use case**

Create `apps/api/src/orders/use-cases/create-order.use-case.ts` with this behavior:

- Verify `PermissionPolicy.canCreateOrder(user, dto.storeId)`.
- Verify customer belongs to store.
- Verify vehicle belongs to customer when `vehicleId` is provided.
- Verify products exist and are `ACTIVE`.
- Compute `productAmountCents`, `laborCostCents`, `totalAmountCents`, `paidAmountCents`, `outstandingCents`.
- Create `Order`, `OrderItem`, `OrderAmount`, and optional `OrderPayment` in one Prisma transaction.
- Generate order number through injected `OrderNumberGenerator`.

Use this exact order-number interface:

```ts
export type OrderNumberGenerator = {
  next(): string;
};
```

- [ ] **Step 5: Implement orders service and controller**

Expose:

```text
POST /orders
GET /orders
GET /orders/:id
POST /orders/:id/payments
GET /orders/:id/payments
POST /payment-accounts
GET /payment-accounts
PATCH /payment-accounts/:id
DELETE /payment-accounts/:id
```

The payment service must recalculate `OrderAmount.paidAmountCents` and `OrderAmount.outstandingCents` after each payment.

- [ ] **Step 6: Register module**

Register `OrdersModule` in `apps/api/src/app.module.ts`.

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
corepack pnpm --filter @mallbay/api test -- create-order.use-case.test.ts
corepack pnpm --filter @mallbay/api test -- orders.service.test.ts
corepack pnpm --filter @mallbay/api typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/orders apps/api/src/app.module.ts
git commit -m "feat: add order and payment api"
```

## Task 6: Shared Types and Web API Clients

**Files:**
- Modify: `packages/shared/src/index.ts`
- Create: `apps/web/src/features/customers/api.ts`
- Create: `apps/web/src/features/products/api.ts`
- Create: `apps/web/src/features/orders/api.ts`
- Modify: `apps/web/src/lib/api.ts`
- Test: `apps/web/src/features/orders/api.test.ts`

- [ ] **Step 1: Write web API client test**

Create `apps/web/src/features/orders/api.test.ts`:

```ts
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { orderApi } from "./api";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("orderApi.create posts JSON to /orders", async () => {
  let capturedInput: RequestInfo | URL | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedInput = input;
    capturedInit = init;
    return {
      ok: true,
      json: async () => ({ id: "order-1", orderNo: "ORD202605310001" })
    } as Response;
  }) as typeof fetch;

  const result = await orderApi.create({
    storeId: "store-1",
    customerId: "customer-1",
    constructionType: "PPF",
    constructionLocation: "IN_STORE",
    items: [{ productId: "product-1", quantity: 1, unitPriceCents: 5000000 }],
    laborCostCents: 200000
  });

  assert.equal(capturedInput, "http://localhost:3001/orders");
  assert.equal(capturedInit?.method, "POST");
  assert.deepEqual(result, { id: "order-1", orderNo: "ORD202605310001" });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
corepack pnpm --filter @mallbay/web test -- orders/api.test.ts
```

Expected: FAIL because `apps/web/src/features/orders/api.ts` does not exist.

- [ ] **Step 3: Add shared types**

Modify `packages/shared/src/index.ts` to export:

```ts
export type CustomerType = "PERSONAL" | "COMPANY";
export type ProductCategory = "PPF" | "COLOR_FILM" | "HEAT_FILM" | "MODIFICATION" | "OTHER";
export type ConstructionType = "PPF" | "COLOR_FILM" | "HEAT_FILM" | "MODIFICATION" | "INSPECTION";
export type ConstructionLocation = "IN_STORE" | "OUTSIDE";
export type OrderStatus = "PENDING_DISPATCH" | "DISPATCHED" | "IN_CONSTRUCTION" | "COMPLETED" | "WARRANTIED" | "CANCELLED";
export type PaymentType = "DEPOSIT" | "BALANCE" | "FULL";
```

- [ ] **Step 4: Add web API clients**

Create `apps/web/src/features/orders/api.ts`:

```ts
import { request } from "../../lib/request";
import type { ConstructionLocation, ConstructionType, PaymentType } from "@mallbay/shared";

export type CreateOrderPayload = {
  storeId: string;
  customerId: string;
  vehicleId?: string;
  constructionType: ConstructionType;
  constructionLocation: ConstructionLocation;
  constructionAddress?: string;
  appointmentDate?: string;
  appointmentTimeSlot?: string;
  items: { productId: string; quantity: number; unitPriceCents: number }[];
  laborCostCents: number;
  remark?: string;
  deposit?: {
    accountId: string;
    amountCents: number;
    paymentType: PaymentType;
    paidAt: string;
  };
};

export const orderApi = {
  create: (payload: CreateOrderPayload) =>
    request<{ id: string; orderNo: string }>("/orders", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  list: (query: { page?: number; pageSize?: number; status?: string; search?: string }) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    return request<{ data: unknown[]; total: number; page: number; pageSize: number }>(`/orders?${params.toString()}`);
  },
  detail: (id: string) => request<unknown>(`/orders/${id}`)
};
```

Create equivalent `customerApi` and `productApi` modules with `create`, `list`, `detail`, and `update` methods.

Modify `apps/web/src/lib/api.ts` to export:

```ts
export { customerApi } from "../features/customers/api";
export { productApi } from "../features/products/api";
export { orderApi } from "../features/orders/api";
```

- [ ] **Step 5: Run web tests and typecheck**

Run:

```bash
corepack pnpm --filter @mallbay/web test
corepack pnpm --filter @mallbay/web typecheck
```

Expected: tests and typecheck pass.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/index.ts apps/web/src/features/customers apps/web/src/features/products apps/web/src/features/orders apps/web/src/lib/api.ts
git commit -m "feat: add phase one web api clients"
```

## Task 7: Phase 1 Web Pages

**Files:**
- Create: `apps/web/app/customers/page.tsx`
- Create: `apps/web/app/customers/[id]/page.tsx`
- Create: `apps/web/app/products/page.tsx`
- Create: `apps/web/app/orders/page.tsx`
- Create: `apps/web/app/orders/create/page.tsx`
- Create: `apps/web/app/orders/[id]/page.tsx`

- [ ] **Step 1: Create customers list page**

Create `apps/web/app/customers/page.tsx` with:

- Ant Design `Table`.
- Search input for phone, name, company, car plate, or VIN.
- `customerApi.list`.
- Primary button linking to order creation after selecting a customer.

Use this initial component shape:

```tsx
"use client";

import { Button, Input, Layout, Table, Typography } from "antd";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { customerApi } from "../../src/lib/api";

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const customersQuery = useQuery({
    queryKey: ["customers", search],
    queryFn: () => customerApi.list({ page: 1, pageSize: 20, search }),
    staleTime: 10_000
  });

  return (
    <Layout className="dashboard-shell">
      <Layout.Content className="dashboard-content">
        <Typography.Title level={3}>客户管理</Typography.Title>
        <div className="mb-4 flex gap-2">
          <Input.Search placeholder="手机号 / 姓名 / 企业 / 车牌 / VIN" onSearch={setSearch} allowClear />
          <Button type="primary" onClick={() => router.push("/orders/create")}>新建订单</Button>
        </div>
        <Table
          rowKey="id"
          loading={customersQuery.isLoading}
          dataSource={(customersQuery.data?.data ?? []) as never[]}
          columns={[
            { title: "客户", dataIndex: "displayName" },
            { title: "电话", dataIndex: "phone" },
            { title: "车辆数", dataIndex: "vehicleCount" },
            {
              title: "操作",
              render: (_: unknown, row: { id: string }) => (
                <Button size="small" onClick={() => router.push(`/customers/${row.id}`)}>详情</Button>
              )
            }
          ]}
        />
      </Layout.Content>
    </Layout>
  );
}
```

- [ ] **Step 2: Create products page**

Create `apps/web/app/products/page.tsx` with product list, create/edit modal, and active/inactive status tags.

- [ ] **Step 3: Create order pages**

Create:

- `apps/web/app/orders/page.tsx`: list with filters for date, status, customer, construction type.
- `apps/web/app/orders/create/page.tsx`: form for customer lookup, vehicle, products, construction type/location, appointment, labor cost, deposit.
- `apps/web/app/orders/[id]/page.tsx`: order detail with customer, products, amount, payment records.

The create page must call `customerApi.search`, `productApi.list`, and `orderApi.create`.

- [ ] **Step 4: Run frontend verification**

Run:

```bash
corepack pnpm --filter @mallbay/web typecheck
corepack pnpm --filter @mallbay/web test
```

Expected: typecheck and tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/customers apps/web/app/products apps/web/app/orders
git commit -m "feat: add phase one management pages"
```

## Task 8: Phase 1 Documentation and Full Verification

**Files:**
- Create: `docs/features/phase-1-customers-orders.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Write Phase 1 feature documentation**

Create `docs/features/phase-1-customers-orders.md`:

```md
# Phase 1 客户订单收款功能说明

本文档说明 Phase 1 已交付的客户、车辆、产品、订单和收款能力。

## 已交付能力

- 客户档案：个人/企业客户、联系方式、来源、推荐人。
- 车辆档案：车牌、VIN、车型、颜色、照片。
- 产品基础资料：品牌、名称、型号、类别、规格、单位、质保年限、基础价格。
- 销售订单：客户、车辆、产品明细、施工类型、施工地点、预约时间、费用清单。
- 收款：定金、尾款、全款，关联收款账户。

## 角色权限

- 管理员：跨门店全量。
- 店长：本门店全量。
- 销售：自己名下客户和订单。
- 财务：本门店订单只读，维护收款。
- 师傅：不参与 Phase 1 操作。

## 验收路径

1. 销售创建客户和车辆。
2. 销售选择产品创建订单。
3. 销售录入定金。
4. 财务查看订单收款状态。
5. 店长查看本门店客户和订单。
```

- [ ] **Step 2: Update docs index**

Add this line to `docs/README.md`:

```md
- [features/phase-1-customers-orders.md](./features/phase-1-customers-orders.md)：Phase 1 客户、订单、产品和收款功能说明。
```

- [ ] **Step 3: Run full verification**

Run:

```bash
corepack pnpm --filter @mallbay/api test
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web test
corepack pnpm --filter @mallbay/web typecheck
corepack pnpm lint
git diff --check
```

Expected:

- API tests pass.
- API typecheck passes.
- Web tests pass.
- Web typecheck passes.
- Lint has 0 errors. Existing warnings are acceptable only if unrelated and documented in the final handoff.
- `git diff --check` has no output.

- [ ] **Step 4: Commit**

```bash
git add docs/features/phase-1-customers-orders.md docs/README.md
git commit -m "docs: document phase one customer order flow"
```

## Self-Review Checklist

- [ ] The plan implements the optimized role model: administrator merges auditor/admin, `MANAGER` is store manager, `SCHEDULER` is construction supervisor.
- [ ] Phase 1 creates customers, vehicles, products, orders, order amounts, payment accounts, and order payments.
- [ ] Sales data scope is limited to owned customers and orders.
- [ ] Store managers can view and manage their store data.
- [ ] Finance can manage payments without gaining construction or inventory write access.
- [ ] All money fields use integer cents.
- [ ] Sensitive phone and VIN fields have hash fields for search.
- [ ] The plan does not implement Phase 2+ work such as dispatch, inventory stock deduction, warranty, after-sales, reports, invoices, rebates, or mini-program offline sync.
