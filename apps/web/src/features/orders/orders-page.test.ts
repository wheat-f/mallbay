import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("orders page preserves filters in the URL", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");

  assert.match(pageSource, /useSearchParams/);
  assert.match(pageSource, /searchParams\.get\("q"\)/);
  assert.match(pageSource, /searchParams\.get\("status"\)/);
  assert.match(pageSource, /searchParams\.get\("constructionType"\)/);
  assert.match(pageSource, /searchParams\.get\("paymentStatus"\)/);
  assert.match(pageSource, /searchParams\.get\("createdFrom"\)/);
  assert.match(pageSource, /searchParams\.get\("createdTo"\)/);
  assert.match(pageSource, /router\.replace/);
  assert.match(pageSource, /updateOrderListUrl/);
});

test("orders page preserves pagination in the URL", () => {
  const pageSource = readFileSync("app/orders/page.tsx", "utf8");

  assert.match(pageSource, /searchParams\.get\("page"\)/);
  assert.match(pageSource, /searchParams\.get\("pageSize"\)/);
  assert.match(pageSource, /setPage/);
  assert.match(pageSource, /setPageSize/);
  assert.match(pageSource, /current: page/);
  assert.match(pageSource, /pageSize/);
  assert.match(pageSource, /total: ordersQuery\.data\?\.total/);
  assert.match(pageSource, /updateOrderListUrl\(\{ page: nextPage, pageSize: nextPageSize \}\)/);
});
