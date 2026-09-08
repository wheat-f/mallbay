-- Product creation and default suggested-price maintenance share one
-- capability.  Older role grants only contained products:read/write, which
-- prevented already-migrated managers and HQ administrators from saving.
INSERT INTO "PermissionDefinition" ("code", "name", "resource", "actions", "supportedScopes", "status", "createdAt", "updatedAt")
VALUES (
  'products',
  '产品目录',
  'products',
  ARRAY['read', 'write', 'suggested-price-write'],
  ARRAY['OWN', 'STORE', 'GLOBAL'],
  'ACTIVE',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "resource" = EXCLUDED."resource",
    "actions" = EXCLUDED."actions",
    "supportedScopes" = EXCLUDED."supportedScopes",
    "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP;

WITH grants("roleCode", "permissionCode", "action", "scope") AS (
  VALUES
    ('HQ_ADMIN', 'products', 'suggested-price-write', 'GLOBAL'),
    ('MANAGER', 'products', 'suggested-price-write', 'STORE')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5(grants."roleCode" || '|' || grants."permissionCode" || '|' || grants."action" || '|' || grants."scope"),
       role."id",
       grants."permissionCode",
       grants."action",
       grants."scope"
FROM grants
JOIN "PermissionRole" role ON role."code" = grants."roleCode"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;
