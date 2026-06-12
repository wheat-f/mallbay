import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("create order page guides users to maintain payment accounts when recording deposit without accounts", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /无可用收款账户/);
  assert.match(pageSource, /请先到财务管理维护收款账户/);
  assert.match(pageSource, /\/finance/);
});

test("create order page uses a grouped layout with a side amount summary", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /create-order-layout/);
  assert.match(pageSource, /create-order-main/);
  assert.match(pageSource, /create-order-aside/);
  assert.match(pageSource, /title="订单金额汇总"/);
});

test("create order page loads store customers before typing a search keyword", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /queryKey: \["customer-search", storeId, customerKeyword\]/);
  assert.match(pageSource, /queryFn: \(\) => customerApi\.search\(storeId!, customerKeyword\)/);
  assert.match(pageSource, /enabled: Boolean\(storeId\)/);
  assert.doesNotMatch(pageSource, /customerKeyword\.length > 0/);
});

test("create order page can create payment accounts inline for deposits", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /新增收款账户/);
  assert.match(pageSource, /createPaymentAccountMutation/);
  assert.match(pageSource, /orderApi\.createPaymentAccount/);
  assert.match(pageSource, /\["payment-accounts", storeId\]/);
});

test("create order new customer modal includes profile fields aligned with customer management", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /name="gender"/);
  assert.match(pageSource, /label="性别"/);
  assert.match(pageSource, /name="birthday"/);
  assert.match(pageSource, /label="生日"/);
  assert.match(pageSource, /name="referrerId"/);
  assert.match(pageSource, /label="介绍人"/);
  assert.match(pageSource, /customerApi\.search\(storeId!, referrerKeyword\)/);
  assert.match(pageSource, /onSearch=\{setReferrerKeyword\}/);
});

test("create order new customer modal saves vehicle photo url", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /name="photoUrl"/);
  assert.match(pageSource, /label="车辆照片"/);
  assert.match(pageSource, /photoUrl: trimOptional\(photoUrl\)/);
});

test("create order new customer flow keeps the created customer when vehicle creation fails", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /vehicleCreated/);
  assert.match(pageSource, /客户已创建，但车辆创建失败/);
  assert.match(pageSource, /请在客户详情继续补车辆/);
  assert.match(pageSource, /resolveCreatedCustomerSelection\(result\.customer\)/);
});

test("create order customer history card exposes recent construction records", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /最近施工记录/);
  assert.match(pageSource, /recentConstructionRecords/);
  assert.match(pageSource, /qualityResult/);
  assert.match(pageSource, /actualMinutes/);
});

test("create order customer history card shows latest order status", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /customerHistory\.latestOrder\.status/);
  assert.match(pageSource, /最近订单：/);
});

test("create order page records labor cost adjustment reason when final labor differs from suggestion", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /suggestedLaborCostYuan/);
  assert.match(pageSource, /laborCostAdjustmentReason/);
  assert.match(pageSource, /调整施工人工费必须填写原因/);
  assert.match(pageSource, /建议人工费/);
});

test("create order page uses a time range picker for appointment time slot instead of free text input", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /TimePicker/);
  assert.match(pageSource, /<Form\.Item[\s\S]*name="appointmentTimeSlot"[\s\S]*normalize=\{formatOrderTimeSlotValue\}/);
  assert.match(pageSource, /<TimePicker\.RangePicker/);
  assert.match(pageSource, /placeholder=\{\["开始时间", "结束时间"\]\}/);
  assert.doesNotMatch(pageSource, /<Input placeholder="09:00-12:00"/);
  assert.doesNotMatch(pageSource, /APPOINTMENT_TIME_SLOT_OPTIONS/);
});
