import assert from "node:assert/strict";
import { test } from "node:test";
import { AfterSaleCostCategory, AfterSaleCostDirection, AfterSaleCostStatus, AfterSaleResponsibility, AfterSaleStatus, StorePosition } from "@prisma/client";
import { AfterSalesService } from "./after-sales.service";

const afterSalesAccess = {
  can: async (actorId: string, capability: string, action: string, context: { ownerId?: string } = {}) => {
    const role = actorId.startsWith("sales") ? "SALES"
      : actorId.startsWith("construction") ? "CONSTRUCTION"
        : actorId.startsWith("apprentice") ? "APPRENTICE"
          : actorId.startsWith("worker") ? "CONSTRUCTION"
          : actorId.startsWith("finance") ? "FINANCE"
            : actorId.startsWith("scheduler") ? "SCHEDULER"
              : actorId.startsWith("cs") ? "CUSTOMER_SERVICE" : "MANAGER";
    if (capability === "after-sales" && action === "read") return true;
    if (capability === "after-sales" && action === "write") {
      if (["MANAGER", "SCHEDULER", "CUSTOMER_SERVICE"].includes(role)) return true;
      return ["CONSTRUCTION", "APPRENTICE"].includes(role) && context.ownerId === actorId;
    }
    if (capability === "finance" && action === "write") return role === "FINANCE" || role === "MANAGER";
    if (capability === "store" && action === "write") return role === "MANAGER";
    return false;
  },
  resolve: async (actorId: string, context: { storeId?: string }) => ({
    userId: actorId,
    policyVersion: 1,
    bindingVersion: 1,
    roles: [{
      roleCode: actorId.startsWith("sales") ? "SALES" : actorId.startsWith("construction") ? "CONSTRUCTION" : actorId.startsWith("apprentice") || actorId.startsWith("worker") ? "APPRENTICE" : actorId.startsWith("finance") ? "FINANCE" : "MANAGER",
      roleName: "test",
      scopeType: "STORE",
      scopeIds: context.storeId ? [context.storeId] : []
    }],
    permissions: [],
    generatedAt: new Date().toISOString()
  })
};

test("AfterSalesService creates after-sale linked to order warranty customer and issue photo evidence", async () => {
  const writes: unknown[] = [];
  const prisma = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        customerId: "customer-1",
        warranty: { id: "warranty-1" }
      })
    },
    afterSale: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "after-sale-1", status: AfterSaleStatus.OPEN };
      }
    },
    afterSalePhoto: {
      createMany: async (args: unknown) => writes.push(args)
    }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never);

  const result = await service.create(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    {
      orderId: "order-1",
      description: "边角起翘",
      issuePhotos: [{ url: "https://img.example/issue-1.jpg", note: "左后门边角起翘" }]
    }
  );

  assert.equal(result.id, "after-sale-1");
  assert.equal(JSON.stringify(writes).includes("warranty-1"), true);
  assert.equal(JSON.stringify(writes).includes("customer-1"), true);
  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("issue-1.jpg"), true);
  assert.equal(serialized.includes("左后门边角起翘"), true);
  assert.equal(serialized.includes('"stage":"ISSUE"'), true);
  assert.equal(serialized.includes('"uploadedById":"scheduler-1"'), true);
});

test("AfterSalesService assigns workers and records responsibility category photo evidence and penalty", async () => {
  const writes: unknown[] = [];
  const prisma = {
    afterSale: {
      findUnique: async () => ({ id: "after-sale-1", storeId: "store-1", status: AfterSaleStatus.ASSIGNED }),
      update: async (args: unknown) => writes.push(args)
    },
    storeMember: {
      findUnique: async () => null,
      findMany: async () => [{ userId: "worker-1", position: StorePosition.CONSTRUCTION }]
    },
    afterSaleAssignment: {
      createMany: async (args: unknown) => writes.push(args)
    },
    penalty: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "penalty-1" };
      }
    },
    afterSalePhoto: {
      createMany: async (args: unknown) => writes.push(args)
    }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never);

  await service.assign(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    "after-sale-1",
    { workerUserIds: ["worker-1"] }
  );
  await service.judgeResponsibility(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "after-sale-1",
    {
      responsibility: AfterSaleResponsibility.CONSTRUCTION,
      constructionIssueCategory: "刀工问题",
      constructionPhotos: [{ url: "https://img.example/after-1.jpg", note: "返工后边角复查" }],
      supplementPhotos: [{ url: "https://img.example/supplement-1.jpg", note: "客户确认记录" }],
      penaltyWorkerUserId: "worker-1",
      penaltyAmountCents: 1000,
      penaltyReason: "返工处罚"
    }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes("worker-1"), true);
  assert.equal(serialized.includes(AfterSaleResponsibility.CONSTRUCTION), true);
  assert.equal(serialized.includes("刀工问题"), true);
  assert.equal(serialized.includes("after-1.jpg"), true);
  assert.equal(serialized.includes("supplement-1.jpg"), true);
  assert.equal(serialized.includes("返工后边角复查"), true);
  assert.equal(serialized.includes("客户确认记录"), true);
  assert.equal(serialized.includes('"stage":"CONSTRUCTION_AFTER"'), true);
  assert.equal(serialized.includes('"stage":"SUPPLEMENT"'), true);
  assert.equal(serialized.includes('"uploadedById":"manager-1"'), true);
  assert.equal(serialized.includes("\"amountCents\":1000"), true);
});

