import assert from "node:assert/strict";
import { test } from "node:test";
import { SalesQuotesService } from "./sales-quotes.service";

test("报价过期任务只把仍待审批的报价标记为过期并释放对应占位", async () => {
  const released: string[] = [];
  const statuses: string[] = [];
  const prisma = {
    salesQuote: {
      findMany: async () => [{ id: "quote-1" }, { id: "quote-2" }],
      updateMany: async ({ where }: { where: { id: string } }) => {
        statuses.push(where.id);
        return { count: where.id === "quote-1" ? 1 : 0 };
      }
    }
  };
  const capacity = { releaseQuote: async (id: string) => { released.push(id); return undefined; } };
  const service = new SalesQuotesService(prisma as never, capacity as never, {} as never);
  const result = await service.expirePending(new Date("2026-07-16T00:00:00.000Z"));
  assert.equal(result, 2);
  assert.deepEqual(statuses, ["quote-1", "quote-2"]);
  assert.deepEqual(released, ["quote-1"]);
});

test("报价重复转单返回既有订单而不是再次创建", async () => {
  const prisma = {
    salesQuote: {
      findFirst: async () => ({
        id: "quote-1",
        storeId: "store-1",
        salesPersonId: "user-1",
        status: "CONVERTED",
        convertedOrderId: "order-1",
        validUntil: new Date("2026-07-17T00:00:00.000Z"),
        items: [],
        capacityReservation: null
      })
    }
  };
  let created = false;
  const service = new SalesQuotesService(
    prisma as never,
    {} as never,
    { execute: async () => { created = true; return { id: "order-2" }; } } as never
  );
  const result = await service.convertToOrder({
    id: "user-1",
    isAuditor: false,
    storeMember: { storeId: "store-1", position: "MANAGER" }
  } as never, "quote-1");
  assert.deepEqual(result, { orderId: "order-1", quoteId: "quote-1" });
  assert.equal(created, false);
});
