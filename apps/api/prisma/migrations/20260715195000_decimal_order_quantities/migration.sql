-- Preserve fractional sales quantities for meter and square-meter products.
ALTER TABLE "OrderItem" ALTER COLUMN "quantity" TYPE DECIMAL(12, 3) USING "quantity"::numeric;
ALTER TABLE "SalesQuoteItem" ALTER COLUMN "quantity" TYPE DECIMAL(12, 3) USING "quantity"::numeric;
