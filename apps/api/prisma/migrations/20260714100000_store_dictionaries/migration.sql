CREATE TYPE "DictionaryStatus" AS ENUM ('ACTIVE', 'INACTIVE');

CREATE TABLE "Dictionary" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "status" "DictionaryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dictionary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Dictionary_storeId_code_key" ON "Dictionary"("storeId", "code");
CREATE INDEX "Dictionary_storeId_status_idx" ON "Dictionary"("storeId", "status");

ALTER TABLE "Dictionary" ADD CONSTRAINT "Dictionary_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
