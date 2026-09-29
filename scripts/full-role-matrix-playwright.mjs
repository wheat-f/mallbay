import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium } from "playwright";
import { DOMAIN_READS, EXPLICIT_ROUTE_EXPECTATIONS, MANUAL_BINDING_WRITES, ROLE_KEYS } from "./full-role-matrix-expectations.mjs";

const appUrl = (process.env.MALLBAY_WEB_URL ?? "http://8.136.156.153:3000").replace(/\/+$/, "");
const apiUrl = (process.env.MALLBAY_API_URL ?? "http://8.136.156.153:3001").replace(/\/+$/, "");
const accountFile = process.env.MALLBAY_ACCOUNTS_FILE ?? path.resolve(".codex/permission-regression-test-accounts.txt");
const chromePath = process.env.CHROME_PATH;
const stamp = process.env.REGRESSION_STAMP ?? new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
const runId = `REGRESSION-${stamp}-${crypto.randomBytes(3).toString("hex")}`;
const reportRoot = path.resolve(process.env.REGRESSION_OUTPUT_ROOT ?? ".codex/verification");
const reportStem = `full-role-matrix-${stamp}`;
const reportDir = path.join(reportRoot, reportStem);
const screenshotDir = path.join(reportDir, "screenshots");
const reportPath = path.join(reportRoot, `${reportStem}.json`);

const roles = [
  ["店长", "manager"],
  ["销售", "permission-regression-sales"],
  ["客服", "permission-regression-customer-service"],
  ["采购", "permission-regression-purchasing"],
  ["财务", "permission-regression-finance"],
  ["施工主管", "permission-regression-scheduler"],
  ["施工员", "permission-regression-construction"],
  ["学徒", "permission-regression-apprentice"]
];

const routes = [
  ["工作台", "/"], ["订单", "/orders"], ["新建订单", "/orders/create"], ["历史核验", "/orders/historical-verification"],
  ["报价审批", "/orders/quotes"], ["建议价", "/orders/pricing"], ["客户", "/customers"], ["产品", "/products"],
  ["施工派单", "/construction/assignments"], ["施工容量", "/construction/capacities"], ["施工排班", "/construction/schedules"],
  ["施工任务", "/construction/tasks"], ["施工档案", "/construction/profile"], ["施工物料", "/construction/materials"],
  ["跨店施工", "/construction/cross-store"], ["施工成本结算", "/construction/cost-settlements"], ["请假", "/construction/leaves"],
  ["请假审批", "/construction/leave-approvals"], ["库存", "/inventory"], ["库存仓库", "/inventory/warehouses"],
  ["库存供应商", "/inventory/suppliers"], ["采购", "/purchases"], ["采购需求", "/purchases/requirements"],
  ["采购订单", "/purchases/orders"], ["采购供应商", "/purchases/suppliers"], ["退货", "/returns"],
  ["财务", "/finance"], ["费用申请", "/finance/expenses"], ["报销", "/finance/reimbursements"],
  ["付款记录", "/finance/payment-records"], ["发票", "/invoices"], ["返利", "/rebates"], ["提成", "/commissions"],
  ["质保", "/warranties"], ["售后", "/after-sales"], ["售后任务", "/after-sales/tasks"], ["人员", "/members"],
  ["门店", "/workbench/:storeId"], ["报表", "/reports"], ["设置", "/settings"], ["权限", "/settings/permissions"],
  ["角色绑定", "/settings/role-bindings"], ["审计", "/settings/audit"], ["字典", "/settings/dictionaries"],
  ["门店设置", "/settings/store"], ["财务设置", "/settings/finance"], ["安全设置", "/settings/security"],
  ["账号设置", "/settings/account"], ["个人中心", "/profile"]
];

const apiReads = [
  ["权限快照", "GET", "/auth/me/permissions"], ["客户", "GET", "/customers"], ["产品", "GET", "/products"],
  ["订单", "GET", "/orders"], ["报价", "GET", "/sales-quotes"], ["施工派单", "GET", "/construction/assignments"],
  ["施工容量", "GET", "/construction/capacities"], ["施工排班", "GET", "/construction/schedules"],
  ["库存批次", "GET", "/inventory/batches"], ["库存仓库", "GET", "/inventory/warehouses"], ["采购", "GET", "/purchases/overview"],
  ["采购需求", "GET", "/purchases/requirements"], ["采购订单", "GET", "/purchases/orders"], ["财务", "GET", "/finance/overview"],
  ["费用", "GET", "/finance/expenses"], ["报销", "GET", "/finance/reimbursements"], ["付款记录", "GET", "/finance/payment-records"],
  ["发票", "GET", "/invoices"], ["返利", "GET", "/rebates"], ["提成规则", "GET", "/commissions/sales-rules"],
  ["质保", "GET", "/warranties"], ["售后", "GET", "/after-sales"], ["退货", "GET", "/sales-returns"], ["人员", "GET", "/invitations"],
  ["报表", "GET", "/reports/summary"], ["门店", "GET", "/stores"], ["审计", "GET", "/settings/audit"],
  ["设置能力", "GET", "/settings/capabilities"], ["设置摘要", "GET", "/settings/summary"],
  ["权限角色", "GET", "/permissions/roles"], ["权限定义", "GET", "/permissions/definitions"]
];

const storeScopedReads = new Set([
  "/orders", "/sales-quotes", "/construction/assignments", "/construction/capacities", "/construction/schedules",
  "/inventory/batches", "/inventory/warehouses", "/inventory/movements", "/purchases/overview", "/purchases/requirements",
  "/purchases/orders", "/finance/overview", "/finance/expenses", "/finance/reimbursements", "/finance/payment-records",
  "/invoices", "/rebates", "/commissions/sales-rules", "/warranties", "/after-sales", "/sales-returns", "/reports/summary", "/settings/audit"
]);

