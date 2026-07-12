import assert from "node:assert/strict";
import { test } from "node:test";
import { toCreateCustomerPayload, toCreateVehiclePayload, toCreateVehiclePayloads } from "./create-customer-form";

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
      phone: "13900139000",
      companyUsers: [
        { name: " 王五 ", phone: " 13800138001 ", note: " 用车人 " },
        { name: "   ", phone: "13800138002" }
      ]
    }),
    {
      storeId: "store-1",
      customerType: "COMPANY",
      companyName: "MallBay",
      contactPerson: "小明",
      phone: "13900139000",
      companyUsers: [{ name: "王五", phone: "13800138001", note: "用车人" }]
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

test("toCreateVehiclePayload builds a vehicle payload when vehicle info is provided", () => {
  assert.deepEqual(
    toCreateVehiclePayload("customer-1", {
      customerType: "PERSONAL",
      name: "小明",
      phone: "13800138000",
      carModel: "  宝马 5 系  ",
      carPlate: " 京A12345 ",
      vin: " LSVNV2182E2123456 ",
      carColor: " 白色 "
    }),
    {
      customerId: "customer-1",
      carModel: "宝马 5 系",
      carPlate: "京A12345",
      vin: "LSVNV2182E2123456",
      carColor: "白色"
    }
  );
});

test("toCreateVehiclePayload skips vehicle creation when no vehicle info is provided", () => {
  assert.equal(
    toCreateVehiclePayload("customer-1", {
      customerType: "PERSONAL",
      name: "小明",
      phone: "13800138000"
    }),
    undefined
  );
});

test("toCreateVehiclePayloads builds multiple vehicle payloads and skips empty drafts", () => {
  assert.deepEqual(
    toCreateVehiclePayloads("customer-1", {
      customerType: "PERSONAL",
      name: "小明",
      phone: "13800138000",
      vehicles: [
        { carModel: " 宝马 5 系 ", carPlate: " 京A12345 ", vin: " LSVNV2182E2123456 ", carColor: " 白色 " },
        { carModel: "   ", carPlate: "   " },
        { carModel: " 奥迪 A6 ", photoUrl: " https://example.com/car.jpg " }
      ]
    }),
    [
      {
        customerId: "customer-1",
        carModel: "宝马 5 系",
        carPlate: "京A12345",
        vin: "LSVNV2182E2123456",
        carColor: "白色"
      },
      {
        customerId: "customer-1",
        carModel: "奥迪 A6",
        photoUrl: "https://example.com/car.jpg"
      }
    ]
  );
});
