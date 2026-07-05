import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { ConstructionType, OrderStatus, PaymentAccountType, PaymentType, StorePosition } from "@prisma/client";
import { OrdersService } from "./orders.service";

test("OrdersService detail includes item inventory allocations for fulfillment preview", async () => {
  const findUniqueCalls: unknown[] = [];
  const service = new OrdersService({
    storeMember: { findUnique: async () => null },
    order: {
      findUnique: async (args: unknown) => {
        findUniqueCalls.push(args);
        return {
          id: "order-1",
          storeId: "store-1",
          salesPersonId: "sales-1",
          items: [
            {
              id: "item-1",
              inventoryAllocations: [{ id: "allocation-1", status: "LOCKED" }]
            }
          ]
        };
      }
    }
  } as never, {} as never, { record: () => undefined } as never);

  const result = await service.detail(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "order-1"
  );

  assert.deepEqual(
    (findUniqueCalls[0] as { include: { items: { include: { inventoryAllocations: unknown } } } }).include.items.include
      .inventoryAllocations,
    true
  );
  assert.equal((result.items[0].inventoryAllocations[0] as { status: string }).status, "LOCKED");
});

test("OrdersService recalculates paid and outstanding amount after payment", async () => {
  const updates: unknown[] = [];
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        amount: { totalAmountCents: 5000000 }
      })
    },
    paymentAccount: {
      findUnique: async () => ({ id: "account-1", storeId: "store-1", isActive: true })
    },
    orderPayment: {
      create: async () => ({ id: "payment-1" }),
      aggregate: async () => ({ _sum: { amountCents: 1500000 } })
    },
    orderAmount: {
      update: async (args: unknown) => {
        updates.push(args);
      }
    }
  };
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  const result = await service.addPayment(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    "order-1",
    {
      accountId: "account-1",
      paymentType: PaymentType.BALANCE,
      amountCents: 1500000,
      paidAt: "2026-05-31T12:00:00.000Z"
    }
  );

  assert.deepEqual(result, { id: "payment-1" });
  assert.deepEqual(updates, [
    {
      where: { orderId: "order-1" },
      data: {
        paidAmountCents: 1500000,
        outstandingCents: 3500000
      }
    }
  ]);
});

