# Phase 1 客户、产品、订单与收款实施计划

- 文档类型：功能实施计划
- 文档状态：草案，待逐步实施
- 适用范围：MallBay Phase 1 客户、车辆、产品、订单、费用与收款闭环
- 来源依据：[漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md)、[架构规范](../governance/ARCHITECTURE.md)、[API 规范](../governance/API_GUIDELINES.md)、[编码规范](../governance/CODE_STYLE.md)

> **执行要求：** 本计划用于分任务实施。执行时 MUST 使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 按任务推进。任务使用 checkbox (`- [ ]`) 追踪状态。

**目标：** 建立 Phase 1 业务基础能力，覆盖客户、车辆、产品、销售订单、订单费用、收款账户和订单收款。

**架构原则：** MUST 保持当前模块化单体架构。后端在 `apps/api/src/customers`、`apps/api/src/products`、`apps/api/src/orders` 下新增聚焦模块；角色和数据范围判断 MUST 收敛到共享 policy，禁止散落在多个 service 中重复判断。前端在当前 Next.js 管理端中扩展客户、产品和订单页面，并通过类型化 API client 访问后端。

**技术栈：** NestJS 11、Prisma 7.8、PostgreSQL、Next.js 16、React 19、Ant Design 6、TanStack Query 5、Node test runner、TypeScript。

**回滚原则：** 每个任务 MUST 独立提交；数据库变更 MUST 通过 Prisma migration 管理；接口和页面改动 MUST 保持业务行为可回滚，不允许把多个无关重构合并到同一提交。

---

## 实施范围

本计划实现第一版可用的 Web 管理闭环：

1. 客户和车辆可以创建、搜索、查看和更新。
2. 产品可以作为可下单的基础资料进行维护。
3. 销售可以基于客户、车辆、产品、施工类型、施工地点、预约时间、费用和可选定金创建订单。
4. 店长、销售、客服、财务和管理员按照优化后的角色模型查看客户和订单数据。
5. 系统记录收款账户和订单收款，财务可以查看定金和未结余额。

本计划 MUST NOT 实现施工派单、库存扣减、质保、售后、发票、返利、报表、OCR、小程序离线同步。这些能力进入后续 Phase。

## 角色决策

MUST 使用 [漆面保护膜施工管理系统建设方案](./paint-protection-film-system-plan.md) 中优化后的角色模型：

- `User.isAuditor=true` 统一解释为管理员，合并原审核员和管理员能力。
- `StoreMember.position = MANAGER` 表示店长。
- `StoreMember.position = SCHEDULER` 表示施工主管。
- 完整客服角色需要 `CUSTOMER_SERVICE`，但 Phase 1 MUST NOT 因枚举未扩展而阻塞。新增枚举前，由管理员和店长覆盖客服类操作。
- `SALES`、`PURCHASING`、`FINANCE`、`CONSTRUCTION`、`APPRENTICE` 保持当前语义。

## 文档规范符合性

MUST：

- 本文作为功能实施计划，存放在 `docs/features/`，符合 [文档规范](../DOCUMENTATION_GUIDELINES.md) 的功能文档分类。
- 文件名沿用已建立的 `phase-1-customers-orders-plan.md`，标题明确为“实施计划”。
- 实施完成后 MUST 另行创建不带 `plan` 后缀的已交付功能说明：`docs/features/phase-1-customers-orders.md`。
- 修改本文或新增 Phase 文档时 MUST 同步检查 [文档索引](../README.md)。

MUST NOT：

- 在功能说明中声称未交付能力已经完成。
- 把实施计划放到 `docs/governance/`，治理目录只承载稳定规范、协作规则和重构路线。

## 文件结构

计划新增或修改以下文件：

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

## 数据模型

MUST 使用以下 Prisma model 和 enum 名称，保证 API、UI 和测试保持一致：

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

## 任务 1：权限策略基础

**文件：**
- 新增：`apps/api/src/common/policies/permission.policy.ts`
- 新增：`apps/api/src/common/policies/permission.policy.test.ts`

- [ ] **步骤 1：编写先失败的权限测试**

