import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { Client } from "pg";
import bcrypt from "bcrypt";

const configuredAppUrl = process.env.MALLBAY_WEB_URL?.trim();
const appUrl = (configuredAppUrl || "http://localhost:3000").replace(/\/+$/, "");
const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:55432/mallbay?schema=public";
const chromePath = process.env.CHROME_PATH ?? (process.platform === "win32" ? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" : undefined);
const testPassword = process.env.MALLBAY_E2E_PASSWORD ?? "Test1234!";
const verbose = process.env.E2E_VERBOSE === "1";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const photoBefore = path.join(repoRoot, "apps/web/public/prototype-assets/construction-camera-inspection.png");
const photoFilmBox = path.join(repoRoot, "apps/web/public/prototype-assets/construction-camera-film-box.png");
const photoAfter = path.join(repoRoot, "apps/web/public/prototype-assets/construction-camera-completed.png");

const amountColumns = [
  "productAmountCents",
  "laborCostCents",
  "suggestedLaborCostCents",
  "laborCostAdjustmentReason",
  "totalAmountCents",
  "paidAmountCents",
  "outstandingCents",
  "salesCommissionCents",
  "materialCostCents",
  "profitCents",
  "pricingCalculationId",
  "pricingRuleSetVersion",
  "pricingInputHash",
  "pricingOutputSnapshot",
  "constructionChargeCents",
  "suggestedConstructionChargeCents",
  "constructionChargeAdjustmentReason",
  "estimatedMaterialCostCents",
  "estimatedConstructionCostCents",
  "estimatedTotalCostCents",
  "costCompleteness",
  "temporaryCostCents",
  "temporaryCostReason",
  "settlementDifferenceCents"
];

const itemColumns = [
  "productId",
  "quantity",
  "salesUnit",
  "baseUnit",
  "baseQuantityPerSalesUnit",
  "requiredBaseQuantity",
  "unitPriceCents",
  "amountCents"
];

function id(prefix) {
  return `${prefix}-${randomUUID()}`;
}

async function createFixture(client) {
  const passwordHash = await bcrypt.hash(testPassword, 12);
  await client.query("UPDATE \"User\" SET \"passwordHash\" = $1 WHERE username IN ('dianzhang', 'shigong')", [passwordHash]);

  const source = await client.query(`
    SELECT o.*
    FROM "Order" o
    JOIN "StoreMember" manager ON manager."storeId" = o."storeId" AND manager.position = 'MANAGER'
    WHERE o.status = 'PENDING_DISPATCH'
      AND EXISTS (SELECT 1 FROM "OrderItem" item WHERE item."orderId" = o.id)
      AND EXISTS (SELECT 1 FROM "OrderAmount" amount WHERE amount."orderId" = o.id)
    ORDER BY o."createdAt"
    LIMIT 1
  `);
  assert.equal(source.rowCount, 1, "需要一个带商品和金额的 PENDING_DISPATCH 订单作为复制源");
  const sourceOrder = source.rows[0];
  const orderId = id("e2e-order");
  const orderNo = `E2E-${Date.now()}`;
  const now = new Date();
  const orderColumns = [
    "id", "storeId", "executionStoreId", "orderNo", "customerId", "vehicleId", "salesPersonId",
    "constructionType", "constructionLocation", "constructionAddress", "appointmentDate", "appointmentTimeSlot",
    "status", "lifecycleVersion", "remark", "createdAt", "updatedAt"
  ];
  const orderValues = [
    orderId,
    sourceOrder.storeId,
    sourceOrder.executionStoreId,
    orderNo,
    sourceOrder.customerId,
    sourceOrder.vehicleId,
    sourceOrder.salesPersonId,
    sourceOrder.constructionType,
    sourceOrder.constructionLocation,
    sourceOrder.constructionAddress,
    now,
    "10:00-11:00",
    "PENDING_DISPATCH",
    1,
    "browser E2E fixture",
    now,
    now
  ];
  await client.query(
    `INSERT INTO "Order" (${orderColumns.map((column) => `"${column}"`).join(", ")}) VALUES (${orderValues.map((_, index) => `$${index + 1}`).join(", ")})`,
    orderValues
  );

  const amount = await client.query(`SELECT * FROM "OrderAmount" WHERE "orderId" = $1`, [sourceOrder.id]);
  assert.equal(amount.rowCount, 1, "复制源订单必须有金额事实");
  const sourceAmount = amount.rows[0];
  const amountId = id("e2e-amount");
  const amountValues = [amountId, orderId, ...amountColumns.map((column) => {
    if (column === "paidAmountCents") return sourceAmount.totalAmountCents;
    if (column === "outstandingCents") return 0;
    return sourceAmount[column];
  })];
  await client.query(
    `INSERT INTO "OrderAmount" ("id", "orderId", ${amountColumns.map((column) => `"${column}"`).join(", ")}) VALUES (${amountValues.map((_, index) => `$${index + 1}`).join(", ")})`,
    amountValues
  );

  const items = await client.query(`SELECT * FROM "OrderItem" WHERE "orderId" = $1`, [sourceOrder.id]);
  for (const item of items.rows) {
    const values = [id("e2e-item"), orderId, ...itemColumns.map((column) => item[column])];
    await client.query(
      `INSERT INTO "OrderItem" ("id", "orderId", ${itemColumns.map((column) => `"${column}"`).join(", ")}) VALUES (${values.map((_, index) => `$${index + 1}`).join(", ")})`,
      values
    );
  }

  return { orderId, orderNo, storeId: sourceOrder.storeId };
}

async function cleanupFixture(client, fixture) {
  if (!fixture) return;
  await client.query("BEGIN");
  try {
    // Several legacy/finance relations intentionally use RESTRICT for
    // production data safety. Delete only rows owned by this fixture, in
    // dependency order, and never hide a cleanup failure behind finally.
    await client.query(`DELETE FROM "InvoiceOrderAllocation" WHERE "orderId" = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM "CustomerReceiptReversalAllocation" WHERE "orderId" = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM "CustomerStatementItem" WHERE "orderId" = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM "CustomerRebate" WHERE "orderId" = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM "AfterSale" WHERE "orderId" = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM "Invoice" WHERE "orderId" = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM "Warranty" WHERE "orderId" = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM "AuditEvent" WHERE "targetId" = $1`, [fixture.orderId]);
    await client.query(`DELETE FROM "Order" WHERE id = $1`, [fixture.orderId]);
    const remaining = await client.query(`
      SELECT
        (SELECT count(*)::int FROM "Order" WHERE id = $1) AS orders,
        (SELECT count(*)::int FROM "AuditEvent" WHERE "targetId" = $1) AS audits
    `, [fixture.orderId]);
    assert.equal(remaining.rows[0]?.orders, 0, `fixture ${fixture.orderId} 订单必须在 E2E 结束时清理`);
    assert.equal(remaining.rows[0]?.audits, 0, `fixture ${fixture.orderId} 审计必须在 E2E 结束时清理`);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function login(page, username) {
  await page.goto(`${appUrl}/auth`);
  await page.getByPlaceholder("请输入账号").fill(username);
  await page.getByPlaceholder("至少 8 位").fill(testPassword);
  await page.getByRole("button", { name: "进入系统" }).click();
  await page.waitForURL(`${appUrl}/`, { timeout: 15_000 });
}

async function logout(page) {
  await page.goto(`${appUrl}/orders`);
  await page.getByRole("button", { name: "账户菜单" }).click();
  await page.getByRole("menuitem", { name: /退出登录/ }).click();
  await page.waitForURL(`${appUrl}/auth`, { timeout: 15_000 });
}

async function waitForStatus(client, orderId, expected) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const result = await client.query(`SELECT status, "lifecycleVersion" FROM "Order" WHERE id = $1`, [orderId]);
    if (result.rowCount === 1 && result.rows[0].status === expected) return result.rows[0];
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const result = await client.query(`SELECT status, "lifecycleVersion" FROM "Order" WHERE id = $1`, [orderId]);
  assert.equal(result.rowCount, 1);
  assert.equal(result.rows[0].status, expected);
  return result.rows[0];
}

async function upload(page, index, file) {
  const titles = ["验车照片", "膜箱照片", "施工过程照片", "施工后照片"];
  const article = page.locator("article.worker-task-photo-item").filter({ hasText: titles[index] });
  assert.equal(await article.count(), 1, `施工照片页面必须提供${titles[index]}上传入口`);
  const responsePromise = page.waitForResponse(
    (response) => response.url().includes("/construction/records/") && response.url().endsWith("/photos") && response.request().method() === "POST",
    { timeout: 15_000 }
  );
  const fileChooser = page.waitForEvent("filechooser");
  await article.getByRole("button", { name: "上传文件" }).click();
  await (await fileChooser).setFiles(file);
  const response = await responsePromise;
  assert.equal(response.ok(), true, `${titles[index]} 上传必须返回 2xx，实际为 ${response.status()}`);
}

async function waitForEnabled(locator, message, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await locator.isEnabled()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.equal(await locator.isEnabled(), true, message);
}

async function runResponsiveSmoke(browser) {
  const routes = ["/orders", "/construction/assignments", "/orders/create"];
  for (const width of [1440, 1024, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 } });
    const page = await context.newPage();
    const serverErrors = [];
    page.on("response", (response) => {
      if (response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
    });
    await login(page, "dianzhang");
    for (const route of routes) {
      await page.goto(`${appUrl}${route}`);
      await page.waitForLoadState("domcontentloaded");
      await page.locator("body").waitFor({ state: "visible", timeout: 15_000 });
      const viewport = await page.evaluate(() => ({
        width: window.innerWidth,
        bodyWidth: document.body.scrollWidth,
        documentWidth: document.documentElement.scrollWidth
      }));
      assert.equal(viewport.width, width, `响应式 smoke 必须使用 ${width}px 视口`);
      assert.equal(serverErrors.length, 0, `${width}px ${route} 不得产生 5xx：${serverErrors.join(", ")}`);
      assert.ok(
        viewport.bodyWidth <= width + 1 && viewport.documentWidth <= width + 1,
        `${width}px ${route} 出现未处理的横向溢出：${JSON.stringify(viewport)}`
      );
    }
    await context.close();
  }
}

async function main() {
  const client = new Client({ connectionString: databaseUrl });
  let fixture;
  let browser;
  try {
    await client.connect();
    fixture = await createFixture(client);
    browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}) });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    page.on("response", async (response) => {
      if (verbose && response.url().includes(":3001")) console.log(`[browser-e2e] ${response.status()} ${response.request().method()} ${response.url()}`);
      if (response.status() >= 400) console.error(`[browser-e2e] ${response.status()} ${response.request().method()} ${response.url()}`);
    });
    page.on("console", (message) => {
      if (verbose || message.type() === "error") console.log(`[browser-e2e][console] ${message.type()} ${message.text()}`);
    });

    await runResponsiveSmoke(browser);

    // Manager: dispatch to a real construction worker through the page.
    await login(page, "dianzhang");
    await page.goto(`${appUrl}/construction/assignments`);
    await page.getByRole("button", { name: new RegExp(fixture.orderNo) }).click();
    const workerCard = page.locator("button.dispatch-worker-card").filter({ hasText: "shigong" });
    await workerCard.waitFor({ state: "visible", timeout: 15_000 });
    await workerCard.click();
    const dispatch = page.getByRole("button", { name: /确认派单/ });
    assert.equal(await dispatch.isEnabled(), true, "选择施工人员后确认派单必须可用");
    await dispatch.click();
    await page.getByRole("button", { name: "确认提交，进入派工流转" }).click();
    await waitForStatus(client, fixture.orderId, "DISPATCHED");
    await logout(page);

    // Worker: evidence gate, start, after photo, and complete.
    await login(page, "shigong");
    await page.goto(`${appUrl}/construction/tasks/${fixture.orderId}`);
    await page.getByRole("button", { name: "上传文件" }).nth(0).waitFor({ state: "visible", timeout: 15_000 });
    await upload(page, 0, photoBefore);
    await upload(page, 1, photoFilmBox);
    await page.getByRole("button", { name: "开始施工" }).click();
    await waitForStatus(client, fixture.orderId, "IN_CONSTRUCTION");
    await page.getByText("施工中", { exact: true }).first().waitFor({ state: "visible", timeout: 15_000 });
    await upload(page, 3, photoAfter);
    await page.reload();
    await page.getByRole("button", { name: "提交完工" }).waitFor({ state: "visible", timeout: 15_000 });
    const complete = page.getByRole("button", { name: "提交完工" });
    await waitForEnabled(complete, "补齐必传照片后提交完工必须可用");
    await complete.click();
    // Construction completion closes the construction record but deliberately
    // leaves the order in IN_CONSTRUCTION until final delivery. This is the
    // quality-gate boundary (see getEffectiveOrderStatus); final delivery is
    // the order-level COMPLETED transition.
    await waitForStatus(client, fixture.orderId, "IN_CONSTRUCTION");

    // Quality approval is a manager/scheduler responsibility; the worker only
    // submits evidence and completion. Switch actors before opening the same
    // dedicated quality page so the E2E covers the real permission boundary.
    await logout(page);
    await login(page, "dianzhang");
    await page.goto(`${appUrl}/construction/orders/${fixture.orderId}`);
    // The app shell also contains a store switcher combobox. Scope the
    // interaction to the quality form so the test cannot open the wrong one.
    const qualitySelect = page.locator("form").getByRole("combobox");
    await qualitySelect.waitFor({ state: "visible", timeout: 15_000 });
    await qualitySelect.click();
    // Ant Design renders the option in a portal and briefly animates its
    // position; force the click after it is attached so the browser test does
    // not depend on the animation frame being sampled.
    // Ant Design keeps an aria option mirror hidden for accessibility while
    // animating the visible menu item. Target the rendered option class and
    // choose the visible instance instead of the hidden mirror.
    const passOption = page.locator(".ant-select-item-option").filter({ hasText: "通过" }).filter({ visible: true }).last();
    await passOption.waitFor({ state: "visible", timeout: 5_000 });
    await passOption.click({ force: true });
    await page.getByPlaceholder("记录问题点、返工要求或放行说明").fill("浏览器 E2E 质检通过");
    await page.getByRole("button", { name: "保存质检" }).click();
    await page.getByText("质检结果已保存").waitFor({ state: "visible", timeout: 15_000 });
    // Manager: final delivery confirmation from the order detail page.
    await page.goto(`${appUrl}/orders/${fixture.orderId}`);
    const finalDelivery = page.getByRole("button", { name: /最终交付/ });
    assert.equal(await finalDelivery.isEnabled(), true, "质检通过且余额为零时最终交付必须可用");
    await finalDelivery.click();
    const confirm = page.locator(".ant-modal-confirm-btns .ant-btn-primary").last();
    await confirm.waitFor({ state: "visible", timeout: 10_000 });
    await confirm.click();
    await waitForStatus(client, fixture.orderId, "COMPLETED");
    const warranty = await client.query(
      'SELECT status FROM "Warranty" WHERE "orderId" = $1',
      [fixture.orderId]
    );
    assert.equal(warranty.rows[0]?.status, "ACTIVE", "最终交付后质保事实必须激活");

    console.log(JSON.stringify({ ok: true, orderNo: fixture.orderNo, orderId: fixture.orderId }));
    await context.close();
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    await cleanupFixture(client, fixture).catch(() => undefined);
    await client.end().catch(() => undefined);
  }
}

await main();
