import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { OrdersModule } from "./orders/orders.module";
import { OrdersService } from "./orders/orders.service";
import { ORDER_OPERATIONS, ORDER_READ_MODEL } from "./orders/domain/order-operations";
import { AfterSalesModule } from "./after-sales/after-sales.module";
import { AfterSalesService } from "./after-sales/after-sales.service";
import { AFTER_SALES_READ_MODEL, AFTER_SALES_RESOLUTION } from "./after-sales/domain/after-sales-resolution";
import { ConstructionModule } from "./construction/construction.module";
import { CONSTRUCTION_MANAGEMENT } from "./construction/domain/construction-management";
import { PermissionsModule } from "./permissions/permissions.module";
import { PERMISSION_GOVERNANCE } from "./permissions/domain/permission-governance";
import { StoresModule } from "./stores/stores.module";
import { STORE_GOVERNANCE } from "./stores/domain/store-governance";
import { InvoicesModule } from "./invoices/invoices.module";
import { INVOICE_WORKFLOW } from "./invoices/domain/invoice-workflow";
import { SettingsModule } from "./settings/settings.module";
import { CONFIGURATION_VERSION_GOVERNANCE } from "./settings/domain/configuration-version-governance";
import { DICTIONARY_GOVERNANCE } from "./settings/domain/dictionary-governance";
import { MembersModule } from "./members/members.module";
import { MEMBER_INVITATION_WORKFLOW } from "./members/domain/member-invitation-workflow";
import { ReportsModule } from "./reports/reports.module";
import { OPERATIONAL_REPORT } from "./reports/domain/operational-report";

const exported = (moduleType: unknown) => new Set((Reflect.getMetadata("exports", moduleType) ?? []) as unknown[]);

test("three deepening seams expose tokens instead of compatibility implementations", () => {
  const orders = exported(OrdersModule);
  assert.equal(orders.has(ORDER_OPERATIONS), true);
  assert.equal(orders.has(ORDER_READ_MODEL), true);
  assert.equal(orders.has(OrdersService), false);

  const afterSales = exported(AfterSalesModule);
  assert.equal(afterSales.has(AFTER_SALES_RESOLUTION), true);
  assert.equal(afterSales.has(AFTER_SALES_READ_MODEL), true);
  assert.equal(afterSales.has(AfterSalesService), false);

  const construction = exported(ConstructionModule);
  assert.equal(construction.has(CONSTRUCTION_MANAGEMENT), true);
});

test("controllers cross the new seams for the migrated capability sets", () => {
  const sourceRoot = path.resolve(__dirname);
  const ordersController = readFileSync(path.join(sourceRoot, "orders", "orders.controller.ts"), "utf8");
  const afterSalesController = readFileSync(path.join(sourceRoot, "after-sales", "after-sales.controller.ts"), "utf8");
  const constructionController = readFileSync(path.join(sourceRoot, "construction", "construction.controller.ts"), "utf8");

  assert.doesNotMatch(ordersController, /\bOrdersService\b/);
  assert.match(ordersController, /ORDER_OPERATIONS/);
  assert.match(ordersController, /ORDER_READ_MODEL/);

  assert.doesNotMatch(afterSalesController, /\bAfterSalesService\b/);
  assert.match(afterSalesController, /AFTER_SALES_RESOLUTION/);
  assert.match(afterSalesController, /AFTER_SALES_READ_MODEL/);

  assert.match(constructionController, /CONSTRUCTION_MANAGEMENT/);
  assert.doesNotMatch(constructionController, /this\.construction\.(listCapacities|upsertCapacity|updateCapacity|listWorkers|upsertWorker|listLeaves|createLeave|updateLeave|upsertSchedule|listSchedules)\(/);
});

test("governance and workflow modules expose their deepening seams", () => {
  assert.equal(exported(PermissionsModule).has(PERMISSION_GOVERNANCE), true);
  assert.equal(exported(StoresModule).has(STORE_GOVERNANCE), true);
  assert.equal(exported(InvoicesModule).has(INVOICE_WORKFLOW), true);
});

test("controllers cross governance seams instead of compatibility implementations", () => {
  const sourceRoot = path.resolve(__dirname);
  const permissionsController = readFileSync(path.join(sourceRoot, "permissions", "permissions.controller.ts"), "utf8");
  const storesController = readFileSync(path.join(sourceRoot, "stores", "stores.controller.ts"), "utf8");
  const invoicesController = readFileSync(path.join(sourceRoot, "invoices", "invoices.controller.ts"), "utf8");

  assert.match(permissionsController, /PERMISSION_GOVERNANCE/);
  assert.doesNotMatch(permissionsController, /PermissionsService/);
  assert.match(storesController, /STORE_GOVERNANCE/);
  assert.doesNotMatch(storesController, /StoresService/);
  assert.match(invoicesController, /INVOICE_WORKFLOW/);
  assert.doesNotMatch(invoicesController, /InvoicesService/);
});

test("four next deepening modules expose only their governance and report seams", () => {
  const settings = exported(SettingsModule);
  assert.equal(settings.has(CONFIGURATION_VERSION_GOVERNANCE), true);
  assert.equal(settings.has(DICTIONARY_GOVERNANCE), true);

  const members = exported(MembersModule);
  assert.equal(members.has(MEMBER_INVITATION_WORKFLOW), true);

  const reports = exported(ReportsModule);
  assert.equal(reports.has(OPERATIONAL_REPORT), true);
});

test("four next controllers cross their deepening seams", () => {
  const sourceRoot = path.resolve(__dirname);
  const configController = readFileSync(path.join(sourceRoot, "settings", "config-versions.controller.ts"), "utf8");
  const dictionaryController = readFileSync(path.join(sourceRoot, "settings", "dictionary-governance.controller.ts"), "utf8");
  const membersController = readFileSync(path.join(sourceRoot, "members", "members.controller.ts"), "utf8");
  const reportsController = readFileSync(path.join(sourceRoot, "reports", "reports.controller.ts"), "utf8");

  assert.match(configController, /CONFIGURATION_VERSION_GOVERNANCE/);
  assert.doesNotMatch(configController, /ConfigVersionsService/);
  assert.match(dictionaryController, /DICTIONARY_GOVERNANCE/);
  assert.doesNotMatch(dictionaryController, /DictionaryGovernanceService/);
  assert.match(membersController, /MEMBER_INVITATION_WORKFLOW/);
  assert.doesNotMatch(membersController, /MembersService/);
  assert.match(reportsController, /OPERATIONAL_REPORT/);
  assert.doesNotMatch(reportsController, /ReportsService/);
});
