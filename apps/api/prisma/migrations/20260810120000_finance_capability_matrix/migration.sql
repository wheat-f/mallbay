INSERT INTO "PermissionDefinition" ("code", "name", "resource", "actions", "supportedScopes", "status", "createdAt", "updatedAt")
VALUES
  ('finance.application', '财务申请', 'finance.application', ARRAY['submit'], ARRAY['OWN', 'STORE', 'GLOBAL'], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('finance.document', '财务单据', 'finance.document', ARRAY['read', 'attach'], ARRAY['OWN', 'STORE', 'GLOBAL'], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('finance.expense', '费用申请', 'finance.expense', ARRAY['review'], ARRAY['STORE', 'GLOBAL'], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('finance.reimbursement', '报销申请', 'finance.reimbursement', ARRAY['review', 'pay'], ARRAY['STORE', 'GLOBAL'], 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "resource" = EXCLUDED."resource",
    "actions" = EXCLUDED."actions",
    "supportedScopes" = EXCLUDED."supportedScopes",
    "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP;

WITH grants("roleCode", "permissionCode", "action", "scope") AS (
  VALUES
    ('HQ_ADMIN', 'finance.application', 'submit', 'GLOBAL'),
    ('HQ_ADMIN', 'finance.document', 'read', 'GLOBAL'),
    ('HQ_ADMIN', 'finance.document', 'attach', 'GLOBAL'),
    ('HQ_ADMIN', 'finance.expense', 'review', 'GLOBAL'),
    ('HQ_ADMIN', 'finance.reimbursement', 'review', 'GLOBAL'),
    ('HQ_ADMIN', 'finance.reimbursement', 'pay', 'GLOBAL'),
    ('MANAGER', 'finance.application', 'submit', 'OWN'),
    ('MANAGER', 'finance.document', 'read', 'OWN'),
    ('MANAGER', 'finance.document', 'read', 'STORE'),
    ('MANAGER', 'finance.document', 'attach', 'OWN'),
    ('MANAGER', 'finance.document', 'attach', 'STORE'),
    ('MANAGER', 'finance.expense', 'review', 'STORE'),
    ('FINANCE', 'finance.application', 'submit', 'OWN'),
    ('FINANCE', 'finance.document', 'read', 'OWN'),
    ('FINANCE', 'finance.document', 'read', 'STORE'),
    ('FINANCE', 'finance.document', 'attach', 'OWN'),
    ('FINANCE', 'finance.document', 'attach', 'STORE'),
    ('FINANCE', 'finance.reimbursement', 'review', 'STORE'),
    ('FINANCE', 'finance.reimbursement', 'pay', 'STORE'),
    ('SALES', 'finance.application', 'submit', 'OWN'),
    ('SALES', 'finance.document', 'read', 'OWN'),
    ('SALES', 'finance.document', 'attach', 'OWN'),
    ('CUSTOMER_SERVICE', 'finance.application', 'submit', 'OWN'),
    ('CUSTOMER_SERVICE', 'finance.document', 'read', 'OWN'),
    ('CUSTOMER_SERVICE', 'finance.document', 'attach', 'OWN'),
    ('PURCHASING', 'finance.application', 'submit', 'OWN'),
    ('PURCHASING', 'finance.document', 'read', 'OWN'),
    ('PURCHASING', 'finance.document', 'attach', 'OWN'),
    ('SCHEDULER', 'finance.application', 'submit', 'OWN'),
    ('SCHEDULER', 'finance.document', 'read', 'OWN'),
    ('SCHEDULER', 'finance.document', 'attach', 'OWN'),
    ('CONSTRUCTION', 'finance.application', 'submit', 'OWN'),
    ('CONSTRUCTION', 'finance.document', 'read', 'OWN'),
    ('CONSTRUCTION', 'finance.document', 'attach', 'OWN'),
    ('APPRENTICE', 'finance.application', 'submit', 'OWN'),
    ('APPRENTICE', 'finance.document', 'read', 'OWN'),
    ('APPRENTICE', 'finance.document', 'attach', 'OWN')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5(grants."roleCode" || '|' || grants."permissionCode" || '|' || grants."action" || '|' || grants."scope"),
       role.id,
       grants."permissionCode",
       grants."action",
       grants."scope"
FROM grants
JOIN "PermissionRole" role ON role.code = grants."roleCode"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;
