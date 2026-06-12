import assert from "node:assert/strict";
import { test } from "node:test";
import { toCreateCustomerPayload } from "./create-customer-form";

test("toCreateCustomerPayload builds a personal customer payload", () => {
  assert.deepEqual(
    toCreateCustomerPayload("store-1", {
      customerType: "PERSONAL",
      name: "  zhouqi  ",
      gender: "MALE",
      birthday: "2026-01-02",
      phone: "13800138000",
      wechat: "  zq-wx  ",
      referrerId: " referrer-1 "
    }),
    {
      storeId: "store-1",
      customerType: "PERSONAL",
      name: "zhouqi",
      gender: "MALE",
      birthday: "2026-01-02",
      phone: "13800138000",
      wechat: "zq-wx",
      referrerId: "referrer-1"
    }
  );
});

test("toCreateCustomerPayload builds a company customer payload", () => {
  assert.deepEqual(
    toCreateCustomerPayload("store-1", {
      customerType: "COMPANY",
      companyName: "  MallBay  ",
      contactPerson: "  小明  ",
      phone: "13900139000"
    }),
    {
      storeId: "store-1",
      customerType: "COMPANY",
      companyName: "MallBay",
      contactPerson: "小明",
      phone: "13900139000"
    }
  );
});

test("toCreateCustomerPayload formats a date picker birthday value", () => {
  assert.deepEqual(
    toCreateCustomerPayload("store-1", {
      customerType: "PERSONAL",
      name: "小明",
      birthday: { format: (pattern: string) => (pattern === "YYYY-MM-DD" ? "1990-05-06" : "unexpected") },
      phone: "13800138000"
    }),
    {
      storeId: "store-1",
      customerType: "PERSONAL",
      name: "小明",
      birthday: "1990-05-06",
      phone: "13800138000"
    }
  );
});
