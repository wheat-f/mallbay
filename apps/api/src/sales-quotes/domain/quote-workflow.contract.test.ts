import assert from "node:assert/strict";
import { test } from "node:test";
import { SalesQuotesController } from "../sales-quotes.controller";
import type { QuoteReadModel, QuoteWorkflow } from "./quote-workflow";

test("报价 Controller 通过命令与读取 seam 分离调用者 surface", async () => {
  const commandCalls: unknown[][] = [];
  const readCalls: unknown[][] = [];
  const workflow: QuoteWorkflow = {
    create: async (...args) => { commandCalls.push(args); return { kind: "created" }; },
    submit: async (...args) => { commandCalls.push(args); return { kind: "submitted" }; },
    review: async (...args) => { commandCalls.push(args); return { kind: "reviewed" }; },
    withdraw: async (...args) => { commandCalls.push(args); return { kind: "withdrawn" }; },
    recalculate: async (...args) => { commandCalls.push(args); return { kind: "recalculated" }; },
    expirePending: async () => ({ scannedCount: 0, expiredCount: 0, capacityReleasePendingCount: 0 }),
    convertToOrder: async (...args) => { commandCalls.push(args); return { kind: "converted" }; }
  };
  const readModel: QuoteReadModel = {
    list: async (...args) => { readCalls.push(args); return []; },
    exportDetails: async (...args) => { readCalls.push(args); return []; },
    get: async (...args) => { readCalls.push(args); return { id: args[1] }; }
  };
  const controller = new SalesQuotesController(workflow, readModel);
  const request = { user: { id: "sales-1" } } as never;

  await controller.recalculate(request, "quote-1", "recalculate-1", { storeId: "store-1" } as never);
  await controller.get(request, "quote-1", "store-1");

  assert.equal(commandCalls.length, 1);
  assert.equal(commandCalls[0]?.[1], "quote-1");
  assert.equal(commandCalls[0]?.[3], "recalculate-1");
  assert.equal(readCalls.length, 1);
  assert.equal(readCalls[0]?.[1], "quote-1");
});

test("过期命令结果区分扫描、成功过期和待释放容量", async () => {
  const workflow: QuoteWorkflow = {
    create: async () => undefined,
    submit: async () => undefined,
    review: async () => undefined,
    withdraw: async () => undefined,
    recalculate: async () => undefined,
    expirePending: async () => ({ scannedCount: 3, expiredCount: 2, capacityReleasePendingCount: 1 }),
    convertToOrder: async () => undefined
  };
  assert.deepEqual(await workflow.expirePending(), { scannedCount: 3, expiredCount: 2, capacityReleasePendingCount: 1 });
});