test("AfterSalesService lets assigned workers submit after-sale evidence only", async () => {
  const writes: unknown[] = [];
  const prisma = {
    afterSale: {
      findFirst: async (args: { where: { assignments?: { some?: { workerUserId?: string } } } }) => {
        if (args.where.assignments?.some?.workerUserId === "worker-1") {
          return { id: "after-sale-1", storeId: "store-1", status: AfterSaleStatus.ASSIGNED };
        }
        return null;
      }
    },
    afterSalePhoto: {
      findFirst: async () => undefined,
      createMany: async (args: unknown) => writes.push(args)
    }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never);

  await service.submitEvidence(
    {
      id: "worker-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
    },
    "after-sale-1",
    {
      constructionPhotos: [{ url: "data:image/png;base64,after", note: "施工后补拍" }],
      supplementPhotos: [{ url: "data:image/png;base64,confirm", note: "客户确认" }]
    }
  );

  const serialized = JSON.stringify(writes);
  assert.equal(serialized.includes('"stage":"CONSTRUCTION_AFTER"'), true);
  assert.equal(serialized.includes('"stage":"SUPPLEMENT"'), true);
  assert.equal(serialized.includes("施工后补拍"), true);
  assert.equal(serialized.includes("客户确认"), true);
  assert.equal(serialized.includes('"uploadedById":"worker-1"'), true);

  await assert.rejects(
    () =>
      service.submitEvidence(
        {
          id: "worker-2",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
        },
        "after-sale-1",
        { constructionPhotos: [{ url: "data:image/png;base64,other" }] }
      ),
    /售后单不存在/
  );
});

test("AfterSalesService lists after-sales with order customer vehicle warranty and normalized photo evidence", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never);

  await service.list(
    {
      id: "scheduler-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER }
    },
    { storeId: "store-1" }
  );

  const serialized = JSON.stringify(calls[0]);
  assert.match(serialized, /"order"/);
  assert.match(serialized, /"orderNo"/);
  assert.match(serialized, /"customer"/);
  assert.match(serialized, /"vehicle"/);
  assert.match(serialized, /"warranty"/);
  assert.match(serialized, /"photos"/);
  assert.match(serialized, /"stage"/);
  assert.match(serialized, /"uploadedBy"/);
  assert.match(serialized, /"note"/);
  assert.match(serialized, /"constructionIssueCategory"/);
});

test("AfterSalesService returns after-sale detail with assigned workers and penalty workers", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findFirst: async (args: unknown) => {
        calls.push(args);
        return { id: "after-sale-1", storeId: "store-1", status: AfterSaleStatus.ASSIGNED, assignments: [] };
      }
    }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never);

  await service.detail(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "after-sale-1"
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, { id: "after-sale-1", storeId: "store-1" });
  const serialized = JSON.stringify(calls[0]);
  assert.match(serialized, /"assignments"/);
  assert.match(serialized, /"worker"/);
  assert.match(serialized, /"username"/);
  assert.match(serialized, /"nickname"/);
  assert.match(serialized, /"penalties"/);
  assert.match(serialized, /"amountCents"/);
  assert.match(serialized, /"reason"/);
  assert.match(serialized, /"createdBy"/);
  assert.match(serialized, /"photos"/);
  assert.match(serialized, /"uploadedBy"/);
  assert.match(serialized, /"order"/);
  assert.match(serialized, /"customer"/);
  assert.match(serialized, /"vehicle"/);
});

test("AfterSalesService closes a resolved after-sale", async () => {
  const writes: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findUnique: async () => ({ id: "after-sale-1", storeId: "store-1", status: AfterSaleStatus.RESOLVED }),
      update: async (args: unknown) => {
        writes.push(args);
        return { id: "after-sale-1", status: AfterSaleStatus.CLOSED };
      }
    }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never);

  const result = await service.close(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "after-sale-1"
  );

  assert.equal(result.status, AfterSaleStatus.CLOSED);
  const serialized = JSON.stringify(writes[0]);
  assert.match(serialized, /"status":"CLOSED"/);
  assert.match(serialized, /"closedAt"/);
});

test("AfterSalesService limits construction workers to assigned after-sales", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never);

  await service.list(
    {
      id: "worker-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
    },
    { storeId: "store-1" }
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    assignments: { some: { workerUserId: "worker-1" } }
  });
});