新增 `apps/api/src/common/policies/permission.policy.test.ts`：

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

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
corepack pnpm --filter @mallbay/api test -- permission.policy.test.ts
```

预期：失败，因为 `apps/api/src/common/policies/permission.policy.ts` 尚不存在。

- [ ] **步骤 3：实现最小权限策略**

新增 `apps/api/src/common/policies/permission.policy.ts`：

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

- [ ] **步骤 4：运行测试并确认通过**

运行：

```bash
corepack pnpm --filter @mallbay/api test -- permission.policy.test.ts
```

预期：所有权限策略测试通过。

- [ ] **步骤 5：提交**

```bash
git add apps/api/src/common/policies/permission.policy.ts apps/api/src/common/policies/permission.policy.test.ts
git commit -m "feat: add phase one permission policy"
```

## 任务 2：Phase 1 Prisma 数据模型

**文件：**
- 修改：`apps/api/prisma/schema.prisma`
- 测试：`apps/api/src/prisma/database-invariants.test.ts`

- [ ] **步骤 1：为 Phase 1 增加数据库不变量测试**

追加到 `apps/api/src/prisma/database-invariants.test.ts`：

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

- [ ] **步骤 2：运行不变量测试并确认失败**

运行：

```bash
corepack pnpm --filter @mallbay/api test -- database-invariants.test.ts
```

预期：失败，因为 Phase 1 模型尚不存在。

- [ ] **步骤 3：扩展 Prisma schema**

修改 `apps/api/prisma/schema.prisma`，增加“数据模型”章节中的 Phase 1 enum 和以下 model。如果 Prisma 报告 `User` 关系歧义，MUST 使用显式 relation name。

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

同时在现有 `User` 和 `Store` model 中增加对应反向关系：

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

- [ ] **步骤 4：生成 Prisma Client 并运行不变量测试**

运行：

```bash
corepack pnpm --filter @mallbay/api prisma:generate
corepack pnpm --filter @mallbay/api test -- database-invariants.test.ts
```

预期：Prisma 生成成功，不变量测试通过。

- [ ] **步骤 5：创建并应用 migration**

运行：

```bash
DATABASE_URL='postgresql://postgres:postgres@localhost:55432/mallbay?schema=public' corepack pnpm --filter @mallbay/api prisma:migrate -- --name phase1_customers_orders
```

预期：migration 创建在 `apps/api/prisma/migrations/` 下，并应用到本地 PostgreSQL。

- [ ] **步骤 6：提交**

```bash
git add apps/api/prisma/schema.prisma apps/api/prisma/migrations apps/api/src/prisma/database-invariants.test.ts
git commit -m "feat: add phase one data model"
```

## 任务 3：客户 API

**文件：**
- 新增：`apps/api/src/customers/`
- 修改：`apps/api/src/app.module.ts`
- 测试：`apps/api/src/customers/customers.service.test.ts`

- [ ] **步骤 1：编写客户 service 测试**

新增 `apps/api/src/customers/customers.service.test.ts`：

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

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
corepack pnpm --filter @mallbay/api test -- customers.service.test.ts
```

预期：失败，因为 `CustomersService` 尚不存在。

- [ ] **步骤 3：实现 DTO 和 service**

在 `apps/api/src/customers/dto/` 下新增 DTO。MUST 使用 class-validator decorator：

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

新增 `apps/api/src/customers/customers.service.ts`，构造函数依赖 `PrismaService` 和小型 `SensitiveFieldCodec` helper。如果还没有加密 helper，先创建内部接口并使用确定性 hash 支持查询：

```ts
export type SensitiveFieldCodec = {
  encrypt(value: string): string;
  hash(value: string): string;
};
```

The `create()` method must:

1. 校验当前用户可以在该门店创建客户。
2. Hash the phone.
3. Reject duplicate `storeId + phoneHash`.
4. Persist encrypted phone and owner user id.

- [ ] **步骤 4：实现 controller 和 module**

新增 `apps/api/src/customers/customers.controller.ts`：

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

- [ ] **步骤 5：注册 module**

修改 `apps/api/src/app.module.ts`：

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

- [ ] **步骤 6：运行测试和类型检查**

运行：

```bash
corepack pnpm --filter @mallbay/api test -- customers.service.test.ts
corepack pnpm --filter @mallbay/api typecheck
```

预期：测试和类型检查通过。

- [ ] **步骤 7：提交**

```bash
git add apps/api/src/customers apps/api/src/app.module.ts
git commit -m "feat: add customer management api"
```

## 任务 4：产品 API

**文件：**
- 新增：`apps/api/src/products/`
- 修改：`apps/api/src/app.module.ts`
- 测试：`apps/api/src/products/products.service.test.ts`

- [ ] **步骤 1：编写产品 service 测试**

