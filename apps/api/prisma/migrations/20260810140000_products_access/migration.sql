INSERT INTO "PermissionDefinition" ("code", "name", "resource", "actions", "supportedScopes", "status", "createdAt", "updatedAt")
VALUES ('products', '产品目录', 'products', ARRAY['read', 'write'], ARRAY['OWN', 'STORE', 'GLOBAL'], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "resource" = EXCLUDED."resource",
    "actions" = EXCLUDED."actions",
    "supportedScopes" = EXCLUDED."supportedScopes",
    "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP;

WITH grants("roleCode", "action", "scope") AS (
  VALUES
    ('HQ_ADMIN', 'read', 'GLOBAL'), ('HQ_ADMIN', 'write', 'GLOBAL'),
    ('MANAGER', 'read', 'STORE'), ('MANAGER', 'write', 'STORE'),
    ('SALES', 'read', 'STORE'), ('CUSTOMER_SERVICE', 'read', 'STORE'),
    ('PURCHASING', 'read', 'STORE'), ('PURCHASING', 'write', 'STORE'),
    ('FINANCE', 'read', 'STORE'), ('SCHEDULER', 'read', 'STORE'),
    ('CONSTRUCTION', 'read', 'STORE'), ('APPRENTICE', 'read', 'STORE')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5(grants."roleCode" || '|products|' || grants."action" || '|' || grants."scope"),
       role.id, 'products', grants."action", grants."scope"
FROM grants
JOIN "PermissionRole" role ON role.code = grants."roleCode"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;