test("AfterSalesService limits sales after-sales list to their own orders", async () => {
  const calls: unknown[] = [];
  const prisma = {
    storeMember: { findUnique: async () => null },
    afterSale: {
      findMany: async (args: unknown) => {
        calls.push(args);
        return [];
      }
    }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never);

  await service.list(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    { storeId: "store-1" }
  );

  assert.deepEqual((calls[0] as { where: unknown }).where, {
    storeId: "store-1",
    order: { salesPersonId: "sales-1" }
  });
});

test("AfterSalesService uploads after-sale evidence through object storage and persists the photo", async () => {
  const writes: unknown[] = [];
  const prisma = {
    afterSale: {
      findFirst: async () => ({ id: "after-sale-1", storeId: "store-1", status: AfterSaleStatus.ASSIGNED, assignments: [{ workerUserId: "worker-1" }] }),
      update: async (args: unknown) => writes.push(args)
    },
    afterSalePhoto: {
      create: async (args: unknown) => {
        writes.push(args);
        return { id: "photo-1", stage: "CONSTRUCTION_AFTER", url: "https://cdn.example/after.jpg" };
      }
    },
    auditEvent: {
      create: async (args: unknown) => writes.push(args)
    }
  };
  const oss = {
    uploadAfterSalePhoto: async (storeId: string, afterSaleId: string, file: { originalname: string }) => {
      assert.equal(storeId, "store-1");
      assert.equal(afterSaleId, "after-sale-1");
      assert.equal(file.originalname, "after.jpg");
      return "https://cdn.example/after.jpg";
    }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never, oss as never);

  const result = await service.uploadPhoto(
    {
      id: "worker-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.CONSTRUCTION }
    },
    "after-sale-1",
    { stage: "CONSTRUCTION_AFTER", note: "返工后复查" },
    { originalname: "after.jpg", mimetype: "image/jpeg", buffer: Buffer.from("jpg") }
  );

  assert.equal(result.url, "https://cdn.example/after.jpg");
  const serialized = JSON.stringify(writes);
  assert.match(serialized, /CONSTRUCTION_AFTER/);
  assert.equal(serialized.includes("https://cdn.example/after.jpg"), true);
  assert.match(serialized, /返工后复查/);
  assert.match(serialized, /AFTER_SALE_PHOTO_UPLOADED/);
});

test("售后费用按角色录入，确认后只能以红冲方式更正", async () => {
  const writes: unknown[] = [];
  const entry = {
    id: "cost-1",
    storeId: "store-1",
    afterSaleId: "after-sale-1",
    category: AfterSaleCostCategory.MATERIAL,
    direction: AfterSaleCostDirection.EXPENSE,
    amountCents: 12345,
    status: AfterSaleCostStatus.CONFIRMED
  };
  const prisma = {
    afterSale: { findUnique: async () => ({ id: "after-sale-1", storeId: "store-1" }) },
    paymentRecord: { findFirst: async () => ({ id: "payment-1" }) },
    afterSaleCostEntry: {
      create: async (args: unknown) => { writes.push(args); return entry; },
      findFirst: async () => entry,
      updateMany: async (args: unknown) => { writes.push(args); return { count: 1 }; }
    },
    $transaction: async (callback: (tx: unknown) => unknown) => callback({
      afterSaleCostEntry: {
        updateMany: async (args: unknown) => { writes.push(args); return { count: 1 }; },
        create: async (args: unknown) => { writes.push(args); return { id: "cost-reversal-1" }; }
      }
    }),
    auditEvent: { create: async (args: unknown) => writes.push(args) }
  };
  const service = new AfterSalesService(prisma as never, afterSalesAccess as never);
  const manager = { id: "manager-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.MANAGER } };
  const finance = { id: "finance-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.FINANCE } };

  await service.addCost(manager, "after-sale-1", { category: AfterSaleCostCategory.MATERIAL, amountCents: 12345, reason: "更换材料" });
  await assert.rejects(
    () => service.addCost(manager, "after-sale-1", { category: AfterSaleCostCategory.REFUND_COMPENSATION, amountCents: 100, reason: "客户退款" }),
    /仅财务/
  );
  await assert.rejects(
    () => service.addCost({ id: "scheduler-1", isAuditor: false, storeMember: { storeId: "store-1", position: StorePosition.SCHEDULER } }, "after-sale-1", { category: AfterSaleCostCategory.MATERIAL, amountCents: 100, reason: "更换材料" }),
    /仅店长/
  );
  await service.addCost(finance, "after-sale-1", { category: AfterSaleCostCategory.REFUND_COMPENSATION, amountCents: 100, reason: "客户退款" });
  await service.reverseCost(manager, "after-sale-1", "cost-1", { reason: "材料金额录入错误" });

  const serialized = JSON.stringify(writes);
  assert.match(serialized, /AFTER_SALE_COST_RECORDED/);
  assert.match(serialized, /AFTER_SALE_COST_REVERSED/);
  assert.match(serialized, /REVERSED/);
  assert.match(serialized, /RECOVERY/);
});
