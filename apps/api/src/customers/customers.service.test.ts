import assert from "node:assert/strict";
import { test } from "node:test";
import { CustomerType, Gender, StorePosition } from "@prisma/client";
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
  });

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
