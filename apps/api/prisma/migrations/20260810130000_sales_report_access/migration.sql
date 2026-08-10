INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5('SALES|reports|read|STORE'), role.id, 'reports', 'read', 'STORE'
FROM "PermissionRole" role
WHERE role.code = 'SALES'
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;
