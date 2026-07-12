import assert from "node:assert/strict";
import { test } from "node:test";
import { Test } from "@nestjs/testing";
import { CustomersController } from "./customers.controller";
import { CustomersService } from "./customers.service";
import { OssService } from "../users/oss.service";

test("CustomersController receives CustomersService through Nest injection", async () => {
  const customersService = {
    create: async (_user: unknown, storeId: string, dto: { phone: string }) => ({
      storeId,
      phone: dto.phone
    })
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [CustomersController],
    providers: [
      { provide: CustomersService, useValue: customersService },
      { provide: OssService, useValue: {} }
    ]
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

test("CustomersController uploads vehicle photos through OSS and returns the photo URL", async () => {
  const uploads: string[] = [];
  const customersService = {
    create: async () => ({})
  };
  const ossService = {
    uploadVehiclePhoto: async (userId: string, file: { originalname: string }) => {
      uploads.push(`${userId}:${file.originalname}`);
      return "http://localhost:3001/local-oss/vehicles/user-1/photo.jpg";
    }
  };
  const moduleRef = await Test.createTestingModule({
    controllers: [CustomersController],
    providers: [
      { provide: CustomersService, useValue: customersService },
      { provide: OssService, useValue: ossService }
    ]
  }).compile();

  const controller = moduleRef.get(CustomersController);
  const result = await controller.uploadVehiclePhoto(
    { user: { id: "user-1", username: "manager", isAuditor: false } } as never,
    { originalname: "vehicle.jpg", mimetype: "image/jpeg", buffer: Buffer.from("img") } as never
  );

  assert.deepEqual(uploads, ["user-1:vehicle.jpg"]);
  assert.deepEqual(result, { url: "http://localhost:3001/local-oss/vehicles/user-1/photo.jpg" });
});