const knownPasswords = new Set();

function assertTestOrigins() {
  if (appUrl !== "http://8.136.156.153:3000" || apiUrl !== "http://8.136.156.153:3001") {
    throw new Error("BLOCKED_ORIGIN: 凭据只能用于配置的 MallBay Test 地址");
  }
}

function parseAccounts(text) {
  const result = new Map();
  const sections = text.split(/\r?\n(?=\[)/);
  for (const section of sections) {
    const header = section.match(/^\[([^\]]+)\]/)?.[1];
    if (!header) continue;
    const values = {};
    for (const line of section.split(/\r?\n/)) {
      const match = line.match(/^\s*(position|username|password)\s*[:=]\s*(.*?)\s*$/);
      if (match) values[match[1]] = match[2];
    }
    if (values.username && values.password) {
      knownPasswords.add(values.password);
      result.set(header, values);
    }
  }
  return result;
}

function redactError(error) {
  let message = String(error?.message ?? error);
  for (const password of knownPasswords) message = message.replaceAll(password, "<redacted>");
  return message.replace(/Bearer\s+[^\s]+/gi, "Bearer <redacted>").replace(/password[^,;\s]*/gi, "password<redacted>");
}

function bodyText(page) {
  return page.locator("body").innerText({ timeout: 8000 }).catch(() => "");
}

function classifyPage(text, url, status) {
  const forbidden = /403|无权访问|无权限|当前角色无权|禁止访问/.test(text);
  const loginRedirect = /\/auth(?:$|\?)/.test(url);
  const loading = /正在加载|加载中|正在校验|Loading\.\.\./i.test(text);
  const notFound = /404|页面不存在|This page could not be found/i.test(text);
  return { status, url, forbidden, loginRedirect, loading, notFound, ok: !loginRedirect && !forbidden && !loading && !notFound && text.trim().length > 80 && (status == null || status < 400) };
}

async function waitForTerminalPage(page) {
  await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => undefined);
  for (let attempt = 0; attempt < 20; attempt++) {
    const text = await page.locator("main").first().innerText({ timeout: 1000 }).catch(() => bodyText(page));
    const state = classifyPage(text, page.url(), null);
    if (state.forbidden || state.loginRedirect || state.ok) return text;
    await page.waitForTimeout(500);
  }
  throw new Error("页面未达到可判定终态（持续加载或空白）");
}

function decision(actualAllowed, allowedRoles, roleKey) {
  const expected = allowedRoles.includes(roleKey) ? "ALLOW" : "DENY";
  const actual = actualAllowed === null ? "UNKNOWN" : actualAllowed ? "ALLOW" : "DENY";
  return { expected, actual, verdict: actual === "UNKNOWN" ? "BLOCKED" : actual === expected ? "PASS" : "FAIL" };
}

function domainForRoute(route, kind) {
  return Object.entries(DOMAIN_READS).find(([, value]) => value[kind] === route);
}

async function apiLogin(account) {
  const keyResponse = await fetch(`${apiUrl}/auth/public-key`);
  if (!keyResponse.ok) throw new Error(`public-key ${keyResponse.status}`);
  const { publicKey } = await keyResponse.json();
  const encryptedPassword = crypto.publicEncrypt({ key: publicKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(account.password)).toString("base64");
  const response = await fetch(`${apiUrl}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: account.username, encryptedPassword }) });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || !json.accessToken) throw new Error(`login ${response.status}`);
  return { token: json.accessToken, user: json.user ?? null };
}

async function apiRequest(token, method, route, body) {
  const response = await fetch(`${apiUrl}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "x-request-id": crypto.randomUUID() },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, ok: response.ok, data };
}

function listFrom(data) {
  if (Array.isArray(data)) return data;
  for (const key of ["items", "data", "rows", "stores", "results"]) if (Array.isArray(data?.[key])) return data[key];
  return [];
}

function firstId(data) {
  return data?.id ?? data?.item?.id ?? data?.data?.id ?? null;
}

