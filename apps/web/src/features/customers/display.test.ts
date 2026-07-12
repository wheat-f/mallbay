import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getAfterSaleResponsibilityLabel,
  getAfterSaleStatusLabel,
  getCustomerAutoArchiveMetrics,
  getCustomerConsumptionTrendRows,
  getCustomerManualProfileCounts,
  getCustomerProfileNotes,
  getWarrantyStatusLabel
} from "./display";

test("getCustomerAutoArchiveMetrics reads generated archive summary fields", () => {
  assert.deepEqual(
    getCustomerAutoArchiveMetrics({
      archiveSummary: {
        consumption: {
          orderCount: 2,
          totalAmountCents: 120000,
          paidAmountCents: 100000,
          outstandingCents: 20000,
          constructionTypeDistribution: { PPF: 2 }
        },
        warranty: { activeCount: 1, expiredCount: 0, expiringSoonCount: 1 },
        afterSales: { totalCount: 3, openCount: 1, closedCount: 2, responsibilityDistribution: { MATERIAL: 1 } },
        systemTags: [{ code: "KEY_FOLLOW_UP", label: "重点关注客户" }]
      }
    }),
    {
      orderCount: 2,
      totalAmountCents: 120000,
      outstandingCents: 20000,
      activeWarrantyCount: 1,
      openAfterSaleCount: 1,
      systemTagLabels: ["重点关注客户"]
    }
  );
});

test("getCustomerManualProfileCounts reads manually maintained notes and tags", () => {
  assert.deepEqual(
    getCustomerManualProfileCounts({
      notes: [{ id: "note-1" }, { id: "note-2" }],
      tags: [{ id: "tag-1" }],
      vehicles: [{ id: "vehicle-1" }]
    }),
    { noteCount: 2, tagCount: 1, vehicleCount: 1 }
  );
});

test("getCustomerConsumptionTrendRows formats monthly customer consumption trend", () => {
  assert.deepEqual(
    getCustomerConsumptionTrendRows({
      archiveSummary: {
        consumption: {
          trend: [
            {
              month: "2026-01",
              orderCount: 2,
              totalAmountCents: 800_000,
              paidAmountCents: 600_000,
              outstandingCents: 200_000
            },
            {
              month: "2026-02",
              orderCount: 1,
              totalAmountCents: 400_000,
              paidAmountCents: 300_000,
              outstandingCents: 100_000
            }
          ]
        }
      }
    }),
    [
      {
        month: "2026-01",
        orderCountLabel: "2 次",
        totalAmountLabel: "¥8000.00",
        paidAmountLabel: "¥6000.00",
        outstandingAmountLabel: "¥2000.00",
        percentOfMax: 100
      },
      {
        month: "2026-02",
        orderCountLabel: "1 次",
        totalAmountLabel: "¥4000.00",
        paidAmountLabel: "¥3000.00",
        outstandingAmountLabel: "¥1000.00",
        percentOfMax: 50
      }
    ]
  );
});

test("getCustomerConsumptionTrendRows returns empty rows when no generated trend exists", () => {
  assert.deepEqual(getCustomerConsumptionTrendRows({}), []);
});

test("getCustomerProfileNotes separates preference requirement and communication notes", () => {
  assert.deepEqual(
    getCustomerProfileNotes({
      notes: [
        { id: "note-1", noteType: "COMMUNICATION", content: "电话沟通过施工时间", createdAt: "2026-06-01" },
        { id: "note-2", noteType: "PREFERENCE", content: "偏好工作日到店施工", createdAt: "2026-06-02" },
        { id: "note-3", noteType: "REQUIREMENT", content: "施工前需要拍全车照片", createdAt: "2026-06-03" },
        { id: "note-4", noteType: "PREFERENCE", content: "喜欢上午沟通", createdAt: "2026-06-04" }
      ]
    }),
    {
      preferences: [
        { id: "note-4", noteType: "PREFERENCE", content: "喜欢上午沟通", createdAt: "2026-06-04" },
        { id: "note-2", noteType: "PREFERENCE", content: "偏好工作日到店施工", createdAt: "2026-06-02" }
      ],
      requirements: [
        { id: "note-3", noteType: "REQUIREMENT", content: "施工前需要拍全车照片", createdAt: "2026-06-03" }
      ],
      communications: [
        { id: "note-1", noteType: "COMMUNICATION", content: "电话沟通过施工时间", createdAt: "2026-06-01" }
      ],
      latestPreference: { id: "note-4", noteType: "PREFERENCE", content: "喜欢上午沟通", createdAt: "2026-06-04" },
      latestRequirement: { id: "note-3", noteType: "REQUIREMENT", content: "施工前需要拍全车照片", createdAt: "2026-06-03" }
    }
  );
});

test("customer status display helpers format warranty and after-sale labels", () => {
  assert.equal(getWarrantyStatusLabel("ACTIVE"), "生效中");
  assert.equal(getWarrantyStatusLabel("EXPIRED"), "已过期");
  assert.equal(getAfterSaleStatusLabel("ASSIGNED"), "处理中");
  assert.equal(getAfterSaleResponsibilityLabel("CONSTRUCTION"), "施工方责任");
});
