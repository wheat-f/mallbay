import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildCapacityPayload, formatCapacityDateValue, toCapacityDatePickerValue } from "./capacity-form";

test("formatCapacityDateValue keeps an existing yyyy-mm-dd string unchanged", () => {
  assert.equal(formatCapacityDateValue("2026-06-18"), "2026-06-18");
});

test("formatCapacityDateValue formats DatePicker dayjs-like values before submit", () => {
  assert.equal(formatCapacityDateValue({ format: (pattern: string) => `formatted:${pattern}` }), "formatted:YYYY-MM-DD");
});

test("formatCapacityDateValue returns undefined for an empty date", () => {
  assert.equal(formatCapacityDateValue(null), undefined);
});

test("toCapacityDatePickerValue converts stored date strings back to dayjs values", () => {
  const value = toCapacityDatePickerValue("2026-06-18");

  assert.equal(value?.format("YYYY-MM-DD"), "2026-06-18");
});

test("buildCapacityPayload formats DatePicker value only when submitting", () => {
  assert.deepEqual(
    buildCapacityPayload("store-1", {
      date: { format: (pattern: string) => `formatted:${pattern}` },
      inStoreCapacity: 2,
      outsideCapacity: 1,
      heatFilmCapacity: 3,
      inspectionCapacity: 4
    }),
    {
      storeId: "store-1",
      date: "formatted:YYYY-MM-DD",
      inStoreCapacity: 2,
      outsideCapacity: 1,
      heatFilmCapacity: 3,
      inspectionCapacity: 4
    }
  );
});

test("construction capacity page uses an interactive DatePicker as the date form control", () => {
  const pageSource = readFileSync("app/construction/capacities/page.tsx", "utf8");

  assert.equal(pageSource.includes("normalize={formatCapacityDateValue}"), false);
  assert.equal(pageSource.includes("<Calendar"), false);
  assert.equal(pageSource.includes("readOnly"), false);
  assert.match(pageSource, /DatePicker/);
  assert.match(pageSource, /format="YYYY-MM-DD"/);
  assert.match(pageSource, /date:\s*toCapacityDatePickerValue\(cell\.date\)/);
});

test("create order capacity warning links to capacity maintenance with selected appointment date", () => {
  const createOrderSource = readFileSync("app/orders/create/page.tsx", "utf8");

  assert.match(createOrderSource, /selectedAppointmentDateValue = formatOrderDateValue\(selectedAppointmentDate\)/);
  assert.match(createOrderSource, /getConstructionCapacityHref\(selectedAppointmentDateValue\)/);
  assert.match(createOrderSource, /returnTo/);
  assert.match(createOrderSource, /\/orders\/create/);
});

test("construction capacity page pre-fills date from the navigation query string", () => {
  const pageSource = readFileSync("app/construction/capacities/page.tsx", "utf8");

  assert.match(pageSource, /window\.location\.search/);
  assert.match(pageSource, /form\.setFieldValue\("date",\s*date\)/);
  assert.match(pageSource, /setVisibleMonth\(dayjs\(dateFromQuery\)\.startOf\("month"\)\)/);
});

test("construction capacity page shows return-to-order action when opened from order creation", () => {
  const pageSource = readFileSync("app/construction/capacities/page.tsx", "utf8");

  assert.match(pageSource, /returnTo/);
  assert.match(pageSource, /返回订单/);
  assert.match(pageSource, /router\.push\(returnTo\)/);
});

test("construction capacity page guards capacity saving when no store is selected", () => {
  const pageSource = readFileSync("app/construction/capacities/page.tsx", "utf8");

  assert.match(pageSource, /if \(!storeId\) throw new Error\("当前账号未加入门店"\);/);
  assert.doesNotMatch(pageSource, /buildCapacityPayload\(storeId!, values\)/);
});

test("construction capacity page keeps date and capacity fields in a vertical form grid", () => {
  const pageSource = readFileSync("app/construction/capacities/page.tsx", "utf8");

  assert.equal(pageSource.includes('layout="inline"'), false);
  assert.match(pageSource, /layout="vertical"/);
  assert.match(pageSource, /capacity-form-grid/);
});

test("construction capacity page presents calendar and maintenance panels in a prototype layout", () => {
  const pageSource = readFileSync("app/construction/capacities/page.tsx", "utf8");

  assert.match(pageSource, /DownloadOutlined/);
  assert.match(pageSource, /导出报表/);
  assert.match(pageSource, /capacity-shell/);
  assert.match(pageSource, /capacity-calendar-card/);
  assert.match(pageSource, /capacity-calendar-grid/);
  assert.match(pageSource, /capacity-editor-card/);
  assert.match(pageSource, /capacity-side-panel/);
  assert.match(pageSource, /capacity-tips-card/);
  assert.match(pageSource, /capacity-number-grid/);
  assert.match(pageSource, /title="批量产能设置"/);
  assert.match(pageSource, /buildCapacityCalendar/);
  assert.doesNotMatch(pageSource, /StorePageHeader/);
  assert.doesNotMatch(pageSource, /management-kpi-grid/);
  assert.doesNotMatch(pageSource, /management-table-card/);
});

test("construction capacity calendar becomes readable cards on phone widths", () => {
  const cssSource = readFileSync("app/globals.css", "utf8");

  assert.match(cssSource, /@media \(max-width: 520px\) \{[\s\S]*\.capacity-calendar-grid\s*\{\n {4}grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(cssSource, /@media \(max-width: 520px\) \{[\s\S]*\.capacity-weekday\s*\{\n {4}display: none;/);
  assert.match(cssSource, /@media \(max-width: 520px\) \{[\s\S]*\.capacity-day\s*\{[\s\S]*min-height: auto;/);
  assert.match(cssSource, /@media \(max-width: 520px\) \{[\s\S]*\.capacity-day-body span\s*\{[\s\S]*white-space: normal;/);
});

test("global popups are mounted to document body for reliable overlay rendering", () => {
  const pageSource = readFileSync("app/construction/capacities/page.tsx", "utf8");
  const providersSource = readFileSync("src/providers/app-providers.tsx", "utf8");

  assert.match(pageSource, /getPopupContainer=\{\(\)\s*=>\s*document\.body\}/);
  assert.match(providersSource, /getPopupContainer=\{\(\)\s*=>\s*document\.body\}/);
});

test("construction capacity date picker lets Ant Design manage panel open state", () => {
  const pageSource = readFileSync("app/construction/capacities/page.tsx", "utf8");

  assert.equal(pageSource.includes("open={datePickerOpen}"), false);
  assert.equal(pageSource.includes("onOpenChange={setDatePickerOpen}"), false);
  assert.equal(pageSource.includes("setDatePickerOpen"), false);
});