async function loginUi(page, account) {
  await page.goto(`${appUrl}/auth`, { waitUntil: "networkidle", timeout: 30000 });
  await page.getByPlaceholder("请输入账号").fill(account.username);
  await page.getByPlaceholder("至少 8 位").fill(account.password);
  await page.getByRole("button", { name: "进入系统" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/auth"), { timeout: 20000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function logoutUi(page) {
  await page.getByRole("button", { name: "账户菜单" }).click();
  await page.getByRole("menuitem", { name: /退出登录/ }).click();
  await page.waitForURL((url) => url.pathname.endsWith("/auth"), { timeout: 15000 });
}

async function runRouteMatrix(page, roleKey, storeId, roleResult) {
  const visibleLinks = await page.locator("a[href]").evaluateAll((nodes) => nodes.map((node) => ({ text: node.textContent?.trim() ?? "", href: node.getAttribute("href") ?? "" })).filter((item) => item.href.startsWith("/"))).catch(() => []);
  const manualBindingInMenu = visibleLinks.some((item) => item.href.startsWith("/settings/role-bindings"));
  roleResult.menu = { visibleLinks: visibleLinks.length, labels: [...new Set(visibleLinks.map((item) => item.text).filter(Boolean))].slice(0, 100), manualBindingInMenu, verdict: manualBindingInMenu ? "FAIL" : visibleLinks.length ? "PASS" : "BLOCKED" };
  const quickLabels = await page.locator("main a, main button").allTextContents().then((items) => items.map((item) => item.trim()).filter(Boolean).slice(0, 100)).catch(() => []);
  roleResult.quickActions = { labels: quickLabels, verdict: quickLabels.length ? "PASS" : "BLOCKED" };
  for (const [name, route] of routes) {
    const started = Date.now();
    const domain = domainForRoute(route, "route");
    const allowedRoles = domain?.[1].allowed ?? EXPLICIT_ROUTE_EXPECTATIONS[route];
    try {
      if (route.includes(":storeId") && !storeId) throw new Error("门店 ID 未解析");
      const resolvedRoute = route.replace(":storeId", encodeURIComponent(storeId ?? ""));
      const response = await page.goto(`${appUrl}${resolvedRoute}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.locator("body").waitFor({ state: "visible", timeout: 10000 });
      const text = await waitForTerminalPage(page);
      const observed = classifyPage(text, page.url(), response?.status() ?? null);
      const outcome = allowedRoles ? decision(observed.forbidden ? false : observed.ok ? true : null, allowedRoles, roleKey) : { verdict: "OBSERVED" };
      roleResult.routes.push({ name, route, domain: domain?.[0] ?? null, elapsedMs: Date.now() - started, ...observed, ...outcome });
    } catch (error) {
      roleResult.routes.push({ name, route, domain: domain?.[0] ?? null, elapsedMs: Date.now() - started, verdict: allowedRoles ? "BLOCKED" : "OBSERVED", error: redactError(error) });
    }
  }
}

async function runApiMatrix(token, storeId, roleKey, roleResult) {
  for (const [name, method, rawRoute] of apiReads) {
    const domain = domainForRoute(rawRoute, "api");
    const route = storeId && (storeScopedReads.has(rawRoute) || ["/customers", "/products"].includes(rawRoute))
      ? `${rawRoute}?storeId=${encodeURIComponent(storeId)}` : rawRoute;
    try {
      const result = await apiRequest(token, method, route);
      const outcome = domain ? decision(result.status === 403 ? false : result.ok ? true : null, domain[1].allowed, roleKey) : { verdict: "OBSERVED" };
      roleResult.api.push({ name, method, route: rawRoute, domain: domain?.[0] ?? null, status: result.status, ...outcome });
    } catch (error) {
      roleResult.api.push({ name, method, route: rawRoute, domain: domain?.[0] ?? null, status: null, verdict: domain ? "BLOCKED" : "OBSERVED", error: redactError(error) });
    }
  }
  for (const probe of MANUAL_BINDING_WRITES) {
    if (process.env.MALLBAY_ENABLE_MUTATIONS !== "1") {
      roleResult.api.push({ name: "通用角色绑定写入口", method: probe.method, route: probe.route, expected: 403, verdict: "BLOCKED", reason: "只读模式跳过写方法探针" });
      continue;
    }
    const result = await apiRequest(token, probe.method, probe.route, probe.body).catch(() => ({ status: null }));
    roleResult.api.push({ name: "通用角色绑定写入口", method: probe.method, route: probe.route, status: result.status, expected: 403, verdict: result.status === 403 ? "PASS" : result.status === null ? "BLOCKED" : "FAIL" });
  }
}

async function runReversibleCrud(accountByKey) {
  const result = { runId, operations: [], cleanup: [], ownIsolation: { verdict: "BLOCKED", reason: "需要客户写入夹具" }, blockedDomains: Object.keys(DOMAIN_READS).filter((domain) => !["产品", "客户"].includes(domain)), hazardousOperationsSkipped: ["真实支付", "发票发送", "短信", "邮件", "外部通知", "物理删除"] };
  if (process.env.MALLBAY_ENABLE_MUTATIONS !== "1" || process.env.MALLBAY_TEST_EXTERNAL_CHANNELS_DISABLED !== "1") {
    result.operations.push({ domain: "业务写入", verdict: "BLOCKED", reason: "需同时声明手动写入验收与 Test 外部通道已关闭" });
    return result;
  }
  const manager = accountByKey.get("manager");
  if (!manager) { result.operations.push({ domain: "业务写入", verdict: "BLOCKED", reason: "店长账号缺失" }); return result; }
  const managerSession = await apiLogin(manager);
  const managerMe = await apiRequest(managerSession.token, "GET", "/auth/me");
  const storeId = managerMe.data?.storeMember?.store?.id ?? managerMe.data?.storeMember?.storeId ?? managerMe.data?.storeId;
  if (!storeId) { result.operations.push({ domain: "业务写入", verdict: "BLOCKED", reason: "店长门店未解析" }); return result; }
  const record = (actor, domain, action, response) => result.operations.push({ actor, domain, action, status: response.status, verdict: response.ok ? "PASS" : "FAIL" });
  const cleanup = async (domain, id, token, route, action) => {
    try {
      const response = await apiRequest(token, "POST", route, { reason: "回归验收可逆收尾" });
      const detail = await apiRequest(token, "GET", `/${domain === "产品" ? "products" : "customers"}/${id}`);
      const expectedStatus = domain === "产品" ? "INACTIVE" : "ARCHIVED";
      const actualStatus = detail.data?.status ?? detail.data?.customer?.status ?? detail.data?.product?.status ?? null;
      result.cleanup.push({ domain, id, action, status: response.status, expectedStatus, actualStatus, verdict: response.ok && detail.ok && actualStatus === expectedStatus ? "PASS" : "FAIL" });
    } catch (error) {
      result.cleanup.push({ domain, id, action, verdict: "FAIL", error: redactError(error) });
    }
  };
  const tagFor = (role) => `REGRESSION-${stamp.slice(0, 8)}-${stamp.slice(8, 14)}-${role}-${crypto.randomBytes(3).toString("hex")}`;

  const productTag = tagFor("店长");
  let productId = null;
  try {
    const created = await apiRequest(managerSession.token, "POST", "/products", { storeId, brand: "REGRESSION", name: productTag, model: productTag, category: "PPF", unit: "METER", inventoryUnit: "METER", salesUnit: "METER", basePriceCents: 1000 });
    record("manager", "产品", "create", created);
    productId = firstId(created.data);
    if (!productId) {
      const lookup = await apiRequest(managerSession.token, "GET", `/products?storeId=${encodeURIComponent(storeId)}&q=${encodeURIComponent(productTag)}`);
      productId = listFrom(lookup.data).find((item) => item.model === productTag)?.id ?? null;
    }
    if (productId) {
      record("manager", "产品", "query", await apiRequest(managerSession.token, "GET", `/products/${productId}`));
      record("manager", "产品", "update", await apiRequest(managerSession.token, "PATCH", `/products/${productId}`, { name: `${productTag}-UPDATED` }));
      record("manager", "产品", "disable", await apiRequest(managerSession.token, "POST", `/products/${productId}/disable`, {}));
      record("manager", "产品", "enable", await apiRequest(managerSession.token, "POST", `/products/${productId}/enable`, {}));
    } else result.cleanup.push({ domain: "产品", tag: productTag, verdict: "BLOCKED", reason: "创建结果无法确认 ID，需人工核对" });
  } catch (error) { result.operations.push({ actor: "manager", domain: "产品", verdict: "FAIL", error: redactError(error) }); }
  finally { if (productId) await cleanup("产品", productId, managerSession.token, `/products/${productId}/disable`, "停用"); }

  const customerIds = new Map();
  for (const key of ["manager", "permission-regression-sales", "permission-regression-customer-service"]) {
    const account = accountByKey.get(key);
    if (!account) { result.operations.push({ actor: key, domain: "客户", verdict: "BLOCKED", reason: "账号缺失" }); continue; }
    const token = key === "manager" ? managerSession.token : (await apiLogin(account)).token;
    const role = roles.find(([, roleKey]) => roleKey === key)?.[0] ?? key;
    const tag = tagFor(role);
    let customerId = null;
    try {
      const created = await apiRequest(token, "POST", "/customers", { storeId, customerType: "PERSONAL", name: tag, phone: `13${crypto.randomInt(1_000_000_000).toString().padStart(9, "0")}`, sourceType: "OTHER" });
      record(key, "客户", "create", created);
      customerId = firstId(created.data);
      if (!customerId) {
        const lookup = await apiRequest(managerSession.token, "GET", `/customers?storeId=${encodeURIComponent(storeId)}&q=${encodeURIComponent(tag)}`);
        customerId = listFrom(lookup.data).find((item) => item.name === tag)?.id ?? null;
      }
      if (customerId) {
        customerIds.set(key, customerId);
        record(key, "客户", "query", await apiRequest(token, "GET", `/customers/${customerId}`));
        record(key, "客户", "update", await apiRequest(token, "PATCH", `/customers/${customerId}`, { name: `${tag}-UPDATED` }));
        if (key === "manager") {
          record(key, "客户", "archive", await apiRequest(token, "POST", `/customers/${customerId}/archive`, { reason: "回归验收生命周期" }));
          record(key, "客户", "restore", await apiRequest(token, "POST", `/customers/${customerId}/restore`, { reason: "回归验收生命周期" }));
        }
      } else result.cleanup.push({ domain: "客户", tag, verdict: "BLOCKED", reason: "创建结果无法确认 ID，需人工核对" });
    } catch (error) { result.operations.push({ actor: key, domain: "客户", verdict: "FAIL", error: redactError(error) }); }
    finally { if (customerId) await cleanup("客户", customerId, managerSession.token, `/customers/${customerId}/archive`, "归档"); }
  }
  const managerCustomerId = customerIds.get("manager");
  const salesCustomerId = customerIds.get("permission-regression-sales");
  if (managerCustomerId && salesCustomerId) {
    try {
      const salesToken = (await apiLogin(accountByKey.get("permission-regression-sales"))).token;
      const serviceToken = (await apiLogin(accountByKey.get("permission-regression-customer-service"))).token;
      const own = await apiRequest(salesToken, "GET", `/customers/${salesCustomerId}`);
      const other = await apiRequest(salesToken, "GET", `/customers/${managerCustomerId}`);
      const store = await apiRequest(serviceToken, "GET", `/customers/${managerCustomerId}`);
      result.ownIsolation = { salesOwnStatus: own.status, salesOtherStatus: other.status, serviceStoreStatus: store.status, verdict: own.ok && other.status === 403 && store.ok ? "PASS" : "FAIL" };
    } catch (error) { result.ownIsolation = { verdict: "FAIL", error: redactError(error) }; }
  }
  return result;
}

async function runBindingInvalidation(accountByKey) {
  const result = { verdict: "BLOCKED", steps: [], cleanup: [] };
  if (process.env.MALLBAY_ENABLE_MUTATIONS !== "1" || process.env.MALLBAY_TEST_EXTERNAL_CHANNELS_DISABLED !== "1") {
    result.reason = "安全写入门禁未开启"; return result;
  }
  if (!accountByKey.has("aux-member") || !accountByKey.has("manager")) {
    result.reason = "需要独立且当前未加入门店的 [aux-member] 测试账号"; return result;
  }
  const manager = await apiLogin(accountByKey.get("manager"));
  const aux = await apiLogin(accountByKey.get("aux-member"));
  const managerMe = await apiRequest(manager.token, "GET", "/auth/me");
  const auxMe = await apiRequest(aux.token, "GET", "/auth/me");
  const storeId = managerMe.data?.storeMember?.store?.id ?? managerMe.data?.storeMember?.storeId ?? managerMe.data?.storeId;
  const auxId = auxMe.data?.id ?? aux.user?.id;
  if (!storeId || !auxId || auxMe.data?.storeMember) { result.reason = "辅助账号已绑定门店，或账号／门店无法核实"; return result; }
  let invitationId = null;
  let accepted = false;
  try {
    const before = await apiRequest(aux.token, "GET", `/products?storeId=${encodeURIComponent(storeId)}`);
    result.steps.push({ action: "before", status: before.status });
    if (before.status !== 403) { result.verdict = "FAIL"; return result; }
    const invited = await apiRequest(manager.token, "POST", `/stores/${encodeURIComponent(storeId)}/members/invite`, { userId: auxId, position: "SALES" });
    invitationId = firstId(invited.data);
    if (!invitationId) {
      const inbox = await apiRequest(aux.token, "GET", "/invitations");
      invitationId = listFrom(inbox.data).find((item) => item.storeId === storeId && item.status === "PENDING")?.id ?? null;
    }
    result.steps.push({ action: "invite", status: invited.status });
    if (!invited.ok || !invitationId) { result.verdict = "FAIL"; return result; }
    const acceptedResponse = await apiRequest(aux.token, "POST", `/invitations/${encodeURIComponent(invitationId)}/accept`, {});
    accepted = acceptedResponse.ok;
    result.steps.push({ action: "accept", status: acceptedResponse.status });
    if (!accepted) { result.verdict = "FAIL"; return result; }
    const during = await apiRequest(aux.token, "GET", `/products?storeId=${encodeURIComponent(storeId)}`);
    const revisionDuring = await apiRequest(aux.token, "GET", `/auth/me/permissions?storeId=${encodeURIComponent(storeId)}`);
    result.steps.push({ action: "after-accept-old-session", status: during.status, bindingVersion: revisionDuring.data?.bindingVersion ?? null });
    if (!during.ok) { result.verdict = "FAIL"; return result; }
    result.verdict = "PASS";
  } catch (error) { result.verdict = "FAIL"; result.error = redactError(error); }
  finally {
    if (!accepted) {
      const fresh = await apiRequest(aux.token, "GET", "/auth/me").catch(() => ({ data: null }));
      const currentStore = fresh.data?.storeMember?.store?.id ?? fresh.data?.storeMember?.storeId;
      accepted = currentStore === storeId;
    }
    if (accepted) {
      const removed = await apiRequest(manager.token, "DELETE", `/stores/${encodeURIComponent(storeId)}/members/${encodeURIComponent(auxId)}`).catch(() => ({ status: null, ok: false }));
      const after = await apiRequest(aux.token, "GET", `/products?storeId=${encodeURIComponent(storeId)}`).catch(() => ({ status: null }));
      const revisionAfter = await apiRequest(aux.token, "GET", `/auth/me/permissions?storeId=${encodeURIComponent(storeId)}`).catch(() => ({ data: null }));
      const beforeVersion = result.steps.find((step) => step.action === "after-accept-old-session")?.bindingVersion;
      const version = revisionAfter.data?.bindingVersion ?? null;
      const cleanupVerdict = removed.ok && after.status === 403 && typeof version === "number" && typeof beforeVersion === "number" && version > beforeVersion ? "PASS" : "FAIL";
      result.cleanup.push({ action: "manager-remove-and-old-session-deny", removeStatus: removed.status, oldSessionStatus: after.status, bindingVersion: version, verdict: cleanupVerdict });
      if (cleanupVerdict !== "PASS") result.verdict = "FAIL";
    } else if (invitationId) {
      const rejected = await apiRequest(aux.token, "POST", `/invitations/${encodeURIComponent(invitationId)}/reject`, {}).catch(() => ({ status: null, ok: false }));
      result.cleanup.push({ action: "reject-pending-invitation", status: rejected.status, verdict: rejected.ok ? "PASS" : "FAIL" });
      if (!rejected.ok) result.verdict = "FAIL";
    }
  }
  return result;
}

async function runPolicyVersionInvalidation(accountByKey) {
  const result = { verdict: "BLOCKED", steps: [], cleanup: [] };
  if (!accountByKey.has("hq-admin") || !accountByKey.has("manager")) { result.reason = "总部或店长测试账号缺失"; return result; }
  if (process.env.MALLBAY_ENABLE_MUTATIONS !== "1" || process.env.MALLBAY_TEST_EXTERNAL_CHANNELS_DISABLED !== "1" || process.env.MALLBAY_POLICY_EXCLUSIVE_WINDOW !== "1") {
    result.reason = "需独占 Test 治理窗口、写入门禁与外部通道关闭确认"; return result;
  }
  const hq = await apiLogin(accountByKey.get("hq-admin"));
  const manager = await apiLogin(accountByKey.get("manager"));
  const draft = await apiRequest(hq.token, "GET", "/permissions/policy/draft");
  if (!draft.ok || draft.data) { result.reason = draft.ok ? "存在未发布草稿，拒绝覆盖" : `草稿预检接口不可用（${draft.status}）`; return result; }
  const original = await apiRequest(hq.token, "GET", "/permissions/policy");
  const before = await apiRequest(manager.token, "GET", "/auth/me/permissions");
  if (!original.ok || !original.data?.id || !Array.isArray(original.data?.payload?.grants) || !before.ok || before.data?.policyVersion !== original.data.version) {
    result.reason = "发布基线与当前权限快照不一致"; return result;
  }
  let published = false;
  let candidateId = null;
  try {
    const candidate = await apiRequest(hq.token, "POST", "/permissions/policy/drafts", { payload: original.data.payload, expectedVersion: original.data.version });
    candidateId = candidate.data?.id ?? null;
    result.steps.push({ action: "create-identical-draft", status: candidate.status, version: candidate.data?.version ?? null });
    if (!candidate.ok || !candidate.data?.id) { result.verdict = "FAIL"; return result; }
    const validated = await apiRequest(hq.token, "POST", `/permissions/policy/${encodeURIComponent(candidate.data.id)}/validate`, {});
    result.steps.push({ action: "validate", status: validated.status, state: validated.data?.status ?? null });
    if (!validated.ok || validated.data?.status !== "VALIDATED") { result.verdict = "FAIL"; return result; }
    const unchanged = await apiRequest(hq.token, "GET", "/permissions/policy");
    if (!unchanged.ok || unchanged.data?.id !== original.data.id) { result.verdict = "FAIL"; result.reason = "测试期间发布基线已变化"; return result; }
    const publishedResponse = await apiRequest(hq.token, "POST", `/permissions/policy/${encodeURIComponent(candidate.data.id)}/publish`, { expectedVersion: candidate.data.version, expectedPublishedId: original.data.id });
    published = publishedResponse.ok;
    result.steps.push({ action: "publish", status: publishedResponse.status, version: publishedResponse.data?.version ?? null });
    if (!published) { result.verdict = "FAIL"; return result; }
    const after = await apiRequest(manager.token, "GET", "/auth/me/permissions");
    result.steps.push({ action: "old-session-new-policy-version", status: after?.status ?? null, version: after?.data?.policyVersion ?? null });
    result.verdict = after?.ok && after.data?.policyVersion === publishedResponse.data?.version && after.data.policyVersion > before.data.policyVersion ? "PASS" : "FAIL";
  } catch (error) { result.verdict = "FAIL"; result.error = redactError(error); }
  finally {
    const current = candidateId ? await apiRequest(hq.token, "GET", "/permissions/policy").catch(() => ({ data: null })) : { data: null };
    if (current.data?.id === candidateId) published = true;
    if (published) {
      const expectedPublishedVersion = result.steps.find((step) => step.action === "publish")?.version ?? current.data?.version;
      if (current.data?.id !== candidateId || current.data?.version !== expectedPublishedVersion) {
        result.cleanup.push({ action: "rollback", verdict: "FAIL", reason: "发布版本被其他操作者改变，停止自动回滚" });
        result.verdict = "FAIL";
      } else {
        const rollback = await apiRequest(hq.token, "POST", `/permissions/policy/${encodeURIComponent(original.data.id)}/rollback`, {}).catch(() => ({ status: null, ok: false }));
        const restored = await apiRequest(hq.token, "GET", "/permissions/policy").catch(() => ({ data: null }));
        const managerRestored = await apiRequest(manager.token, "GET", "/auth/me/permissions").catch(() => ({ data: null }));
        const grants = (payload) => JSON.stringify((payload?.grants ?? []).map((item) => `${item.roleCode}|${item.permissionCode}|${item.action}|${item.scope}`).sort());
        const cleanupVerdict = rollback.ok && restored.data?.version > current.data.version && grants(restored.data?.payload) === grants(original.data.payload) && managerRestored.data?.policyVersion === restored.data?.version ? "PASS" : "FAIL";
        result.cleanup.push({ action: "rollback-and-compare-grants", status: rollback.status, restoredVersion: restored.data?.version ?? null, verdict: cleanupVerdict });
        if (cleanupVerdict !== "PASS") result.verdict = "FAIL";
      }
    } else if (result.steps.some((step) => step.action === "create-identical-draft" && step.status < 300)) {
      result.cleanup.push({ action: "draft-residue", verdict: "FAIL", reason: "发布前失败，草稿保留供人工核对；不物理删除" });
      result.verdict = "FAIL";
    }
  }
  return result;
}

async function main() {
  fs.mkdirSync(screenshotDir, { recursive: true });
  const report = {
    suite: "MallBay 全角色权限矩阵与业务功能 Playwright UI 自动化验收",
    status: "RUNNING",
    runId,
    startedAt: new Date().toISOString(),
    environment: { appUrl, apiUrl },
    browser: { engine: "Playwright Chromium", headless: true, freshContextPerRole: true },
    accountsSource: process.env.MALLBAY_ACCOUNTS_TEXT ? "CI Secret" : "local file",
    passwordHandling: "密码仅在本地进程内读取和填入，不写入日志、报告、截图或错误消息",
    roles: [],
    screenshots: [],
    operations: null,
    limitations: ["未执行真实支付、发票发送、短信、邮件、外部通知或物理删除"],
    errors: []
  };
  let browser;
  try {
    assertTestOrigins();
    const accountByKey = parseAccounts(process.env.MALLBAY_ACCOUNTS_TEXT ?? fs.readFileSync(accountFile, "utf8"));
    report.preflight = {
      mainAccountsPresent: ROLE_KEYS.every((key) => accountByKey.has(key)),
      hqAccountPresent: accountByKey.has("hq-admin"),
      mutationsEnabled: process.env.MALLBAY_ENABLE_MUTATIONS === "1" && process.env.MALLBAY_TEST_EXTERNAL_CHANNELS_DISABLED === "1",
      secondStoreProvided: Boolean(process.env.MALLBAY_SECOND_STORE_ID)
    };
    browser = await chromium.launch({ headless: true, ...(chromePath ? { executablePath: chromePath } : {}) });
    let secondStoreId = process.env.MALLBAY_SECOND_STORE_ID || null;
    let secondStoreCustomerId = process.env.MALLBAY_SECOND_STORE_CUSTOMER_ID || null;
    let secondStoreProductId = process.env.MALLBAY_SECOND_STORE_PRODUCT_ID || null;
    report.headquarters = { verdict: "BLOCKED", reason: "总部管理员测试凭据缺失" };
    if (accountByKey.has("hq-admin")) {
      const hq = { verdict: "BLOCKED", page: null, bindingsRead: null, storesInventory: null, publishedPolicyVersion: null, manualWrites: [], screenshots: [] };
      report.headquarters = hq;
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
      try {
        const session = await apiLogin(accountByKey.get("hq-admin"));
        const page = await context.newPage();
        await loginUi(page, accountByKey.get("hq-admin"));
        await page.goto(`${appUrl}/settings/role-bindings`, { waitUntil: "domcontentloaded", timeout: 20000 });
        const text = await waitForTerminalPage(page);
        const state = classifyPage(text, page.url(), 200);
        hq.page = { url: page.url(), verdict: state.ok && !/绑定并生效|新增门店角色绑定/.test(text) ? "PASS" : "FAIL" };
        const shot = path.join(screenshotDir, "总部-角色绑定只读.png");
        await page.screenshot({ path: shot, fullPage: true });
        hq.screenshots.push(shot); report.screenshots.push(shot);
        const me = await apiRequest(session.token, "GET", "/auth/me");
        const bindingRead = await apiRequest(session.token, "GET", `/permissions/role-bindings?userId=${encodeURIComponent(me.data?.id ?? "invalid")}`);
        hq.bindingsRead = { status: bindingRead.status, verdict: bindingRead.ok ? "PASS" : "FAIL" };
        const stores = await apiRequest(session.token, "GET", "/stores/admin/all");
        const allStores = listFrom(stores.data);
        hq.storesInventory = { status: stores.status, count: allStores.length, verdict: stores.ok ? "PASS" : "FAIL" };
        if (!secondStoreId) {
          const managerSession = await apiLogin(accountByKey.get("manager"));
          const managerMe = await apiRequest(managerSession.token, "GET", "/auth/me");
          const mainStore = managerMe.data?.storeMember?.store?.id ?? managerMe.data?.storeMember?.storeId ?? managerMe.data?.storeId;
          secondStoreId = allStores.find((store) => store.id && store.id !== mainStore && store.status === "PUBLISHED")?.id ?? null;
        }
        if (secondStoreId) {
          const [customers, products] = await Promise.all([
            apiRequest(session.token, "GET", `/customers?storeId=${encodeURIComponent(secondStoreId)}`),
            apiRequest(session.token, "GET", `/products?storeId=${encodeURIComponent(secondStoreId)}`)
          ]);
          if (!secondStoreCustomerId && customers.ok) secondStoreCustomerId = listFrom(customers.data).find((item) => item.id)?.id ?? null;
          if (!secondStoreProductId && products.ok) secondStoreProductId = listFrom(products.data).find((item) => item.id)?.id ?? null;
          const [customerDetail, productDetail] = await Promise.all([
            secondStoreCustomerId ? apiRequest(session.token, "GET", `/customers/${encodeURIComponent(secondStoreCustomerId)}`) : Promise.resolve(null),
            secondStoreProductId ? apiRequest(session.token, "GET", `/products/${encodeURIComponent(secondStoreProductId)}`) : Promise.resolve(null)
          ]);
          if (!customerDetail?.ok || customerDetail.data?.storeId !== secondStoreId) secondStoreCustomerId = null;
          if (!productDetail?.ok || productDetail.data?.storeId !== secondStoreId) secondStoreProductId = null;
        }
        const policy = await apiRequest(session.token, "GET", "/permissions/policy");
        hq.publishedPolicyVersion = policy.ok ? policy.data?.version ?? null : null;
        for (const probe of MANUAL_BINDING_WRITES) {
          if (process.env.MALLBAY_ENABLE_MUTATIONS !== "1") {
            hq.manualWrites.push({ method: probe.method, route: probe.route, verdict: "BLOCKED", reason: "只读模式跳过写方法探针" });
            continue;
          }
          const response = await apiRequest(session.token, probe.method, probe.route, probe.body);
          hq.manualWrites.push({ method: probe.method, route: probe.route, status: response.status, verdict: response.status === 403 ? "PASS" : "FAIL" });
        }
        const outcomes = [hq.page.verdict, hq.bindingsRead.verdict, hq.storesInventory.verdict, ...hq.manualWrites.map((item) => item.verdict)];
        hq.verdict = outcomes.includes("FAIL") ? "FAIL" : outcomes.includes("BLOCKED") ? "BLOCKED" : "PASS";
      } catch (error) { hq.verdict = "FAIL"; hq.error = redactError(error); }
      finally { await context.close().catch(() => undefined); }
    }
    report.preflight.secondStoreAvailable = Boolean(secondStoreId);
    report.preflight.secondStoreCustomerFixtureAvailable = Boolean(secondStoreCustomerId);
    report.preflight.secondStoreProductFixtureAvailable = Boolean(secondStoreProductId);
    for (const [label, key] of roles) {
      const account = accountByKey.get(key);
      const roleResult = { role: label, accountKey: key, login: null, refresh: null, logout: null, menu: null, routes: [], api: [], screenshots: [], errors: [] };
      report.roles.push(roleResult);
      if (!account) { roleResult.login = { ok: false, verdict: "BLOCKED", error: "账号段缺失" }; continue; }
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, ignoreHTTPSErrors: true });
      const page = await context.newPage();
      try {
        await loginUi(page, account);
        roleResult.login = { ok: true, landedPath: new URL(page.url()).pathname };
        const homeShot = path.join(screenshotDir, `${label}-home.png`);
        await page.screenshot({ path: homeShot, fullPage: true });
        roleResult.screenshots.push(homeShot); report.screenshots.push(homeShot);
        await page.reload({ waitUntil: "networkidle", timeout: 30000 });
        roleResult.refresh = { ok: !page.url().endsWith("/auth"), landedPath: new URL(page.url()).pathname };
        const session = await apiLogin(account);
        const me = await apiRequest(session.token, "GET", "/auth/me");
        const storeId = me.data?.storeMember?.store?.id ?? me.data?.storeMember?.storeId ?? me.data?.storeId;
        await runRouteMatrix(page, key, storeId, roleResult);
        roleResult.apiUser = { ok: me.ok, hasStore: Boolean(storeId), permissionSnapshot: null };
        const permissions = await apiRequest(session.token, "GET", storeId ? `/auth/me/permissions?storeId=${encodeURIComponent(storeId)}` : "/auth/me/permissions");
        roleResult.apiUser.permissionSnapshot = { status: permissions.status, ok: permissions.ok, count: Array.isArray(permissions.data?.permissions) ? permissions.data.permissions.length : null };
        const otherStoreId = secondStoreId;
        if (otherStoreId && otherStoreId !== storeId) {
          const otherCustomers = await apiRequest(session.token, "GET", `/customers?storeId=${encodeURIComponent(otherStoreId)}`);
          const otherProducts = await apiRequest(session.token, "GET", `/products?storeId=${encodeURIComponent(otherStoreId)}`);
          const customerFixture = secondStoreCustomerId;
          const productFixture = secondStoreProductId;
          const customerDetail = customerFixture ? await apiRequest(session.token, "GET", `/customers/${encodeURIComponent(customerFixture)}`) : null;
          const productDetail = productFixture ? await apiRequest(session.token, "GET", `/products/${encodeURIComponent(productFixture)}`) : null;
          const listVerdict = otherCustomers.status === 403 && otherProducts.status === 403 ? "PASS" : "FAIL";
          const resourceVerdict = !customerFixture || !productFixture ? "BLOCKED" : customerDetail?.status === 403 && productDetail?.status === 403 ? "PASS" : "FAIL";
          roleResult.apiUser.crossStoreIsolation = { customersStatus: otherCustomers.status, productsStatus: otherProducts.status, customerDetailStatus: customerDetail?.status ?? null, productDetailStatus: productDetail?.status ?? null, expected: 403, listVerdict, resourceVerdict, verdict: listVerdict === "FAIL" || resourceVerdict === "FAIL" ? "FAIL" : resourceVerdict === "BLOCKED" ? "BLOCKED" : "PASS" };
        } else roleResult.apiUser.crossStoreIsolation = { verdict: "BLOCKED", reason: "需要已核实的第二 Test 门店 ID" };
        await runApiMatrix(session.token, storeId, key, roleResult);
        const forbiddenShot = roleResult.routes.find((item) => item.forbidden);
        if (forbiddenShot) {
          const forbiddenRoute = forbiddenShot.route.replace(":storeId", encodeURIComponent(storeId ?? ""));
          await page.goto(`${appUrl}${forbiddenRoute}`, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => undefined);
          await waitForTerminalPage(page).catch(() => undefined);
          const shot = path.join(screenshotDir, `${label}-forbidden.png`);
          await page.screenshot({ path: shot, fullPage: true });
          roleResult.screenshots.push(shot); report.screenshots.push(shot);
        }
        await page.goto(`${appUrl}/orders`, { waitUntil: "domcontentloaded", timeout: 20000 });
        await logoutUi(page);
        roleResult.logout = { ok: page.url().endsWith("/auth") };
      } catch (error) {
        roleResult.errors.push(redactError(error));
      } finally {
        await context.close().catch(() => undefined);
      }
    }
    report.operations = await runReversibleCrud(accountByKey).catch((error) => ({ error: redactError(error), operations: [{ verdict: "FAIL" }], cleanup: [] }));
    report.governance = {
      roleBindingVersion: await runBindingInvalidation(accountByKey).catch((error) => ({ verdict: "FAIL", error: redactError(error) })),
      policyVersion: await runPolicyVersionInvalidation(accountByKey).catch((error) => ({ verdict: "FAIL", error: redactError(error) }))
    };
    const verdicts = [
      ...report.roles.flatMap((role) => [role.menu?.verdict ?? "BLOCKED", role.quickActions?.verdict ?? "BLOCKED", role.apiUser?.crossStoreIsolation?.verdict ?? "BLOCKED", ...role.routes.filter((item) => item.verdict !== "OBSERVED").map((item) => item.verdict), ...role.api.filter((item) => item.verdict !== "OBSERVED").map((item) => item.verdict), role.login?.verdict ?? (role.login?.ok ? "PASS" : "FAIL"), role.login?.verdict === "BLOCKED" ? "BLOCKED" : role.refresh?.ok ? "PASS" : "FAIL", role.login?.verdict === "BLOCKED" ? "BLOCKED" : role.logout?.ok ? "PASS" : "FAIL", ...(role.errors.length ? ["FAIL"] : [])]),
      ...report.operations.operations.map((item) => item.verdict), ...report.operations.cleanup.map((item) => item.verdict), report.operations.ownIsolation?.verdict ?? "BLOCKED",
      ...report.operations.blockedDomains?.map(() => "BLOCKED") ?? [],
      report.governance.roleBindingVersion.verdict, ...report.governance.roleBindingVersion.cleanup?.map((item) => item.verdict) ?? [], report.governance.policyVersion.verdict, ...report.governance.policyVersion.cleanup?.map((item) => item.verdict) ?? [], report.headquarters.verdict
    ];
    report.coverage = { domains: Object.keys(DOMAIN_READS), expectedCells: verdicts.length, passed: verdicts.filter((value) => value === "PASS").length, failed: verdicts.filter((value) => value === "FAIL").length, blocked: verdicts.filter((value) => value === "BLOCKED").length };
    report.status = report.errors.length || verdicts.includes("FAIL") ? "FAIL" : verdicts.includes("BLOCKED") ? "BLOCKED" : "PASS";
  } catch (error) {
    report.status = "BLOCKED";
    report.errors.push(redactError(error));
  } finally {
    await browser?.close().catch(() => undefined);
    report.finishedAt = new Date().toISOString();
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  if (report.status !== "PASS") process.exitCode = 1;
  console.log(JSON.stringify({ status: report.status, reportPath, screenshotDir, roleCount: report.roles.length, screenshotCount: report.screenshots.length }));
}

await main();
