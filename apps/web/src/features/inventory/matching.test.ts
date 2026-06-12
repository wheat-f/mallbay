import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildInventoryAllocationRows,
  buildInventoryMatchRows,
  buildPurchaseRequirementFromShortages,
  filterInventoryBatches
} from "./matching";

test("buildInventoryMatchRows calculates required locked available and shortage quantities", () => {
  const rows = buildInventoryMatchRows({
    items: [
      {
        orderItem: {
          id: "item-1",
          productId: "product-1",
          quantity: 6,
          product: { unit: "ROLL", brand: "品牌1", name: "漆面保护膜", model: "PPF-100" },
          inventoryAllocations: [
            { lockedQuantity: 2, outboundQuantity: 0, status: "LOCKED" },
            { lockedQuantity: 1, outboundQuantity: 1, status: "OUTBOUND" }
          ]
        },
        availableBatches: [
          { id: "batch-1", batchNo: "B001", availableQuantity: 2 },
          { id: "batch-2", batchNo: "B002", availableQuantity: 1 }
        ]
      }
    ]
  });

  assert.deepEqual(rows[0], {
    orderItemId: "item-1",
    productId: "product-1",
    productLabel: "品牌：品牌1 / 名称：漆面保护膜 / 型号：PPF-100",
    requiredQuantity: 6,
    lockedQuantity: 2,
    availableQuantity: 3,
    shortageQuantity: 1,
    unit: "ROLL",
    availableBatches: [
      { id: "batch-1", batchNo: "B001", availableQuantity: 2 },
      { id: "batch-2", batchNo: "B002", availableQuantity: 1 }
    ]
  });
});

test("buildPurchaseRequirementFromShortages creates payload only for shortage rows", () => {
  assert.deepEqual(
    buildPurchaseRequirementFromShortages("store-1", "order-1", [
      {
        orderItemId: "item-1",
        productId: "product-1",
        productLabel: "产品1",
        requiredQuantity: 6,
        lockedQuantity: 2,
        availableQuantity: 3,
        shortageQuantity: 1,
        unit: "ROLL",
        availableBatches: []
      },
      {
        orderItemId: "item-2",
        productId: "product-2",
        productLabel: "产品2",
        requiredQuantity: 1,
        lockedQuantity: 1,
        availableQuantity: 0,
        shortageQuantity: 0,
        unit: "METER",
        availableBatches: []
      }
    ]),
    {
      storeId: "store-1",
      sourceOrderId: "order-1",
      items: [
        {
          productId: "product-1",
          orderItemId: "item-1",
          requiredQuantity: 1,
          requiredUnit: "ROLL"
        }
      ]
    }
  );
});

test("buildInventoryMatchRows does not expose technical product ids when product summary is missing", () => {
  const rows = buildInventoryMatchRows({
    items: [
      {
        orderItem: {
          id: "item-1",
          productId: "product-technical-id",
          quantity: 1,
          product: null,
          inventoryAllocations: []
        },
        availableBatches: []
      }
    ]
  });

  assert.equal(rows[0]?.productLabel, "产品未加载");
});

test("buildInventoryAllocationRows formats locked allocation batch trace", () => {
  assert.deepEqual(
    buildInventoryAllocationRows({
      items: [
        {
          orderItem: {
            id: "item-1",
            productId: "product-1",
            quantity: 2,
            product: { brand: "品牌1", name: "漆面保护膜", model: "PPF-100" },
            inventoryAllocations: [
              {
                id: "allocation-1",
                batchId: "batch-1",
                lockedQuantity: 2,
                outboundQuantity: 0,
                status: "LOCKED",
                batch: { batchNo: "B001" }
              },
              {
                id: "allocation-2",
                batchId: "batch-2",
                lockedQuantity: 1,
                outboundQuantity: 1,
                status: "OUTBOUND",
                batch: { batchNo: "B002" }
              }
            ]
          },
          availableBatches: []
        }
      ]
    }),
    [
      {
        id: "allocation-1",
        orderItemId: "item-1",
        productLabel: "品牌：品牌1 / 名称：漆面保护膜 / 型号：PPF-100",
        batchLabel: "B001",
        lockedQuantity: 2,
        outboundQuantity: 0,
        remainingQuantity: 2,
        status: "LOCKED"
      }
    ]
  );
});

test("buildInventoryAllocationRows does not expose technical batch ids when batch summary is missing", () => {
  const rows = buildInventoryAllocationRows({
    items: [
      {
        orderItem: {
          id: "item-1",
          productId: "product-technical-id",
          quantity: 1,
          product: null,
          inventoryAllocations: [
            {
              id: "allocation-1",
              batchId: "batch-technical-id",
              lockedQuantity: 1,
              outboundQuantity: 0,
              status: "LOCKED",
              batch: null
            }
          ]
        },
        availableBatches: []
      }
    ]
  });

  assert.equal(rows[0]?.productLabel, "产品未加载");
  assert.equal(rows[0]?.batchLabel, "批次未加载");
});

test("filterInventoryBatches filters candidate batches by scanned batch number", () => {
  assert.deepEqual(
    filterInventoryBatches(
      [
        { id: "batch-1", batchNo: "BOP001", availableQuantity: 20 },
        { id: "batch-2", batchNo: "PPF-2026-02", availableQuantity: 10 }
      ],
      "op001"
    ),
    [{ id: "batch-1", batchNo: "BOP001", availableQuantity: 20 }]
  );
  assert.deepEqual(
    filterInventoryBatches(
      [
        { id: "batch-1", batchNo: "BOP001", availableQuantity: 20 },
        { id: "batch-2", batchNo: "PPF-2026-02", availableQuantity: 10 }
      ],
      ""
    ),
    [
      { id: "batch-1", batchNo: "BOP001", availableQuantity: 20 },
      { id: "batch-2", batchNo: "PPF-2026-02", availableQuantity: 10 }
    ]
  );
});
