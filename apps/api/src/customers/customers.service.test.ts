import assert from "node:assert/strict";
import { test } from "node:test";
import { CustomerNoteType, CustomerType, Gender, StorePosition } from "@prisma/client";
import { CustomersService } from "./customers.service";

const customerAccess = {
  can: async (actor: { userId: string }, capability: string, action: string, context: { ownerId?: string } = {}) => {
    const userId = actor.userId;
    if (capability === "store" && action === "write") return userId.includes("manager") || userId.includes("admin");
    if (capability !== "customers") return true;
    if (action === "read") return true;
    return context.ownerId === userId || userId.includes("manager") || userId.includes("admin") || userId.includes("service");
  },
  scope: async (actor: { userId: string }, _capability: string, _action: string, _context: { storeId?: string }) => ({
    allowed: true,
    global: !actor.userId.includes("sales"),
    storeIds: ["store-1"],
    ...(actor.userId.includes("sales") ? { ownerId: actor.userId } : {})
  })
};

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
            customerType: CustomerType.PERSONAL,
            name: "张三",
            gender: Gender.UNKNOWN,
            birthday: undefined,
            companyName: undefined,
            contactPerson: undefined,
            phoneEncrypted: "enc:13800138000",
            phoneHash: "hash:13800138000",
            wechat: "wx-zhangsan",
            sourceType: "REFERRAL",
            sourceDetail: "老客户介绍",
            referrerId: undefined,
            users: undefined
          },
          include: { users: true }
        });
        return { id: "customer-1", name: "张三" };
      }
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  const result = await service.create(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    "store-1",
    {
      customerType: CustomerType.PERSONAL,
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

test("CustomersService creates company customer contacts with safe role defaults", async () => {
  const writes: unknown[] = [];
  const prisma = {
    customer: {
      findUnique: async () => null,
      create: async (args: unknown) => {
        writes.push(args);
        return {
          id: "customer-company-1",
          customerType: CustomerType.COMPANY,
          companyName: "企业客户",
          users: [{ id: "user-1", name: "王五", phoneEncrypted: "enc:13900139000", phoneHash: "hash:13900139000" }]
        };
      }
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  const result = await service.create(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    "store-1",
    {
      customerType: CustomerType.COMPANY,
      companyName: "企业客户",
      contactPerson: "王五",
      phone: "13800138000",
      companyUsers: [{ name: "王五", phone: "13900139000", note: "采购对接" }]
    }
  );

  const serialized = JSON.stringify(writes[0]);
  assert.equal(serialized.includes("\"users\":{\"create\":[{\"name\":\"王五\""), true);
  assert.equal(serialized.includes("\"role\":\"OTHER\""), true);
  assert.equal(serialized.includes("\"isDefault\":false"), true);
  assert.deepEqual(result, {
    id: "customer-company-1",
    customerType: CustomerType.COMPANY,
    companyName: "企业客户",
    users: [{ id: "user-1", name: "王五" }]
  });
});

test("CustomersService rejects duplicate phone in the same store", async () => {
  const service = new CustomersService({
    customer: {
      findUnique: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { storeId_phoneHash: { storeId: "store-1", phoneHash: "hash:13800138000" } }
        });
        return { id: "customer-1" };
      }
    }
  } as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  await assert.rejects(
    () =>
      service.create(
        {
          id: "sales-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.SALES }
        },
        "store-1",
        {
          customerType: CustomerType.PERSONAL,
          name: "张三",
          phone: "13800138000"
        }
      ),
    { name: "ConflictException" }
  );
});

test("CustomersService normalizes birthday strings before creating a customer", async () => {
  const prisma = {
    customer: {
      findUnique: async () => null,
      create: async (args: { data: { birthday?: Date } }) => {
        assert.equal(args.data.birthday instanceof Date, true);
        assert.equal(args.data.birthday?.toISOString().startsWith("1990-01-02"), true);
        return { id: "customer-1", birthday: args.data.birthday };
      }
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  await service.create(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    "store-1",
    {
      customerType: CustomerType.PERSONAL,
      name: "张三",
      phone: "13800138000",
      birthday: "1990-01-02" as never
    }
  );
});

test("CustomersService rejects invalid birthday before persistence", async () => {
  const service = new CustomersService({
    customer: {
      findUnique: async () => null,
      create: async () => {
        throw new Error("should not persist invalid birthday");
      }
    }
  } as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  await assert.rejects(
    () =>
      service.create(
        {
          id: "sales-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.SALES }
        },
        "store-1",
        {
          customerType: CustomerType.PERSONAL,
          name: "张三",
          phone: "13800138000",
          birthday: "not-a-date" as never
        }
      ),
    { name: "BadRequestException" }
  );
});

test("CustomersService rejects invalid customer basic information before persistence", async () => {
  const service = new CustomersService({
    customer: {
      findUnique: async () => {
        throw new Error("should not query duplicate phone for invalid payload");
      }
    }
  } as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);
  const user = {
    id: "sales-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: StorePosition.SALES }
  };

  await assert.rejects(
    () =>
      service.create(user, "store-1", {
        customerType: CustomerType.PERSONAL,
        name: "张三",
        phone: "1388S"
      }),
    { name: "BadRequestException" }
  );

  await assert.rejects(
    () =>
      service.create(user, "store-1", {
        customerType: CustomerType.PERSONAL,
        name: " ",
        phone: "13800138000"
      }),
    { name: "BadRequestException" }
  );
});

test("CustomersService search includes car plate and VIN hash conditions", async () => {
  const capturedWhere: unknown[] = [];
  const service = new CustomersService({
    customer: {
      findMany: async (args: { where: unknown }) => {
        capturedWhere.push(args.where);
        return [];
      }
    }
  } as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);
  const user = {
    id: "sales-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: StorePosition.SALES }
  };

  await service.search(user, "store-1", "湘A12345");
  await service.search(user, "store-1", "LSVNV2182E2123456");

  assert.deepEqual(capturedWhere, [
    {
      storeId: "store-1",
      ownerUserId: "sales-1",
      OR: [
        { name: { contains: "湘A12345", mode: "insensitive" } },
        { companyName: { contains: "湘A12345", mode: "insensitive" } },
        { contactPerson: { contains: "湘A12345", mode: "insensitive" } },
        { wechat: { contains: "湘A12345", mode: "insensitive" } },
        { vehicles: { some: { carPlate: { contains: "湘A12345", mode: "insensitive" } } } }
      ]
    },
    {
      storeId: "store-1",
      ownerUserId: "sales-1",
      OR: [
        { name: { contains: "LSVNV2182E2123456", mode: "insensitive" } },
        { companyName: { contains: "LSVNV2182E2123456", mode: "insensitive" } },
        { contactPerson: { contains: "LSVNV2182E2123456", mode: "insensitive" } },
        { wechat: { contains: "LSVNV2182E2123456", mode: "insensitive" } },
        { vehicles: { some: { carPlate: { contains: "LSVNV2182E2123456", mode: "insensitive" } } } },
        { vehicles: { some: { vinHash: "hash:LSVNV2182E2123456" } } }
      ]
    }
  ]);
});

test("CustomersService lets sales list and search only their own customers", async () => {
  const capturedWhere: unknown[] = [];
  const ownReadAccess = {
    can: async (actor: { userId: string }, capability: string, action: string, context: { ownerId?: string } = {}) => {
      if (capability !== "customers" || action !== "read") return true;
      return context.ownerId === actor.userId;
    },
    scope: async (actor: { userId: string }) => ({
      allowed: false,
      global: false,
      storeIds: ["store-1"],
      ownerId: actor.userId
    })
  };
  const service = new CustomersService({
    customer: {
      count: async (args: { where: unknown }) => {
        capturedWhere.push(args.where);
        return 0;
      },
      findMany: async (args: { where: unknown }) => {
        capturedWhere.push(args.where);
        return [];
      }
    }
  } as never, undefined, ownReadAccess as never);
  const user = { id: "sales-1" };

  await service.list(user, { storeId: "store-1", page: 1, pageSize: 20 });
  await service.search(user, "store-1", "权限回归测试");

  assert.deepEqual(capturedWhere, [
    { storeId: "store-1", ownerUserId: "sales-1" },
    { storeId: "store-1", ownerUserId: "sales-1" },
    {
      storeId: "store-1",
      ownerUserId: "sales-1",
      OR: [
        { name: { contains: "权限回归测试", mode: "insensitive" } },
        { companyName: { contains: "权限回归测试", mode: "insensitive" } },
        { contactPerson: { contains: "权限回归测试", mode: "insensitive" } },
        { wechat: { contains: "权限回归测试", mode: "insensitive" } },
        { vehicles: { some: { carPlate: { contains: "权限回归测试", mode: "insensitive" } } } }
      ]
    }
  ]);
});

test("CustomersService detail returns generated archive summary from orders warranties and after-sales", async () => {
  const amountAggregateArgs: unknown[] = [];
  const prisma = {
    customer: {
      findUnique: async () => ({
        id: "customer-1",
        storeId: "store-1",
        ownerUserId: "sales-1",
        customerType: CustomerType.PERSONAL,
        name: "张三",
        phoneEncrypted: "enc",
        phoneHash: "hash",
        vehicles: [],
        notes: [],
        orders: [],
        warranties: [
          {
            id: "warranty-1",
            status: "ACTIVE",
            endDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
          },
          {
            id: "warranty-2",
            status: "EXPIRED",
            endDate: new Date("2025-01-01T00:00:00.000Z")
          }
        ],
        afterSales: [
          { id: "after-sale-1", status: "OPEN", responsibility: "CONSTRUCTION" },
          { id: "after-sale-2", status: "CLOSED", responsibility: "MATERIAL" }
        ]
      })
    },
    order: {
      aggregate: async () => ({
        _count: { _all: 2 },
        _min: { createdAt: new Date("2026-01-01T00:00:00.000Z") },
        _max: { createdAt: new Date("2026-02-01T00:00:00.000Z") }
      }),
      groupBy: async () => [
        { constructionType: "PPF", _count: { _all: 1 } },
        { constructionType: "HEAT_FILM", _count: { _all: 1 } }
      ],
      findMany: async () => [
        {
          createdAt: new Date("2026-01-10T00:00:00.000Z"),
          amount: {
            totalAmountCents: 500_000,
            paidAmountCents: 300_000,
            outstandingCents: 200_000
          }
        },
        {
          createdAt: new Date("2026-01-20T00:00:00.000Z"),
          amount: {
            totalAmountCents: 300_000,
            paidAmountCents: 300_000,
            outstandingCents: 0
          }
        },
        {
          createdAt: new Date("2026-02-01T00:00:00.000Z"),
          amount: {
            totalAmountCents: 400_000,
            paidAmountCents: 300_000,
            outstandingCents: 100_000
          }
        }
      ]
    },
    orderAmount: {
      aggregate: async (args: unknown) => {
        amountAggregateArgs.push(args);
        return {
          _sum: {
            totalAmountCents: 1_200_000,
            paidAmountCents: 900_000,
            outstandingCents: 300_000
          }
        };
      }
    },
    constructionRecord: {
      findMany: async (args: unknown) => {
        assert.deepEqual(args, {
          where: { order: { customerId: "customer-1" } },
          orderBy: { completedAt: "desc" },
          take: 3,
          select: {
            status: true,
            completedAt: true,
            actualMinutes: true,
            qualityResult: true,
            order: {
              select: {
                orderNo: true,
                constructionType: true,
                vehicle: { select: { carPlate: true, carModel: true, carColor: true } }
              }
            }
          }
        });
        return [
          {
            status: "COMPLETED",
            completedAt: new Date("2026-02-10T08:00:00.000Z"),
            actualMinutes: 360,
            qualityResult: "PASS",
            order: {
              orderNo: "MB202602100001",
              constructionType: "PPF",
              vehicle: { carPlate: "湘A12345", carModel: "Model 3", carColor: "白色" }
            }
          }
        ];
      }
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  const result = await service.detail(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    "customer-1"
  );

  assert.deepEqual(result.archiveSummary.consumption, {
    orderCount: 2,
    totalAmountCents: 1_200_000,
    paidAmountCents: 900_000,
    outstandingCents: 300_000,
    constructionTypeDistribution: {
      PPF: 1,
      HEAT_FILM: 1
    },
    firstConsumedAt: new Date("2026-01-01T00:00:00.000Z"),
    latestConsumedAt: new Date("2026-02-01T00:00:00.000Z"),
    trend: [
      {
        month: "2026-01",
        orderCount: 2,
        totalAmountCents: 800_000,
        paidAmountCents: 600_000,
        outstandingCents: 200_000
      },
      {
        month: "2026-02",
        orderCount: 1,
        totalAmountCents: 400_000,
        paidAmountCents: 300_000,
        outstandingCents: 100_000
      }
    ]
  });
  assert.ok(amountAggregateArgs.some((args) => JSON.stringify(args) === JSON.stringify({
    where: { order: { customerId: "customer-1", status: { not: "CANCELLED" } } },
    _sum: {
      totalAmountCents: true,
      paidAmountCents: true,
      outstandingCents: true
    }
  })));
  assert.equal(result.archiveSummary.warranty.activeCount, 1);
  assert.equal(result.archiveSummary.warranty.expiredCount, 1);
  assert.equal(result.archiveSummary.warranty.expiringSoonCount, 1);
  assert.deepEqual(result.archiveSummary.afterSales.responsibilityDistribution, {
    CONSTRUCTION: 1,
    MATERIAL: 1
  });
  assert.deepEqual(result.archiveSummary.construction.recentRecords, [
    {
      orderNo: "MB202602100001",
      constructionType: "PPF",
      status: "COMPLETED",
      completedAt: new Date("2026-02-10T08:00:00.000Z"),
      actualMinutes: 360,
      qualityResult: "PASS",
      vehicleLabel: "湘A12345 / Model 3 / 白色"
    }
  ]);
  assert.deepEqual(
    result.archiveSummary.systemTags.map((tag) => tag.code),
    ["OLD_CUSTOMER", "HIGH_VALUE", "KEY_FOLLOW_UP"]
  );
});

test("CustomersService creates structured customer notes", async () => {
  const prisma = {
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerNote: {
      create: async (args: unknown) => {
        assert.deepEqual(args, {
          data: {
            customerId: "customer-1",
            createdById: "sales-1",
            noteType: CustomerNoteType.PREFERENCE,
            content: "喜欢工作日施工"
          }
        });
        return { id: "note-1" };
      }
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  const result = await service.createNote(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    {
      customerId: "customer-1",
      noteType: CustomerNoteType.PREFERENCE,
      content: "喜欢工作日施工"
    }
  );

  assert.deepEqual(result, { id: "note-1" });
});

test("CustomersService creates custom tags and rejects blank labels", async () => {
  const prisma = {
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerTag: {
      create: async (args: unknown) => {
        assert.deepEqual(args, {
          data: {
            customerId: "customer-1",
            createdById: "sales-1",
            label: "重点客户"
          }
        });
        return { id: "tag-1", label: "重点客户" };
      }
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);
  const user = {
    id: "sales-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: StorePosition.SALES }
  };

  await assert.rejects(
    () => service.createTag(user, { customerId: "customer-1", label: " " }),
    { name: "BadRequestException" }
  );
  const result = await service.createTag(user, { customerId: "customer-1", label: " 重点客户 " });

  assert.deepEqual(result, { id: "tag-1", label: "重点客户" });
});

test("CustomersService adds a user under an existing company customer", async () => {
  const writes: unknown[] = [];
  const tx = {
    customerUser: {
      updateMany: async (args: unknown) => {
        writes.push(args);
        return { count: 0 };
      },
      create: async (args: unknown) => {
        writes.push(args);
        return {
          id: "company-user-1",
          customerId: "customer-company-1",
          name: "李四",
          phoneEncrypted: "enc:13700137000",
          phoneHash: "hash:13700137000",
          note: "用车人"
        };
      }
    }
  };
  const prisma = {
    customer: {
      findUnique: async () => ({
        id: "customer-company-1",
        storeId: "store-1",
        ownerUserId: "sales-1",
        customerType: CustomerType.COMPANY
      })
    },
    $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx)
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  const result = await service.createCustomerUser(
    {
      id: "sales-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.SALES }
    },
    { customerId: "customer-company-1", name: "李四", phone: "13700137000", note: "用车人" }
  );

  assert.equal(JSON.stringify(writes[0]).includes("\"customerId\":\"customer-company-1\""), true);
  assert.deepEqual(result, {
    id: "company-user-1",
    customerId: "customer-company-1",
    name: "李四",
    note: "用车人"
  });
});

test("CustomersService lets finance read a paged vehicle list without edit permission", async () => {
  let capturedWhere: unknown;
  const prisma = {
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    customerVehicle: {
      count: async (args: { where: unknown }) => {
        capturedWhere = args.where;
        return 1;
      },
      findMany: async () => [{
        id: "vehicle-1",
        customerId: "customer-1",
        status: "ACTIVE",
        carPlate: "京A12345",
        carModel: "宝马5系",
        vinEncrypted: "secret",
        vinHash: "hash:vin",
        defaultContact: null,
        _count: { orders: 2 }
      }]
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  const result = await service.listVehicles(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    "customer-1",
    { q: "宝马", page: 2, pageSize: 10 }
  );

  assert.equal(result.total, 1);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 10);
  assert.equal("vinEncrypted" in result.items[0]!, false);
  assert.equal("vinHash" in result.items[0]!, false);
  assert.deepEqual(capturedWhere, {
    customerId: "customer-1",
    status: "ACTIVE",
    OR: [
      { carPlate: { contains: "宝马", mode: "insensitive" } },
      { carModel: { contains: "宝马", mode: "insensitive" } },
      { carColor: { contains: "宝马", mode: "insensitive" } },
      { department: { contains: "宝马", mode: "insensitive" } }
    ]
  });
});

test("CustomersService denies sales users from disabling vehicles", async () => {
  const prisma = {
    customerVehicle: {
      findUnique: async () => ({
        id: "vehicle-1",
        customerId: "customer-1",
        status: "ACTIVE",
        customer: { id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" }
      })
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  await assert.rejects(
    () => service.changeVehicleStatus(
      {
        id: "sales-1",
        isAuditor: false,
        storeMember: { storeId: "store-1", position: StorePosition.SALES }
      },
      "vehicle-1",
      "INACTIVE",
      { reason: "车辆暂不使用" }
    ),
    { name: "ForbiddenException", message: "仅店长可以停用、启用或转移车辆" }
  );
});

test("CustomersService rechecks duplicate identity before a manager enables a vehicle", async () => {
  let duplicateWhere: unknown;
  const vehicle = {
    id: "vehicle-1",
    customerId: "customer-1",
    status: "INACTIVE",
    carPlate: "京A12345",
    carPlateNormalized: "京A12345",
    vinHash: "hash:VIN001",
    carModel: "宝马5系",
    carColor: "黑色",
    vehicleTypeCode: "REGULAR",
    defaultContactId: null,
    department: null,
    customer: { id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" }
  };
  const prisma = {
    customerVehicle: {
      findUnique: async () => vehicle,
      findFirst: async (args: { where: unknown }) => {
        duplicateWhere = args.where;
        return { id: "vehicle-2", carPlate: "京A12345" };
      }
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  await assert.rejects(
    () => service.changeVehicleStatus(
      {
        id: "manager-1",
        isAuditor: false,
        storeMember: { storeId: "store-1", position: StorePosition.MANAGER }
      },
      "vehicle-1",
      "ACTIVE",
      { reason: "恢复使用" }
    ),
    { name: "ConflictException", message: "该门店已存在相同车牌号或 VIN 的车辆" }
  );
  assert.deepEqual(duplicateWhere, {
    storeId: "store-1",
    id: { not: "vehicle-1" },
    OR: [
      { carPlateNormalized: "京A12345" },
      { vinHash: "hash:VIN001" }
    ]
  });
});

test("CustomersService lets finance read vehicle ownership history", async () => {
  const prisma = {
    customerVehicle: {
      findUnique: async () => ({ id: "vehicle-1", customerId: "customer-1" })
    },
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-1" })
    },
    vehicleOwnershipHistory: {
      findMany: async () => [{ id: "history-1", action: "CREATE" }]
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  const history = await service.vehicleHistory(
    {
      id: "finance-1",
      isAuditor: false,
      storeMember: { storeId: "store-1", position: StorePosition.FINANCE }
    },
    "vehicle-1"
  );

  assert.deepEqual(history, [{ id: "history-1", action: "CREATE" }]);
});

test("CustomersService rejects sales editing another sales user's customer", async () => {
  const service = new CustomersService({
    customer: {
      findUnique: async () => ({ id: "customer-1", storeId: "store-1", ownerUserId: "sales-2" })
    }
  } as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  }, customerAccess as never);

  await assert.rejects(
    () =>
      service.update(
        {
          id: "sales-1",
          isAuditor: false,
          storeMember: { storeId: "store-1", position: StorePosition.SALES }
        },
        "customer-1",
        { name: "新名字" }
      ),
    { name: "ForbiddenException" }
  );
});
test("CustomersService includes in-transit orders in list consumption summaries", async () => {
  const prisma = {
    order: {
      findMany: async (args: unknown) => {
        assert.deepEqual(args, {
          where: {
            customerId: { in: ["customer-1"] },
            status: { not: "CANCELLED" }
          },
          select: {
            customerId: true,
            createdAt: true,
            amount: {
              select: {
                totalAmountCents: true,
                paidAmountCents: true,
                outstandingCents: true
              }
            }
          }
        });
        return [
          {
            customerId: "customer-1",
            createdAt: new Date("2026-07-01T00:00:00.000Z"),
            amount: { totalAmountCents: 800_000, paidAmountCents: 200_000, outstandingCents: 600_000 }
          },
          {
            customerId: "customer-1",
            createdAt: new Date("2026-07-02T00:00:00.000Z"),
            amount: { totalAmountCents: 300_000, paidAmountCents: 300_000, outstandingCents: 0 }
          }
        ];
      }
    }
  };
  const service = new CustomersService(prisma as never, {
    encrypt: (value: string) => `enc:${value}`,
    hash: (value: string) => `hash:${value}`
  });
  const attachSummaries = (service as unknown as {
    attachListConsumptionSummaries: (items: Array<{ id: string }>) => Promise<Array<{ archiveSummary?: { consumption?: { orderCount: number; totalAmountCents: number; outstandingCents: number } } }>>;
  }).attachListConsumptionSummaries.bind(service);

  const [result] = await attachSummaries([{ id: "customer-1" }]);
  assert.deepEqual(result.archiveSummary?.consumption, {
    orderCount: 2,
    totalAmountCents: 1_100_000,
    paidAmountCents: 500_000,
    outstandingCents: 600_000,
    trend: [
      {
        month: "2026-07",
        orderCount: 2,
        totalAmountCents: 1_100_000,
        paidAmountCents: 500_000,
        outstandingCents: 600_000
      }
    ]
  });
});
