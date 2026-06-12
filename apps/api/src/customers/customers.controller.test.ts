import assert from "node:assert/strict";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";

test("CustomersController receives CustomersService through Nest injection", async () => {
  const customersService = {
    create: async (_user: unknown, storeId: string, dto: { phone: string }) => ({
      storeId,
      phone: dto.phone
    })
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [CustomersController],
    providers: [{ provide: CustomersService, useValue: customersService }]
  }).compile();

  const controller = moduleRef.get(CustomersController);
  const result = await controller.create(
    { user: { id: "user-1", username: "sales", isAuditor: false } } as never,
    {
      storeId: "store-1",
      customerType: "PERSONAL",
      name: "客户",
      phone: "13800138000"
    } as never
  );

  assert.deepEqual(result, { storeId: "store-1", phone: "13800138000" });
});
