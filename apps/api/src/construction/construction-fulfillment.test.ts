import assert from "node:assert/strict";
import { test } from "node:test";
import { ConstructionFulfillment } from "./construction-fulfillment";

test("fulfillment detail includes construction photo purpose for UI grouping", async () => {
  let selectedPurpose = false;
  const fulfillment = new ConstructionFulfillment(
    {} as never,
    {} as never,
    {
      getLifecycle: () => ({}) as never,
      getAuthoritativeLifecycle: async () => ({ capabilities: {} }) as never
    } as never,
    {
      order: {
        findUnique: async (args: { select: { constructionRecord: { select: { photos: { select: { purpose?: boolean } } } } } }) => {
          selectedPurpose = args.select.constructionRecord.select.photos.select.purpose === true;
          return {
            id: "order-1",
            orderNo: "ORD-1",
            storeId: "store-1",
            executionStoreId: "store-1",
            status: "IN_CONSTRUCTION",
            lifecycleVersion: 2,
            appointmentDate: null,
            appointmentTimeSlot: null,
            constructionLocation: "IN_STORE",
            constructionAddress: null,
            constructionType: "PAINT_PROTECTION_FILM",
            customer: null,
            vehicle: null,
            amount: null,
            inventoryAllocations: [],
            warranty: null,
            constructionRecord: {
              id: "record-1",
              status: "IN_CONSTRUCTION",
              startedAt: null,
              completedAt: null,
              actualMinutes: null,
              overtimeMinutes: null,
              qualityResult: null,
              qualityNote: null,
              qualityCheckedAt: null,
              photos: [{
                id: "photo-1",
                stage: "BEFORE",
                purpose: "INSPECTION",
                url: "https://test.invalid/photo.png",
                uploadedById: "worker-1",
                status: "APPLIED"
              }],
              assignments: [{ workerUserId: "worker-1" }]
            }
          };
        }
      }
    } as never,
    { can: async () => true } as never
  );

  const result = await fulfillment.getFulfillmentView({ id: "worker-1" } as never, "order-1");

  assert.equal(selectedPurpose, true);
  assert.equal(result.construction?.photos[0]?.purpose, "INSPECTION");
});
