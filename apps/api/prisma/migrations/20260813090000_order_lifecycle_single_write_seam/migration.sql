-- Order lifecycle command protocol, version ledger, verification cases and
-- quote creation idempotency. Historical rows intentionally receive version 1
-- without fabricated command/version-change history.
CREATE TYPE "OrderLifecycleCommandStatus" AS ENUM ('SUCCEEDED', 'REJECTED');
CREATE TYPE "OrderLifecycleVerificationStatus" AS ENUM ('OPEN', 'RESOLVED');
ALTER TYPE "ConstructionTaskStatus" ADD VALUE IF NOT EXISTS 'CANCELLED';

ALTER TABLE "Order"
ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "SalesQuote"
ADD COLUMN "idempotencyKey" TEXT,
ADD COLUMN "idempotencyActorId" TEXT,
ADD COLUMN "requestFingerprint" TEXT;

CREATE UNIQUE INDEX "SalesQuote_storeId_idempotencyActorId_idempotencyKey_key"
ON "SalesQuote"("storeId", "idempotencyActorId", "idempotencyKey");

CREATE TABLE "OrderLifecycleCommandRecord" (
  "id" TEXT NOT NULL,
  "orderId" TEXT,
  "storeId" TEXT NOT NULL,
  "commandId" TEXT NOT NULL,
  "commandType" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "requestFingerprint" TEXT NOT NULL,
  "expectedVersion" INTEGER,
  "beforeVersion" INTEGER,
  "afterVersion" INTEGER,
  "status" "OrderLifecycleCommandStatus" NOT NULL,
  "inputSummary" JSONB NOT NULL,
  "resultSummary" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "OrderLifecycleCommandRecord_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderLifecycleCommandRecord_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrderLifecycleCommandRecord_storeId_commandId_key"
ON "OrderLifecycleCommandRecord"("storeId", "commandId");
CREATE INDEX "OrderLifecycleCommandRecord_orderId_createdAt_idx"
ON "OrderLifecycleCommandRecord"("orderId", "createdAt");
CREATE INDEX "OrderLifecycleCommandRecord_actorId_createdAt_idx"
ON "OrderLifecycleCommandRecord"("actorId", "createdAt");

CREATE TABLE "OrderLifecycleVersionChange" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "beforeVersion" INTEGER NOT NULL,
  "afterVersion" INTEGER NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "sourceRefs" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderLifecycleVersionChange_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderLifecycleVersionChange_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderLifecycleVersionChange_monotonic_check"
    CHECK ("afterVersion" = "beforeVersion" + 1)
);

CREATE UNIQUE INDEX "OrderLifecycleVersionChange_orderId_afterVersion_key"
ON "OrderLifecycleVersionChange"("orderId", "afterVersion");
CREATE UNIQUE INDEX "OrderLifecycleVersionChange_sourceType_sourceKey_key"
ON "OrderLifecycleVersionChange"("sourceType", "sourceKey");
CREATE INDEX "OrderLifecycleVersionChange_orderId_createdAt_idx"
ON "OrderLifecycleVersionChange"("orderId", "createdAt");

CREATE TABLE "OrderLifecycleVerificationCase" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "issueCodes" JSONB NOT NULL,
  "status" "OrderLifecycleVerificationStatus" NOT NULL DEFAULT 'OPEN',
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "detectedBy" TEXT NOT NULL,
  "resolutionSummary" JSONB,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,
  CONSTRAINT "OrderLifecycleVerificationCase_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderLifecycleVerificationCase_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "OrderLifecycleVerificationCase_orderId_status_idx"
ON "OrderLifecycleVerificationCase"("orderId", "status");
CREATE INDEX "OrderLifecycleVerificationCase_status_detectedAt_idx"
ON "OrderLifecycleVerificationCase"("status", "detectedAt");
CREATE UNIQUE INDEX "OrderLifecycleVerificationCase_one_open_per_order_key"
ON "OrderLifecycleVerificationCase"("orderId") WHERE "status" = 'OPEN';

INSERT INTO "PermissionDefinition" ("code", "name", "resource", "actions", "supportedScopes", "status", "createdAt", "updatedAt")
VALUES ('orders.lifecycle', '订单履约', 'orders.lifecycle', ARRAY['finalize', 'cancel', 'cross_store_source_manage', 'verification_view', 'verification_resolve'], ARRAY['STORE', 'GLOBAL'], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "resource" = EXCLUDED."resource",
    "actions" = EXCLUDED."actions",
    "supportedScopes" = EXCLUDED."supportedScopes",
    "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP;

WITH grants("roleCode", "action", "scope") AS (
  VALUES
    ('HQ_ADMIN', 'finalize', 'GLOBAL'),
    ('HQ_ADMIN', 'cancel', 'GLOBAL'),
    ('HQ_ADMIN', 'cross_store_source_manage', 'GLOBAL'),
    ('HQ_ADMIN', 'verification_view', 'GLOBAL'),
    ('HQ_ADMIN', 'verification_resolve', 'GLOBAL'),
    ('MANAGER', 'finalize', 'STORE'),
    ('MANAGER', 'cancel', 'STORE'),
    ('MANAGER', 'cross_store_source_manage', 'STORE'),
    ('MANAGER', 'verification_view', 'STORE'),
    ('MANAGER', 'verification_resolve', 'STORE')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5(grants."roleCode" || '|orders.lifecycle|' || grants."action" || '|' || grants."scope"),
       role.id, 'orders.lifecycle', grants."action", grants."scope"
FROM grants
JOIN "PermissionRole" role ON role.code = grants."roleCode"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;