test("OrdersService list applies construction date and payment filters", async () => {
  const capturedWhere: unknown[] = [];
  const prisma = {
    order: {
      count: async (args: { where: unknown }) => {
        capturedWhere.push(args.where);
        return 0;
      },
      findMany: async (args: { where: unknown }) => {
        capturedWhere.push(args.where);
        return [];
      }
    },
    storeMember: { findUnique: async () => null }
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  const result = await service.list(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    {
      storeId: "store-1",
      status: OrderStatus.PENDING_DISPATCH,
      constructionType: ConstructionType.PPF,
      paymentStatus: "PARTIAL",
      createdFrom: "2026-06-01",
      createdTo: "2026-06-05",
      page: 1,
      pageSize: 20
    } as never
  );

  assert.deepEqual(result, { total: 0, page: 1, pageSize: 20, items: [] });
  assert.deepEqual(capturedWhere, [
    {
      storeId: "store-1",
      status: OrderStatus.PENDING_DISPATCH,
      constructionType: ConstructionType.PPF,
      createdAt: {
        gte: new Date("2026-06-01T00:00:00.000Z"),
        lte: new Date("2026-06-05T23:59:59.999Z")
      },
      amount: {
        is: {
          paidAmountCents: { gt: 0 },
          outstandingCents: { gt: 0 }
        }
      }
    },
    {
      storeId: "store-1",
      status: OrderStatus.PENDING_DISPATCH,
      constructionType: ConstructionType.PPF,
      createdAt: {
        gte: new Date("2026-06-01T00:00:00.000Z"),
        lte: new Date("2026-06-05T23:59:59.999Z")
      },
      amount: {
        is: {
          paidAmountCents: { gt: 0 },
          outstandingCents: { gt: 0 }
        }
      }
    }
  ]);
});

test("OrdersService list includes vehicle amount and sales person summaries for operations tables", async () => {
  let capturedFindManyArgs: unknown;
  const prisma = {
    order: {
      count: async () => 0,
      findMany: async (args: unknown) => {
        capturedFindManyArgs = args;
        return [];
      }
    },
    storeMember: { findUnique: async () => null }
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  await service.list(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    { storeId: "store-1", page: 1, pageSize: 20 } as never
  );

  assert.deepEqual((capturedFindManyArgs as { include: unknown }).include, {
    customer: { select: { id: true, name: true, companyName: true, contactPerson: true } },
    vehicle: { select: { id: true, carPlate: true, carModel: true, carColor: true } },
    salesPerson: { select: { id: true, username: true, nickname: true } },
    amount: true
  });
});

test("OrdersService list includes VIN hash condition for 17 character vehicle searches", async () => {
  const capturedWhere: unknown[] = [];
  const prisma = {
    order: {
      count: async (args: { where: unknown }) => {
        capturedWhere.push(args.where);
        return 0;
      },
      findMany: async (args: { where: unknown }) => {
        capturedWhere.push(args.where);
        return [];
      }
    },
    storeMember: { findUnique: async () => null }
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  await service.list(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    {
      storeId: "store-1",
      q: "LSVNV2182E2123456",
      page: 1,
      pageSize: 20
    } as never
  );

  const expectedVinHash = createHash("sha256")
    .update("mallbay-dev-sensitive-key:LSVNV2182E2123456")
    .digest("hex");
  assert.deepEqual(capturedWhere[0], {
    storeId: "store-1",
    status: undefined,
    constructionType: undefined,
    OR: [
      { orderNo: { contains: "LSVNV2182E2123456", mode: "insensitive" } },
      { customer: { name: { contains: "LSVNV2182E2123456", mode: "insensitive" } } },
      { customer: { companyName: { contains: "LSVNV2182E2123456", mode: "insensitive" } } },
      { vehicle: { carPlate: { contains: "LSVNV2182E2123456", mode: "insensitive" } } },
      { vehicle: { vinHash: expectedVinHash } }
    ]
  });
});

test("OrdersService list includes phone hash condition for mobile searches", async () => {
  const capturedWhere: unknown[] = [];
  const prisma = {
    order: {
      count: async (args: { where: unknown }) => {
        capturedWhere.push(args.where);
        return 0;
      },
      findMany: async (args: { where: unknown }) => {
        capturedWhere.push(args.where);
        return [];
      }
    },
    storeMember: { findUnique: async () => null }
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  await service.list(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    {
      storeId: "store-1",
      q: "13800138000",
      page: 1,
      pageSize: 20
    } as never
  );

  const expectedPhoneHash = createHash("sha256")
    .update("mallbay-dev-sensitive-key:13800138000")
    .digest("hex");
  assert.deepEqual(capturedWhere[0], {
    storeId: "store-1",
    status: undefined,
    constructionType: undefined,
    OR: [
      { orderNo: { contains: "13800138000", mode: "insensitive" } },
      { customer: { name: { contains: "13800138000", mode: "insensitive" } } },
      { customer: { companyName: { contains: "13800138000", mode: "insensitive" } } },
      { vehicle: { carPlate: { contains: "13800138000", mode: "insensitive" } } },
      { customer: { phoneHash: expectedPhoneHash } }
    ]
  });
});

test("OrdersService requires a reason when updating payment accounts", async () => {
  const prisma = {
    paymentAccount: {
      findUnique: async () => ({ id: "account-1", storeId: "store-1" })
    },
    storeMember: { findUnique: async () => null }
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  await assert.rejects(
    () =>
      service.updatePaymentAccount(
        {
          id: "finance-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
        },
        "account-1",
        { name: "新账户", changeReason: " " } as never
      ),
    /修改收款账户必须填写原因/
  );
});

test("OrdersService records an audit event when updating payment accounts", async () => {
  const updates: unknown[] = [];
  const auditCreates: unknown[] = [];
  const auditEvents: unknown[] = [];
  const prisma = {
    paymentAccount: {
      findUnique: async () => ({
        id: "account-1",
        storeId: "store-1",
        name: "旧账户",
        type: "BANK",
        bankName: "旧银行",
        accountNo: "1234567890",
        isDefault: false,
        isActive: true
      }),
      update: async (args: unknown) => {
        updates.push(args);
        return { id: "account-1", name: "新账户" };
      }
    },
    auditEvent: {
      create: async (args: unknown) => auditCreates.push(args)
    },
    storeMember: { findUnique: async () => null }
  };
  const service = new OrdersService(
    prisma as never,
    {} as never,
    { record: (event: unknown) => auditEvents.push(event) } as never
  );

  const result = await service.updatePaymentAccount(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    "account-1",
    {
      name: "新账户",
      bankName: "新银行",
      isDefault: true,
      changeReason: "更换收款账户名称"
    } as never
  );

  assert.deepEqual(result, { id: "account-1", name: "新账户" });
  assert.deepEqual(updates, [
    {
      where: { id: "account-1" },
      data: {
        name: "新账户",
        bankName: "新银行",
        isDefault: true
      }
    }
  ]);
  assert.deepEqual(auditCreates, [
    {
      data: {
        action: "PAYMENT_ACCOUNT_UPDATED",
        actorId: "finance-1",
        targetType: "paymentAccount",
        targetId: "account-1",
        storeId: "store-1",
        metadata: {
          storeId: "store-1",
          reason: "更换收款账户名称",
          changedFields: ["name", "bankName", "isDefault"],
          before: {
            name: "旧账户",
            bankName: "旧银行",
            isDefault: false
          },
          after: {
            name: "新账户",
            bankName: "新银行",
            isDefault: true
          }
        }
      }
    }
  ]);
  assert.deepEqual(auditEvents, [
    {
      action: "PAYMENT_ACCOUNT_UPDATED",
      actorId: "finance-1",
      targetType: "paymentAccount",
      targetId: "account-1",
      metadata: {
        storeId: "store-1",
        reason: "更换收款账户名称",
        changedFields: ["name", "bankName", "isDefault"],
        before: {
          name: "旧账户",
          bankName: "旧银行",
          isDefault: false
        },
        after: {
          name: "新账户",
          bankName: "新银行",
          isDefault: true
        }
      }
    }
  ]);
});

test("OrdersService returns actor summary for order audit events", async () => {
  const prisma = {
    order: {
      findUnique: async () => ({ storeId: "store-1", salesPersonId: "sales-1" })
    },
    auditEvent: {
      findMany: async () => [
        {
          id: "audit-1",
          action: "ORDER_COMMERCIALS_UPDATED",
          actorId: "sales-1",
          createdAt: new Date("2026-06-06T00:00:00.000Z")
        }
      ]
    },
    user: {
      findMany: async () => [
        { id: "sales-1", username: "zhouqi", nickname: "周琪" }
      ]
    }
  };
  const service = new OrdersService(prisma as never, {} as never, {} as never);

  const result = await service.listAuditEvents(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    "order-1"
  );

  assert.deepEqual(result, [
    {
      id: "audit-1",
      action: "ORDER_COMMERCIALS_UPDATED",
      actorId: "sales-1",
      actor: { id: "sales-1", username: "zhouqi", nickname: "周琪" },
      createdAt: new Date("2026-06-06T00:00:00.000Z")
    }
  ]);
});

test("OrdersService returns actor summary for payment account audit events", async () => {
  const prisma = {
    paymentAccount: {
      findUnique: async () => ({ storeId: "store-1" })
    },
    auditEvent: {
      findMany: async () => [
        {
          id: "audit-1",
          action: "PAYMENT_ACCOUNT_UPDATED",
          actorId: "finance-1",
          createdAt: new Date("2026-06-06T00:00:00.000Z")
        }
      ]
    },
    user: {
      findMany: async () => [
        { id: "finance-1", username: "caiwu", nickname: "财务" }
      ]
    }
  };
  const service = new OrdersService(prisma as never, {} as never, {} as never);

  const result = await service.listPaymentAccountAuditEvents(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    "account-1"
  );

  assert.deepEqual(result, [
    {
      id: "audit-1",
      action: "PAYMENT_ACCOUNT_UPDATED",
      actorId: "finance-1",
      actor: { id: "finance-1", username: "caiwu", nickname: "财务" },
      createdAt: new Date("2026-06-06T00:00:00.000Z")
    }
  ]);
});

test("OrdersService lets same-store sales create payment accounts from the order flow", async () => {
  const creates: unknown[] = [];
  const prisma = {
    paymentAccount: {
      create: async (args: unknown) => {
        creates.push(args);
        return { id: "account-1", name: "门店微信" };
      }
    },
    storeMember: { findUnique: async () => null }
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  const result = await service.createPaymentAccount(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    {
      storeId: "store-1",
      name: "门店微信",
      type: PaymentAccountType.WECHAT,
      accountNo: "wx-store-1",
      isDefault: true
    }
  );

  assert.deepEqual(result, { id: "account-1", name: "门店微信" });
  assert.deepEqual(creates, [
    {
      data: {
        storeId: "store-1",
        name: "门店微信",
        type: PaymentAccountType.WECHAT,
        bankName: undefined,
        accountNo: "wx-store-1",
        isDefault: true,
        isActive: true
      }
    }
  ]);
});

test("OrdersService updates order commercial fields and records audit trail", async () => {
  const operations: unknown[] = [];
  const auditEvents: unknown[] = [];
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        salesPersonId: "sales-1",
        status: OrderStatus.PENDING_DISPATCH,
        remark: "旧备注",
        items: [
          {
            productId: "product-old",
            quantity: 1,
            unitPriceCents: 1000,
            amountCents: 1000
          }
        ],
        amount: {
          productAmountCents: 1000,
          laborCostCents: 200,
          totalAmountCents: 1200,
          paidAmountCents: 300,
          outstandingCents: 900,
          materialCostCents: 100,
          salesCommissionCents: 50,
          profitCents: 1050
        }
      }),
      update: async (args: unknown) => {
        operations.push({ orderUpdate: args });
      }
    },
    product: {
      findMany: async () => [
        { id: "product-new", storeId: "store-1", status: "ACTIVE" }
      ]
    },
    orderItem: {
      deleteMany: async (args: unknown) => operations.push({ itemDeleteMany: args }),
      createMany: async (args: unknown) => operations.push({ itemCreateMany: args })
    },
    orderAmount: {
      update: async (args: unknown) => operations.push({ amountUpdate: args })
    },
    auditEvent: {
      create: async (args: unknown) => operations.push({ auditCreate: args })
    }
  };
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const service = new OrdersService(
    prisma as never,
    {} as never,
    { record: (event: unknown) => auditEvents.push(event) } as never
  );

  const result = await service.updateCommercials(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    "order-1",
    {
      items: [{ productId: "product-new", quantity: 2, unitPriceCents: 500 }],
      laborCostCents: 400,
      remark: "新备注",
      changeReason: "客户调整施工产品"
    }
  );

  assert.deepEqual(result, { id: "order-1" });
  assert.deepEqual(operations, [
    { itemDeleteMany: { where: { orderId: "order-1" } } },
    {
      itemCreateMany: {
        data: [
          {
            orderId: "order-1",
            productId: "product-new",
            quantity: 2,
            unitPriceCents: 500,
            amountCents: 1000
          }
        ]
      }
    },
    {
      amountUpdate: {
        where: { orderId: "order-1" },
        data: {
          productAmountCents: 1000,
          laborCostCents: 400,
          totalAmountCents: 1400,
          outstandingCents: 1100,
          profitCents: 1250
        }
      }
    },
    {
      orderUpdate: {
        where: { id: "order-1" },
        data: { remark: "新备注" }
      }
    },
    {
      auditCreate: {
        data: {
          action: "ORDER_COMMERCIALS_UPDATED",
          actorId: "sales-1",
          targetType: "order",
          targetId: "order-1",
          storeId: "store-1",
          metadata: {
            storeId: "store-1",
            reason: "客户调整施工产品",
            before: {
              items: [{ productId: "product-old", quantity: 1, unitPriceCents: 1000, amountCents: 1000 }],
              amount: {
                productAmountCents: 1000,
                laborCostCents: 200,
                totalAmountCents: 1200,
                paidAmountCents: 300,
                outstandingCents: 900,
                materialCostCents: 100,
                salesCommissionCents: 50,
                profitCents: 1050
              },
              remark: "旧备注"
            },
            after: {
              items: [{ productId: "product-new", quantity: 2, unitPriceCents: 500, amountCents: 1000 }],
              amount: {
                productAmountCents: 1000,
                laborCostCents: 400,
                totalAmountCents: 1400,
                paidAmountCents: 300,
                outstandingCents: 1100,
                materialCostCents: 100,
                salesCommissionCents: 50,
                profitCents: 1250
              },
              remark: "新备注"
            }
          }
        }
      }
    }
  ]);
  assert.deepEqual(auditEvents, [
    {
      action: "ORDER_COMMERCIALS_UPDATED",
      actorId: "sales-1",
      targetType: "order",
      targetId: "order-1",
      metadata: {
        storeId: "store-1",
        reason: "客户调整施工产品",
        before: {
          items: [{ productId: "product-old", quantity: 1, unitPriceCents: 1000, amountCents: 1000 }],
          amount: {
            productAmountCents: 1000,
            laborCostCents: 200,
            totalAmountCents: 1200,
            paidAmountCents: 300,
            outstandingCents: 900,
            materialCostCents: 100,
            salesCommissionCents: 50,
            profitCents: 1050
          },
          remark: "旧备注"
        },
        after: {
          items: [{ productId: "product-new", quantity: 2, unitPriceCents: 500, amountCents: 1000 }],
          amount: {
            productAmountCents: 1000,
            laborCostCents: 400,
            totalAmountCents: 1400,
            paidAmountCents: 300,
            outstandingCents: 1100,
            materialCostCents: 100,
            salesCommissionCents: 50,
            profitCents: 1250
          },
          remark: "新备注"
        }
      }
    }
  ]);
});

test("OrdersService returns an active order to pending dispatch before commercial edits", async () => {
  const operations: unknown[] = [];
  const auditEvents: unknown[] = [];
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        salesPersonId: "sales-1",
        status: OrderStatus.IN_CONSTRUCTION
      }),
      update: async (args: unknown) => {
        operations.push({ orderUpdate: args });
        return { id: "order-1", status: OrderStatus.PENDING_DISPATCH };
      }
    },
    auditEvent: {
      create: async (args: unknown) => operations.push({ auditCreate: args })
    }
  };
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const service = new OrdersService(
    prisma as never,
    {} as never,
    { record: (event: unknown) => auditEvents.push(event) } as never
  );

  const result = await service.returnToPendingDispatch(
    {
      id: "manager-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
    },
    "order-1",
    { reason: "客户改产品，退回修改" }
  );

  assert.deepEqual(result, { id: "order-1", status: OrderStatus.PENDING_DISPATCH });
  const serialized = JSON.stringify(operations);
  assert.match(serialized, /"status":"PENDING_DISPATCH"/);
  assert.match(serialized, /ORDER_RETURNED_TO_PENDING_DISPATCH/);
  assert.match(serialized, /客户改产品，退回修改/);
  assert.deepEqual(auditEvents.map((event) => (event as { action: string }).action), ["ORDER_RETURNED_TO_PENDING_DISPATCH"]);
});