新增 `apps/api/src/products/products.service.test.ts`：

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

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
corepack pnpm --filter @mallbay/api test -- products.service.test.ts
```

预期：失败，因为 `ProductsService` 尚不存在。

- [ ] **步骤 3：实现 products module**

使用 class-validator 新增 DTO。`CreateProductDto` MUST 包含：

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

新增 `ProductsService`，包含：

- `create(user, dto)` restricted to admin or store manager.
- `list(user, query)` available to store members and admin.
- `update(user, id, dto)` restricted to admin or store manager.
- Soft delete by setting `status = INACTIVE`.

- [ ] **步骤 4：实现 controller 并注册 module**

Expose:

```text
POST /products
GET /products
GET /products/:id
PATCH /products/:id
DELETE /products/:id
```

Register `ProductsModule` in `apps/api/src/app.module.ts`.

- [ ] **步骤 5：运行测试和类型检查**

运行：

```bash
corepack pnpm --filter @mallbay/api test -- products.service.test.ts
corepack pnpm --filter @mallbay/api typecheck
```

预期：测试和类型检查通过。

- [ ] **步骤 6：提交**

```bash
git add apps/api/src/products apps/api/src/app.module.ts
git commit -m "feat: add product management api"
```

## 任务 5：订单与收款 API

**文件：**
- 新增：`apps/api/src/orders/`
- 修改：`apps/api/src/app.module.ts`
- 测试：`apps/api/src/orders/use-cases/create-order.use-case.test.ts`
- 测试：`apps/api/src/orders/orders.service.test.ts`

- [ ] **步骤 1：编写创建订单 use case 测试**

新增 `apps/api/src/orders/use-cases/create-order.use-case.test.ts`：

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

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
corepack pnpm --filter @mallbay/api test -- create-order.use-case.test.ts
```

预期：失败，因为 `CreateOrderUseCase` 尚不存在。

- [ ] **步骤 3：实现订单状态机**

新增 `apps/api/src/orders/domain/order-status.machine.ts`：

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

- [ ] **步骤 4：实现创建订单 use case**

新增 `apps/api/src/orders/use-cases/create-order.use-case.ts`，MUST 满足以下行为：

- 校验 `PermissionPolicy.canCreateOrder(user, dto.storeId)`。
- 校验客户属于当前门店。
- 传入 `vehicleId` 时校验车辆属于该客户。
- 校验产品存在且状态为 `ACTIVE`。
- Compute `productAmountCents`, `laborCostCents`, `totalAmountCents`, `paidAmountCents`, `outstandingCents`.
- 在一个 Prisma transaction 中创建 `Order`、`OrderItem`、`OrderAmount` 和可选的 `OrderPayment`。
- 通过注入的 `OrderNumberGenerator` 生成订单号。

Use this exact order-number interface:

```ts
export type OrderNumberGenerator = {
  next(): string;
};
```

- [ ] **步骤 5：实现 orders service 和 controller**

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

- [ ] **步骤 6：注册 module**

Register `OrdersModule` in `apps/api/src/app.module.ts`.

- [ ] **步骤 7：运行测试和类型检查**

运行：

```bash
corepack pnpm --filter @mallbay/api test -- create-order.use-case.test.ts
corepack pnpm --filter @mallbay/api test -- orders.service.test.ts
corepack pnpm --filter @mallbay/api typecheck
```

预期：测试和类型检查通过。

- [ ] **步骤 8：提交**

```bash
git add apps/api/src/orders apps/api/src/app.module.ts
git commit -m "feat: add order and payment api"
```

## 任务 6：共享类型与 Web API Client

**文件：**
- 修改：`packages/shared/src/index.ts`
- 新增：`apps/web/src/features/customers/api.ts`
- 新增：`apps/web/src/features/products/api.ts`
- 新增：`apps/web/src/features/orders/api.ts`
- 修改：`apps/web/src/lib/api.ts`
- 测试：`apps/web/src/features/orders/api.test.ts`

- [ ] **步骤 1：编写 Web API client 测试**

新增 `apps/web/src/features/orders/api.test.ts`：

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

- [ ] **步骤 2：运行测试并确认失败**

运行：

```bash
corepack pnpm --filter @mallbay/web test -- orders/api.test.ts
```

预期：失败，因为 `apps/web/src/features/orders/api.ts` 尚不存在。

- [ ] **步骤 3：新增共享类型**

修改 `packages/shared/src/index.ts`，导出：

```ts
export type CustomerType = "PERSONAL" | "COMPANY";
export type ProductCategory = "PPF" | "COLOR_FILM" | "HEAT_FILM" | "MODIFICATION" | "OTHER";
export type ConstructionType = "PPF" | "COLOR_FILM" | "HEAT_FILM" | "MODIFICATION" | "INSPECTION";
export type ConstructionLocation = "IN_STORE" | "OUTSIDE";
export type OrderStatus = "PENDING_DISPATCH" | "DISPATCHED" | "IN_CONSTRUCTION" | "COMPLETED" | "WARRANTIED" | "CANCELLED";
export type PaymentType = "DEPOSIT" | "BALANCE" | "FULL";
```

