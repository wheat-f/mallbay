-- Managers own their store-level configuration.  Keep the persisted system
-- role aligned with the legacy StoreMember permission fallback so both newly
-- migrated and not-yet-migrated managers can load dictionaries.
INSERT INTO "PermissionDefinition" ("code", "name", "resource", "actions", "supportedScopes", "status", "createdAt", "updatedAt")
VALUES ('settings', '系统设置', 'settings', ARRAY['read', 'write'], ARRAY['OWN', 'STORE', 'GLOBAL'], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "resource" = EXCLUDED."resource",
    "actions" = EXCLUDED."actions",
    "supportedScopes" = EXCLUDED."supportedScopes",
    "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP;

WITH grants("roleCode", "permissionCode", "action", "scope") AS (
  VALUES
    ('HQ_ADMIN', 'settings', 'read', 'GLOBAL'),
    ('HQ_ADMIN', 'settings', 'write', 'GLOBAL'),
    ('MANAGER', 'settings', 'read', 'STORE'),
    ('MANAGER', 'settings', 'write', 'STORE')
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
