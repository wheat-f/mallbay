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

test("create order page follows the prototype step card structure", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /OrderStepTitle/);
  assert.match(pageSource, /step=\{1\} title="客户与车辆"/);
  assert.match(pageSource, /step=\{2\} title="施工预约"/);
  assert.match(pageSource, /step=\{3\} title="产品明细"/);
  assert.match(pageSource, /step=\{4\} title="收款与备注"/);
});

test("create order page keeps customer history in the side rail", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /create-order-history-panel/);
  assert.match(pageSource, /选择客户后显示历史订单、质保与售后提醒/);
  assert.match(pageSource, /客户历史记录/);
  assert.match(pageSource, /create-order-aside[\s\S]*create-order-history-panel[\s\S]*create-order-summary-card/);
});

test("create order page provides prototype-like top actions", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /create-order-header-actions/);
  assert.match(pageSource, /保存草稿/);
  assert.match(pageSource, /onClick=\{\(\) => form\.submit\(\)\}/);
  assert.match(pageSource, /提交订单/);
});

test("create order page blocks submit with a business-safe message when no store is selected", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /if \(!storeId\) throw new Error\("当前账号尚未加入门店"\);/);
  assert.doesNotMatch(pageSource, /toCreateOrderPayload\(values, storeId!\)/);
});

test("create order page does not duplicate primary submit actions at the bottom", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  const submitLabels = pageSource.match(/提交订单/g) ?? [];
  assert.equal(submitLabels.length, 1);
  assert.doesNotMatch(pageSource, /htmlType="submit"/);
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
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /新增收款账户/);
  assert.match(pageSource, /create-order-payment-account-drawer/);
  assert.match(pageSource, /createPaymentAccountMutation/);
  assert.match(pageSource, /orderApi\.createPaymentAccount/);
  assert.match(pageSource, /\["payment-accounts", storeId\]/);
  assert.match(pageSource, /create-order-select-extra/);
  assert.doesNotMatch(pageSource, /border-slate|bg-slate|text-slate/);
  assert.match(cssSource, /\.create-order-select-extra/);
  assert.match(cssSource, /create-order-payment-account-drawer[\s\S]*ant-drawer-content-wrapper/);
});

test("create order new customer drawer includes profile fields aligned with customer management", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /create-order-customer-drawer/);
  assert.match(pageSource, /name="gender"/);
  assert.match(pageSource, /label="性别"/);
  assert.match(pageSource, /name="birthday"/);
  assert.match(pageSource, /label="生日"/);
  assert.match(pageSource, /name="referrerId"/);
  assert.match(pageSource, /label="介绍人"/);
  assert.match(pageSource, /customerApi\.search\(storeId!, referrerKeyword\)/);
  assert.match(pageSource, /onSearch=\{setReferrerKeyword\}/);
  assert.doesNotMatch(pageSource, /customer\.companyName \?\? customer\.name \?\? customer\.contactPerson \?\? customer\.id/);
  assert.match(pageSource, /customer\.companyName \?\? customer\.name \?\? customer\.contactPerson \?\? "未命名客户"/);
  assert.match(cssSource, /create-order-customer-drawer[\s\S]*ant-drawer-content-wrapper/);
});

test("create order new customer modal saves vehicle photo url", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /name="photoUrl"/);
  assert.match(pageSource, /label="车辆照片"/);
  assert.match(pageSource, /车辆照片链接，可稍后在客户档案补充/);
  assert.doesNotMatch(pageSource, /车辆照片 URL/);
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

test("create order product rows show the selected sales unit as a dedicated column", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(pageSource, /label="单位"/);
  assert.match(pageSource, /getSelectedProductUnitLabel/);
  assert.match(pageSource, /getProductUnitLabel\(resolveProductSalesUnit\(product\)\)/);
  assert.match(cssSource, /grid-template-columns: minmax\(280px, 1fr\) 88px 72px 132px auto/);
});

test("create order page saves and restores the local draft", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /saveCreateOrderDraft\(localStorage/);
  assert.match(pageSource, /loadCreateOrderDraft\(localStorage, storeId\)/);
  assert.match(pageSource, /form\.setFieldsValue\(\{\s*\.\.\.draft\.values,/);
  assert.match(
    pageSource,
    /draft\.values\.suggestedLaborCostYuan \?\? systemSuggestedLaborCostYuan/
  );
  assert.match(pageSource, /销售订单列表的“本机草稿”中继续编辑/);
});

test("create order customer history warning avoids deprecated Alert message prop", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /<Alert className="mb-3" type="warning" showIcon title=\{customerHistory\.warning\}/);
  assert.doesNotMatch(pageSource, /<Alert className="mb-3" type="warning" showIcon message=/);
});

test("create order page records labor cost adjustment reason when final labor differs from suggestion", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /suggestedLaborCostYuan/);
  assert.match(pageSource, /laborCostAdjustmentReason/);
  assert.match(pageSource, /调整施工人工费必须填写原因/);
  assert.match(pageSource, /建议人工费/);
});

test("create order page keeps suggested labor price read-only and allows adopting it", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /name="suggestedLaborCostYuan"/);
  assert.match(pageSource, /label="建议人工费（元）"/);
  assert.match(pageSource, /系统初始建议/);
  assert.match(pageSource, /使用系统建议/);
  assert.match(pageSource, /readOnly/);
  assert.match(pageSource, /label="成交人工费（元）"/);
  assert.match(pageSource, /采用建议价/);
  assert.match(pageSource, /onFinish=\{\(values\) => createMutation\.mutate\(values\)\}/);
  assert.doesNotMatch(pageSource, /createMutation\.mutate\(\{ \.\.\.values, suggestedLaborCostYuan \}\)/);
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

test("create order page uses prototype drawers instead of centered modals for auxiliary creation", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /Drawer/);
  assert.match(pageSource, /open=\{newCustomerOpen\}/);
  assert.match(pageSource, /open=\{newPaymentAccountOpen\}/);
  assert.match(pageSource, /创建并使用/);
  assert.doesNotMatch(pageSource, /<Modal/);
  assert.doesNotMatch(pageSource, /forceRender/);
  assert.doesNotMatch(pageSource, /width=\{/);
});

test("create order page avoids deprecated Ant Design dropdownRender API", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(pageSource, /popupRender=\{\(menu\) =>/);
  assert.doesNotMatch(pageSource, /dropdownRender/);
});

test("create order birthday selector avoids syncing local state inside an effect", () => {
  const pageSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.doesNotMatch(pageSource, /useEffect\(\(\) => \{\s*setParts\(parseBirthday\(value\)\);/);
});