- [ ] **步骤 4：新增 Web API client**

新增 `apps/web/src/features/orders/api.ts`：

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

新增等价的 `customerApi` 和 `productApi` 模块，MUST 包含 `create`、`list`、`detail`、`update` 方法。

修改 `apps/web/src/lib/api.ts`，导出：

```ts
export { customerApi } from "../features/customers/api";
export { productApi } from "../features/products/api";
export { orderApi } from "../features/orders/api";
```

- [ ] **步骤 5：运行 Web 测试和类型检查**

运行：

```bash
corepack pnpm --filter @mallbay/web test
corepack pnpm --filter @mallbay/web typecheck
```

预期：测试和类型检查通过。

- [ ] **步骤 6：提交**

```bash
git add packages/shared/src/index.ts apps/web/src/features/customers apps/web/src/features/products apps/web/src/features/orders apps/web/src/lib/api.ts
git commit -m "feat: add phase one web api clients"
```

## 任务 7：Phase 1 Web 页面

**文件：**
- 新增：`apps/web/app/customers/page.tsx`
- 新增：`apps/web/app/customers/[id]/page.tsx`
- 新增：`apps/web/app/products/page.tsx`
- 新增：`apps/web/app/orders/page.tsx`
- 新增：`apps/web/app/orders/create/page.tsx`
- 新增：`apps/web/app/orders/[id]/page.tsx`

- [ ] **步骤 1：新增客户列表页**

新增 `apps/web/app/customers/page.tsx`，包含：

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

- [ ] **步骤 2：新增产品页**

新增 `apps/web/app/products/page.tsx`，MUST 包含产品列表、创建/编辑弹窗、启用/停用状态标签。

- [ ] **步骤 3：新增订单页**

Create:

- `apps/web/app/orders/page.tsx`: list with filters for date, status, customer, construction type.
- `apps/web/app/orders/create/page.tsx`: form for customer lookup, vehicle, products, construction type/location, appointment, labor cost, deposit.
- `apps/web/app/orders/[id]/page.tsx`: order detail with customer, products, amount, payment records.

The create page must call `customerApi.search`, `productApi.list`, and `orderApi.create`.

- [ ] **步骤 4：运行前端验证**

运行：

```bash
corepack pnpm --filter @mallbay/web typecheck
corepack pnpm --filter @mallbay/web test
```

预期：类型检查和测试通过。

- [ ] **步骤 5：提交**

```bash
git add apps/web/app/customers apps/web/app/products apps/web/app/orders
git commit -m "feat: add phase one management pages"
```

## 任务 8：Phase 1 文档与完整验证

**文件：**
- 新增：`docs/features/phase-1-customers-orders.md`
- 修改：`docs/README.md`

- [ ] **步骤 1：编写 Phase 1 功能说明**

新增 `docs/features/phase-1-customers-orders.md`：

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

- [ ] **步骤 2：更新文档索引**

在 `docs/README.md` 增加以下入口：

```md
- [features/phase-1-customers-orders.md](./features/phase-1-customers-orders.md)：Phase 1 客户、订单、产品和收款功能说明。
```

- [ ] **步骤 3：运行完整验证**

运行：

```bash
corepack pnpm --filter @mallbay/api test
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web test
corepack pnpm --filter @mallbay/web typecheck
corepack pnpm lint
git diff --check
```

预期：

- API tests pass.
- API typecheck passes.
- Web tests pass.
- Web typecheck passes.
- Lint has 0 errors. Existing warnings are acceptable only if unrelated and documented in the final handoff.
- `git diff --check` has no output.

- [ ] **步骤 4：提交**

```bash
git add docs/features/phase-1-customers-orders.md docs/README.md
git commit -m "docs: document phase one customer order flow"
```

## 自查清单

- [ ] The plan implements the optimized role model: administrator merges auditor/admin, `MANAGER` is store manager, `SCHEDULER` is construction supervisor.
- [ ] Phase 1 creates customers, vehicles, products, orders, order amounts, payment accounts, and order payments.
- [ ] Sales data scope is limited to owned customers and orders.
- [ ] Store managers can view and manage their store data.
- [ ] Finance can manage payments without gaining construction or inventory write access.
- [ ] All money fields use integer cents.
- [ ] Sensitive phone and VIN fields have hash fields for search.
- [ ] The plan does not implement Phase 2+ work such as dispatch, inventory stock deduction, warranty, after-sales, reports, invoices, rebates, or mini-program offline sync.
