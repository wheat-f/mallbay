-- Repair the permission-catalog migration's settings role matrix.
-- Managers own store operations and store audit; finance owns finance settings
-- and finance audit. Every authenticated role retains its own profile.

INSERT INTO "PermissionDefinition" ("code", "name", "resource", "actions", "supportedScopes", "status", "createdAt", "updatedAt")
VALUES ('settings.audit.store', '门店审计', 'settings', ARRAY['read'], ARRAY['STORE'], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "resource" = EXCLUDED."resource",
    "actions" = EXCLUDED."actions",
    "supportedScopes" = EXCLUDED."supportedScopes",
    "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP;

DELETE FROM "PermissionRoleGrant"
WHERE "roleId" IN (
  SELECT "id" FROM "PermissionRole"
  WHERE "code" IN ('MANAGER', 'SALES', 'CUSTOMER_SERVICE', 'PURCHASING', 'SCHEDULER', 'CONSTRUCTION', 'APPRENTICE')
)
AND "permissionCode" IN ('finance.labor_cost', 'finance.settlement', 'finance.accounts', 'finance.audit');

WITH grants("roleCode", "permissionCode", "action", "scope") AS (
  VALUES
    ('MANAGER', 'settings.audit.store', 'read', 'STORE'),
    ('FINANCE', 'finance.labor_cost', 'read', 'STORE'),
    ('FINANCE', 'finance.labor_cost', 'write', 'STORE'),
    ('FINANCE', 'finance.settlement', 'read', 'STORE'),
    ('FINANCE', 'finance.settlement', 'write', 'STORE'),
    ('FINANCE', 'finance.accounts', 'read', 'STORE'),
    ('FINANCE', 'finance.accounts', 'write', 'STORE'),
    ('FINANCE', 'finance.audit', 'read', 'STORE'),
    ('HQ_ADMIN', 'account.profile', 'read', 'OWN'),
    ('HQ_ADMIN', 'account.profile', 'write', 'OWN'),
    ('MANAGER', 'account.profile', 'read', 'OWN'),
    ('MANAGER', 'account.profile', 'write', 'OWN'),
    ('SALES', 'account.profile', 'read', 'OWN'),
    ('SALES', 'account.profile', 'write', 'OWN'),
    ('CUSTOMER_SERVICE', 'account.profile', 'read', 'OWN'),
    ('CUSTOMER_SERVICE', 'account.profile', 'write', 'OWN'),
    ('PURCHASING', 'account.profile', 'read', 'OWN'),
    ('PURCHASING', 'account.profile', 'write', 'OWN'),
    ('FINANCE', 'account.profile', 'read', 'OWN'),
    ('FINANCE', 'account.profile', 'write', 'OWN'),
    ('SCHEDULER', 'account.profile', 'read', 'OWN'),
    ('SCHEDULER', 'account.profile', 'write', 'OWN'),
    ('CONSTRUCTION', 'account.profile', 'read', 'OWN'),
    ('CONSTRUCTION', 'account.profile', 'write', 'OWN'),
    ('APPRENTICE', 'account.profile', 'read', 'OWN'),
    ('APPRENTICE', 'account.profile', 'write', 'OWN')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5('mallbay:settings-role-matrix:' || grants."roleCode" || ':' || grants."permissionCode" || ':' || grants."action" || ':' || grants."scope"), role."id", grants."permissionCode", grants."action", grants."scope"
FROM grants
JOIN "PermissionRole" role ON role."code" = grants."roleCode"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;

UPDATE "PermissionPolicyVersion"
SET "status" = 'ROLLED_BACK', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PUBLISHED';

INSERT INTO "PermissionPolicyVersion" ("id", "version", "status", "payload", "publishedAt", "createdAt", "updatedAt")
SELECT
  md5('mallbay:settings-role-matrix-policy:' || CURRENT_TIMESTAMP::text),
  COALESCE((SELECT MAX("version") FROM "PermissionPolicyVersion"), 0) + 1,
  'PUBLISHED',
  jsonb_build_object(
    'source', 'settings-role-matrix-correction',
    'grants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('roleCode', role."code", 'permissionCode', role_grant."permissionCode", 'action', role_grant."action", 'scope', role_grant."scope") ORDER BY role."code", role_grant."permissionCode", role_grant."action", role_grant."scope")
      FROM "PermissionRoleGrant" role_grant
      JOIN "PermissionRole" role ON role."id" = role_grant."roleId"
      WHERE role."status" = 'ACTIVE'
    ), '[]'::jsonb)
  ),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP;
