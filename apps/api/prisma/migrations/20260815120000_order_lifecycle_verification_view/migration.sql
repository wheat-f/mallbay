-- Separate read access from the authority to resolve historical lifecycle cases.
UPDATE "PermissionDefinition"
SET "actions" = ARRAY['finalize', 'cancel', 'cross_store_source_manage', 'verification_view', 'verification_resolve'],
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'orders.lifecycle';

WITH grants("roleCode", "action", "scope") AS (
  VALUES
    ('HQ_ADMIN', 'verification_view', 'GLOBAL'),
    ('MANAGER', 'verification_view', 'STORE')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5(grants."roleCode" || '|orders.lifecycle|' || grants."action" || '|' || grants."scope"),
       role."id", 'orders.lifecycle', grants."action", grants."scope"
FROM grants
JOIN "PermissionRole" role ON role."code" = grants."roleCode"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;
