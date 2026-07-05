import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AFTER_SALE_RESPONSIBILITY_OPTIONS,
  centsToYuan,
  getAfterSaleBusinessLabel,
  getAfterSaleOrderLabel,
  getAfterSalePenaltyRiskNote,
  getAfterSalePenaltyRows,
  getAfterSaleResponsibilityCards,
  getAfterSaleResponsibilityDescription,
  getAfterSaleResponsibilityLabel,
  getAfterSaleResponsiblePersonLabel,
  getAfterSaleStatusLabel,
  yuanToCents
} from "./display";

test("after-sale display helpers format statuses and responsibilities", () => {
  assert.equal(getAfterSaleStatusLabel("OPEN"), "待处理");
  assert.equal(getAfterSaleStatusLabel("ASSIGNED"), "处理中");
  assert.equal(getAfterSaleStatusLabel("RESOLVED"), "已完成");
  assert.equal(getAfterSaleStatusLabel("UNKNOWN"), "状态待确认");
  assert.equal(getAfterSaleResponsibilityLabel("CONSTRUCTION"), "施工方责任");
  assert.equal(getAfterSaleResponsibilityLabel("MATERIAL"), "原厂产品质量");
  assert.equal(getAfterSaleResponsibilityLabel("CUSTOMER"), "客户人为损坏");
  assert.equal(getAfterSaleResponsibilityLabel("PENDING"), "待判责");
  assert.equal(getAfterSaleResponsibilityLabel("UNKNOWN"), "责任待确认");
});

test("after-sale responsibility options exclude pending for manual judgement", () => {
  assert.deepEqual(AFTER_SALE_RESPONSIBILITY_OPTIONS, [
    { value: "CUSTOMER", label: "客户人为损坏" },
    { value: "CONSTRUCTION", label: "施工方责任" },
    { value: "MATERIAL", label: "原厂产品质量" },
    { value: "STORE", label: "门店服务责任" }
  ]);
});

test("after-sale responsibility detail helpers keep page copy data-driven", () => {
  assert.equal(getAfterSaleResponsibilityDescription("CONSTRUCTION"), "施工边角收口、环境落尘或工艺执行不到位导致。");
  assert.deepEqual(
    getAfterSaleResponsibilityCards("MATERIAL").map((item) => [item.value, item.title, item.active]),
    [
      ["CONSTRUCTION", "施工方责任", false],
      ["MATERIAL", "原厂产品质量", true],
      ["CUSTOMER", "客户人为损坏", false],
      ["STORE", "门店服务责任", false]
    ]
  );
  assert.equal(getAfterSaleResponsiblePersonLabel({ responsibility: "PENDING" }), "待责任判定");
  assert.equal(getAfterSaleResponsiblePersonLabel({ responsibility: "CUSTOMER" }), "不涉及施工技师处罚");
  assert.deepEqual(getAfterSalePenaltyRows({ responsibility: "CONSTRUCTION", constructionIssueCategory: "刀工问题", resolutionNote: "返工复检" }), [
    { key: "responsibility", label: "责任类型", value: "施工方责任" },
    { key: "category", label: "施工问题分类", value: "刀工问题" },
    { key: "resolution", label: "处理方案", value: "返工复检" }
  ]);
  assert.equal(getAfterSalePenaltyRiskNote({ responsibility: "PENDING" }), "完成责任判定后，再决定是否需要处罚、供应商追踪或客户沟通。");
});

test("after-sale money helpers convert penalty yuan values to cents", () => {
  assert.equal(yuanToCents(12.34), 1234);
  assert.equal(yuanToCents(0), 0);
  assert.equal(centsToYuan(1234), 12.34);
  assert.equal(centsToYuan(undefined), undefined);
});

test("after-sale display helpers use order business fields instead of technical ids", () => {
  const afterSale = {
    id: "after-sale-1",
    description: "边角起翘",
    status: "ASSIGNED",
    order: {
      orderNo: "ORD-003",
      customer: { companyName: null, personalName: "李雷", name: null },
      vehicle: { plateNo: "湘A30003" }
    }
  };

  assert.equal(getAfterSaleBusinessLabel(afterSale), "ORD-003 / 李雷 / 湘A30003 / 边角起翘 / 处理中");
  assert.equal(getAfterSaleOrderLabel(afterSale), "ORD-003 / 李雷 / 湘A30003");
});

test("getAfterSaleOrderLabel does not expose technical order ids when order summary is missing", () => {
  assert.equal(getAfterSaleOrderLabel({ orderId: "cm-order-technical-id", order: null }), "关联订单待确认");
});

test("getAfterSaleBusinessLabel does not expose after-sale technical ids", () => {
  assert.equal(getAfterSaleBusinessLabel({ id: "cm-after-sale-technical-id" }), "售后工单待确认");
});
