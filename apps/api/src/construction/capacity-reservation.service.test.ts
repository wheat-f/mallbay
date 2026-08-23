import { test } from "node:test";
import assert from "node:assert/strict";
import { CapacityReservationService } from "./capacity-reservation.service";
import { CapacityReservationStatus, ConstructionLocation, ConstructionType } from "@prisma/client";

test("报价容量占位同步增加明细和 DailyCapacity 计数", async () => {
  const calls: unknown[] = [];
  const capacity = {
    id: "capacity-1",
    inStoreCapacity: 2,
    inStoreReserved: 0,
    outsideCapacity: 0,
    outsideReserved: 0,
    heatFilmCapacity: 0,
    heatFilmReserved: 0,
    inspectionCapacity: 0,
    inspectionReserved: 0
  };
  const tx = {
    capacityReservation: {
      findUnique: async () => null,
      create: async (args: unknown) => {
        calls.push(args);
        return { id: "reservation-1", status: CapacityReservationStatus.HELD };
      }
    },
    dailyCapacity: {
      findUnique: async () => capacity,
      updateMany: async (args: unknown) => {
        calls.push(args);
        return { count: 1 };
      }
    }
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
  const service = new CapacityReservationService(prisma as never);
  const result = await service.holdQuote({
    storeId: "store-1",
    quoteId: "quote-1",
    appointmentDate: "2026-07-16",
    constructionLocation: ConstructionLocation.IN_STORE,
    constructionType: ConstructionType.PPF,
    expiresAt: new Date("2026-07-16T01:00:00.000Z")
  });
  assert.equal(result?.status, CapacityReservationStatus.HELD);
  assert.equal(calls.length, 2);
  assert.deepEqual((calls[0] as { data: { inStoreReserved: { increment: number } } }).data.inStoreReserved, { increment: 1 });
});

test("驳回或过期容量占位会释放 DailyCapacity 计数", async () => {
  const calls: unknown[] = [];
  const reservation = {
    id: "reservation-1",
    dailyCapacityId: "capacity-1",
    constructionLocation: ConstructionLocation.IN_STORE,
    constructionType: ConstructionType.PPF,
    status: CapacityReservationStatus.HELD
  };
  const tx = {
    capacityReservation: {
      findUnique: async () => reservation,
      update: async (args: unknown) => {
        calls.push(args);
        return { ...reservation, status: CapacityReservationStatus.RELEASED };
      }
    },
    dailyCapacity: {
      findUnique: async () => ({ id: "capacity-1", inStoreReserved: 1, outsideReserved: 0, heatFilmReserved: 0, inspectionReserved: 0 }),
      update: async (args: unknown) => {
        calls.push(args);
        return undefined;
      }
    }
  };
  const prisma = { $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) };
  const service = new CapacityReservationService(prisma as never);
  await service.releaseQuote("quote-1", "REJECTED");
  assert.deepEqual((calls[0] as { data: { inStoreReserved: { decrement: number } } }).data.inStoreReserved, { decrement: 1 });
  assert.equal((calls[1] as { data: { status: CapacityReservationStatus } }).data.status, CapacityReservationStatus.RELEASED);
});

test("报价批准只允许 HELD 容量在事务内确认", async () => {
  const calls: unknown[] = [];
  const tx = {
    capacityReservation: {
      updateMany: async (args: unknown) => {
        calls.push(args);
        return { count: 1 };
      }
    }
  };
  const service = new CapacityReservationService({ $transaction: async (callback: (value: typeof tx) => unknown) => callback(tx) } as never);
  const result = await service.confirmQuoteWithin(tx as never, "quote-1");
  assert.equal(result.count, 1);
  assert.deepEqual((calls[0] as { where: unknown }).where, { quoteId: "quote-1", status: CapacityReservationStatus.HELD });
  assert.deepEqual((calls[0] as { data: unknown }).data, { status: CapacityReservationStatus.CONFIRMED });
});

test("报价批准在没有 HELD 容量时拒绝确认", async () => {
  const tx = { capacityReservation: { updateMany: async () => ({ count: 0 }) } };
  const service = new CapacityReservationService({} as never);
  await assert.rejects(() => service.confirmQuoteWithin(tx as never, "quote-missing"), /报价容量不存在或已被其他操作处理/);
});
