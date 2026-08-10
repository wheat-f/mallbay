INSERT INTO "PermissionDefinition" ("code", "name", "resource", "actions", "supportedScopes", "status", "createdAt", "updatedAt")
VALUES ('orders', '订单', 'orders', ARRAY['read', 'write'], ARRAY['OWN', 'STORE', 'GLOBAL'], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
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
    ('SALES', 'read', 'OWN'), ('SALES', 'write', 'OWN'),
    ('CUSTOMER_SERVICE', 'read', 'STORE'), ('CUSTOMER_SERVICE', 'write', 'STORE'),
    ('PURCHASING', 'read', 'STORE'), ('FINANCE', 'read', 'STORE'),
    ('SCHEDULER', 'read', 'STORE'), ('CONSTRUCTION', 'read', 'STORE'), ('APPRENTICE', 'read', 'STORE')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5(grants."roleCode" || '|orders|' || grants."action" || '|' || grants."scope"),
       role.id, 'orders', grants."action", grants."scope"
FROM grants
JOIN "PermissionRole" role ON role.code = grants."roleCode"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;
