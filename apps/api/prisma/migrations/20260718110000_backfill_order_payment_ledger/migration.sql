-- 历史订单收款早于财务流水模型，之前只写入了 OrderPayment。
-- 将每笔历史收款补成收入流水；以订单收款 ID 做来源，重复执行也不会重复入账。
INSERT INTO "PaymentRecord" (
  "id",
  "storeId",
  "accountId",
  "type",
  "direction",
  "amountCents",
  "sourceId",
  "note",
  "createdById",
  "createdAt",
  "occurredAt"
)
SELECT
  'legacy-order-payment-' || op."id",
  o."storeId",
  op."accountId",
  'ORDER_PAYMENT'::"PaymentRecordType",
  'INCOME'::"PaymentDirection",
  op."amountCents",
  op."id",
  '订单收款 · ' || o."orderNo",
  op."createdById",
  op."createdAt",
  op."paidAt"
FROM "OrderPayment" op
JOIN "Order" o ON o."id" = op."orderId"
WHERE NOT EXISTS (
  SELECT 1
  FROM "PaymentRecord" pr
  WHERE pr."type" = 'ORDER_PAYMENT'::"PaymentRecordType"
    AND pr."sourceId" = op."id"
);