test("OrdersService lists order audit events with the same order visibility boundary", async () => {
  const capturedQueries: unknown[] = [];
  const prisma = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        salesPersonId: "sales-1"
      })
    },
    auditEvent: {
      findMany: async (args: unknown) => {
        capturedQueries.push(args);
        return [{ id: "audit-1", action: "ORDER_COMMERCIALS_UPDATED" }];
      }
    },
    storeMember: { findUnique: async () => null }
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  const result = await service.listAuditEvents(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    "order-1"
  );

  assert.deepEqual(result, [{ id: "audit-1", action: "ORDER_COMMERCIALS_UPDATED" }]);
  assert.deepEqual(capturedQueries, [
    {
      where: { targetType: "order", targetId: "order-1" },
      orderBy: { createdAt: "desc" },
      take: 50
    }
  ]);
});

test("OrdersService lists payment account audit events with payment management visibility", async () => {
  const capturedQueries: unknown[] = [];
  const prisma = {
    paymentAccount: {
      findUnique: async () => ({ id: "account-1", storeId: "store-1" })
    },
    auditEvent: {
      findMany: async (args: unknown) => {
        capturedQueries.push(args);
        return [{ id: "audit-1", action: "PAYMENT_ACCOUNT_UPDATED" }];
      }
    },
    storeMember: { findUnique: async () => null }
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  const result = await service.listPaymentAccountAuditEvents(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    "account-1"
  );

  assert.deepEqual(result, [{ id: "audit-1", action: "PAYMENT_ACCOUNT_UPDATED" }]);
  assert.deepEqual(capturedQueries, [
    {
      where: { targetType: "paymentAccount", targetId: "account-1" },
      orderBy: { createdAt: "desc" },
      take: 50
    }
  ]);
});

test("OrdersService rejects commercial updates after dispatch", async () => {
  const tx = {
    order: {
      findUnique: async () => ({
        id: "order-1",
        storeId: "store-1",
        salesPersonId: "sales-1",
        status: OrderStatus.DISPATCHED,
        items: [],
        amount: { paidAmountCents: 0 }
      })
    }
  };
  const prisma = {
    storeMember: { findUnique: async () => null },
    $transaction: async (fn: (transaction: typeof tx) => Promise<unknown>) => fn(tx)
  };
  const service = new OrdersService(prisma as never, {} as never, { record: () => undefined } as never);

  await assert.rejects(
    () =>
      service.updateCommercials(
        {
          id: "sales-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.SALES }
        },
        "order-1",
        {
          items: [{ productId: "product-new", quantity: 1, unitPriceCents: 500 }],
          laborCostCents: 0,
          changeReason: "客户调整施工产品"
        }
      ),
    /已进入履约的订单不能直接修改明细/
  );
});
