import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { CustomerAccount } from "./domain/customer-account";
import { CustomersModule } from "./customers.module";
import { CustomersService } from "./customers.service";

test("CustomerAccount exposes the complete customer and vehicle account seam", async () => {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const implementation = new Proxy({}, {
    get: (_target, property: string) => (...args: unknown[]) => {
      calls.push({ method: property, args });
      return Promise.resolve(property);
    }
  });
  const account = new CustomerAccount(implementation as never);
  const user = { id: "user-1" } as never;
  const customerDto = { name: "客户" } as never;
  const vehicleDto = { customerId: "customer-1" } as never;
  const vehicleQuery = { page: 1 } as never;
  const tagDto = { customerId: "customer-1", label: "重点" } as never;

  await account.createCustomer(user, "store-1", customerDto);
  await account.listCustomers(user, { storeId: "store-1" } as never);
  await account.searchCustomers(user, "store-1", "京A");
  await account.getCustomerSummary(user, "customer-1");
  await account.updateCustomer(user, "customer-1", { name: "新客户" } as never);
  await account.createVehicle(user, vehicleDto);
  await account.getVehicleSummary(user, "customer-1", vehicleQuery);
  await account.updateVehicle(user, "vehicle-1", vehicleDto);
  await account.changeVehicleStatus(user, "vehicle-1", "INACTIVE", { reason: "停用" } as never);
  await account.transferVehicle(user, "vehicle-1", { toCustomerId: "customer-2" } as never);
  await account.getVehicleHistory(user, "vehicle-1");
  await account.createCustomerUser(user, { customerId: "customer-1" } as never);
  await account.createCustomerNote(user, { customerId: "customer-1", content: "备注" } as never);
  await account.maintainManualTags(user, { operation: "create", dto: tagDto });
  await account.maintainManualTags(user, { operation: "delete", id: "tag-1" });

  assert.deepEqual(calls.map(({ method }) => method), [
    "create",
    "list",
    "search",
    "detail",
    "update",
    "createVehicle",
    "listVehicles",
    "updateVehicle",
    "changeVehicleStatus",
    "transferVehicle",
    "vehicleHistory",
    "createCustomerUser",
    "createNote",
    "createTag",
    "deleteTag"
  ]);
  assert.deepEqual(calls[8]?.args, [user, "vehicle-1", "INACTIVE", { reason: "停用" }]);
  assert.deepEqual(calls[13]?.args, [user, tagDto]);
  assert.deepEqual(calls[14]?.args, [user, "tag-1"]);
  assert.equal("orderContext" in account, false);
});

test("CustomersController routes account operations through CustomerAccount and leaves order context on CustomersService", () => {
  const source = readFileSync(path.join(__dirname, "customers.controller.ts"), "utf8");
  const customersCalls = source.match(/this\.customers\.\w+\(/g) ?? [];

  assert.deepEqual(customersCalls, ["this.customers.orderContext("]);
  for (const method of [
    "createCustomer",
    "listCustomers",
    "searchCustomers",
    "getCustomerSummary",
    "updateCustomer",
    "createVehicle",
    "getVehicleSummary",
    "createCustomerUser",
    "updateVehicle",
    "changeVehicleStatus",
    "transferVehicle",
    "getVehicleHistory",
    "createCustomerNote",
    "maintainManualTags"
  ]) {
    assert.match(source, new RegExp(`this\\.customerAccount\\.${method}\\(`));
  }
});

test("CustomersModule exports the CustomerAccount seam, not its compatibility implementation", () => {
  const exports = new Set((Reflect.getMetadata("exports", CustomersModule) ?? []) as unknown[]);
  assert.equal(exports.has(CustomerAccount), true);
  assert.equal(exports.has(CustomersService), false);
});
