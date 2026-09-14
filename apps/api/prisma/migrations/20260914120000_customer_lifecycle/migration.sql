-- Customer lifecycle is reversible; existing records remain active.
CREATE TYPE "CustomerStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

ALTER TABLE "Customer"
  ADD COLUMN "status" "CustomerStatus" NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT,
  ADD COLUMN "archivedReason" TEXT;

CREATE INDEX "Customer_storeId_status_idx" ON "Customer"("storeId", "status");

ALTER TABLE "Customer"
  ADD CONSTRAINT "Customer_archivedById_fkey"
  FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

WITH catalog("code", "name", "resource", "actions", "supportedScopes") AS (
  VALUES
    ('customers', '客户', 'customers', ARRAY['read','write','archive','restore'], ARRAY['OWN','STORE','GLOBAL']),
    ('products', '产品', 'products', ARRAY['read','write','suggested-price-write','disable','enable'], ARRAY['STORE','GLOBAL']),
    ('finance.cost', '财务成本', 'finance', ARRAY['read','write'], ARRAY['STORE','GLOBAL'])
)
INSERT INTO "PermissionDefinition" ("code", "name", "resource", "actions", "supportedScopes", "status", "createdAt", "updatedAt")
SELECT "code", "name", "resource", "actions", "supportedScopes", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM catalog
ON CONFLICT ("code") DO UPDATE
SET "actions" = EXCLUDED."actions",
    "supportedScopes" = EXCLUDED."supportedScopes",
    "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP;

WITH grants("roleCode", "permissionCode", "action", "scope") AS (
  VALUES
    ('HQ_ADMIN', 'customers', 'archive', 'GLOBAL'),
    ('HQ_ADMIN', 'customers', 'restore', 'GLOBAL'),
    ('HQ_ADMIN', 'products', 'disable', 'GLOBAL'),
    ('HQ_ADMIN', 'products', 'enable', 'GLOBAL'),
    ('MANAGER', 'customers', 'archive', 'STORE'),
    ('MANAGER', 'customers', 'restore', 'STORE'),
    ('MANAGER', 'products', 'disable', 'STORE'),
    ('MANAGER', 'products', 'enable', 'STORE'),
    ('MANAGER', 'finance.cost', 'read', 'STORE'),
    ('MANAGER', 'finance.cost', 'write', 'STORE'),
    ('FINANCE', 'finance.cost', 'write', 'STORE')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5('mallbay:lifecycle:' || role."id" || ':' || grants."permissionCode" || ':' || grants."action" || ':' || grants."scope"),
       role."id", grants."permissionCode", grants."action", grants."scope"
FROM grants
JOIN "PermissionRole" role ON role."code" = grants."roleCode"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;

-- Workbench metadata is readable by every bound store role. Business data
-- permissions still decide which modules and resources each role can use.
WITH store_read_roles("roleCode") AS (
  VALUES
    ('MANAGER'), ('SALES'), ('CUSTOMER_SERVICE'), ('PURCHASING'),
    ('FINANCE'), ('SCHEDULER'), ('CONSTRUCTION'), ('APPRENTICE')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5('mallbay:store-read:' || role."id"), role."id", 'store', 'read', 'STORE'
FROM store_read_roles allowed
JOIN "PermissionRole" role ON role."code" = allowed."roleCode"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;
