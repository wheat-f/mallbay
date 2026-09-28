ALTER TABLE "User" ADD COLUMN "authRevision" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "StoreBindingCommand" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "intentHash" TEXT NOT NULL,
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreBindingCommand_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StoreMember_one_manager_per_store_uidx"
ON "StoreMember" ("storeId") WHERE "position" = 'MANAGER';
