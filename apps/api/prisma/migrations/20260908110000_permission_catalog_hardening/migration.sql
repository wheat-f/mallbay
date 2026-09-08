-- Permission definitions are a reviewed catalog. Role grants are initialized
-- only when no published policy exists; later authorization changes happen by
-- publishing a policy, never by deployment bootstrap.

INSERT INTO "PermissionRole" ("id", "code", "name", "type", "status", "createdAt", "updatedAt")
VALUES
  (md5('mallbay:role:HQ_ADMIN'), 'HQ_ADMIN', '总部管理员', 'SYSTEM', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('mallbay:role:MANAGER'), 'MANAGER', '店长', 'SYSTEM', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('mallbay:role:SALES'), 'SALES', '销售', 'SYSTEM', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('mallbay:role:CUSTOMER_SERVICE'), 'CUSTOMER_SERVICE', '客服', 'SYSTEM', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('mallbay:role:PURCHASING'), 'PURCHASING', '采购', 'SYSTEM', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('mallbay:role:FINANCE'), 'FINANCE', '财务', 'SYSTEM', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('mallbay:role:SCHEDULER'), 'SCHEDULER', '排班员', 'SYSTEM', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('mallbay:role:CONSTRUCTION'), 'CONSTRUCTION', '施工员', 'SYSTEM', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (md5('mallbay:role:APPRENTICE'), 'APPRENTICE', '学徒', 'SYSTEM', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "type" = 'SYSTEM',
    "updatedAt" = CURRENT_TIMESTAMP;

WITH catalog("code", "name", "resource", "actions", "supportedScopes") AS (
  VALUES
    ('customers', '客户', 'customers', ARRAY['read','write'], ARRAY['OWN','STORE','GLOBAL']),
    ('orders', '订单', 'orders', ARRAY['read','write'], ARRAY['OWN','STORE','GLOBAL']),
    ('orders.lifecycle', '订单生命周期', 'orders', ARRAY['finalize','cancel','cross_store_source_manage','verification_view','verification_resolve'], ARRAY['STORE','GLOBAL']),
    ('warranties', '质保', 'warranties', ARRAY['read','write'], ARRAY['STORE','GLOBAL']),
    ('construction', '施工', 'construction', ARRAY['read','write'], ARRAY['OWN','STORE','GLOBAL']),
    ('products', '产品', 'products', ARRAY['read','write','suggested-price-write'], ARRAY['STORE','GLOBAL']),
    ('pricing.template', '定价模板', 'pricing', ARRAY['write'], ARRAY['GLOBAL']),
    ('inventory', '库存', 'inventory', ARRAY['read','write'], ARRAY['STORE','GLOBAL']),
    ('purchase', '采购', 'purchase', ARRAY['read','write'], ARRAY['STORE','GLOBAL']),
    ('after-sales', '售后', 'after-sales', ARRAY['read','write'], ARRAY['OWN','STORE','GLOBAL']),
    ('reports', '报表', 'reports', ARRAY['read'], ARRAY['OWN','STORE','GLOBAL']),
    ('finance', '财务', 'finance', ARRAY['read','write'], ARRAY['OWN','STORE','GLOBAL']),
    ('finance.cost', '财务成本', 'finance', ARRAY['read'], ARRAY['STORE','GLOBAL']),
    ('finance.application', '财务申请', 'finance', ARRAY['submit'], ARRAY['OWN','STORE','GLOBAL']),
    ('finance.document', '财务单据', 'finance', ARRAY['read','attach'], ARRAY['OWN','STORE','GLOBAL']),
    ('finance.expense', '费用审批', 'finance', ARRAY['review'], ARRAY['STORE','GLOBAL']),
    ('finance.reimbursement', '报销审批', 'finance', ARRAY['review','pay'], ARRAY['STORE','GLOBAL']),
    ('rebates', '返利', 'rebates', ARRAY['read','apply','review','pay'], ARRAY['OWN','STORE','GLOBAL']),
    ('commissions', '提成', 'commissions', ARRAY['write'], ARRAY['STORE','GLOBAL']),
    ('returns', '退货', 'returns', ARRAY['write','create','manage','approve','finance'], ARRAY['STORE','GLOBAL']),
    ('store', '门店', 'store', ARRAY['read','write'], ARRAY['STORE','GLOBAL']),
    ('users', '用户', 'users', ARRAY['read','write'], ARRAY['GLOBAL']),
    ('permissions.policy', '权限策略', 'permissions', ARRAY['read','write','publish'], ARRAY['GLOBAL']),
    ('settings.dictionary', '总部字典模板', 'settings', ARRAY['read','write'], ARRAY['GLOBAL']),
    ('settings.security', '安全策略', 'settings', ARRAY['read','write'], ARRAY['GLOBAL']),
    ('customer.tags', '客户标签规则', 'customers', ARRAY['read','write'], ARRAY['GLOBAL']),
    ('settings.audit.global', '全局审计', 'settings', ARRAY['read'], ARRAY['GLOBAL']),
    ('store.dictionary', '门店基础字典', 'store', ARRAY['read','write'], ARRAY['STORE']),
    ('store.members', '门店成员', 'store', ARRAY['read','write'], ARRAY['STORE']),
    ('store.profile', '门店资料', 'store', ARRAY['read','write'], ARRAY['STORE']),
    ('store.operations', '门店运营参数', 'store', ARRAY['read','write'], ARRAY['STORE']),
    ('store.notifications', '门店通知与 OSS', 'store', ARRAY['read','write'], ARRAY['STORE']),
    ('store.capacity', '门店预约与容量', 'store', ARRAY['read','write'], ARRAY['STORE']),
    ('finance.labor_cost', '岗位小时成本', 'finance', ARRAY['read','write'], ARRAY['STORE']),
    ('finance.settlement', '成本与结算规则', 'finance', ARRAY['read','write'], ARRAY['STORE']),
    ('finance.accounts', '收款账户', 'finance', ARRAY['read','write'], ARRAY['STORE']),
    ('finance.audit', '财务审计', 'finance', ARRAY['read'], ARRAY['STORE']),
    ('account.profile', '个人资料与账号', 'account', ARRAY['read','write'], ARRAY['OWN'])
)
INSERT INTO "PermissionDefinition" ("code", "name", "resource", "actions", "supportedScopes", "status", "createdAt", "updatedAt")
SELECT "code", "name", "resource", "actions", "supportedScopes", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM catalog
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "resource" = EXCLUDED."resource",
    "actions" = EXCLUDED."actions",
    "supportedScopes" = EXCLUDED."supportedScopes",
    "status" = 'ACTIVE',
    "updatedAt" = CURRENT_TIMESTAMP;

-- A fresh installation has no historical policy. Seed the standard role
-- policy once; a subsequent policy publication owns all of these grants.
WITH baseline("roleCode", "permissionCode", "action", "scope") AS (
  VALUES
    ('HQ_ADMIN','customers','read','GLOBAL'), ('HQ_ADMIN','customers','write','GLOBAL'),
    ('HQ_ADMIN','orders','read','GLOBAL'), ('HQ_ADMIN','orders','write','GLOBAL'),
    ('HQ_ADMIN','orders.lifecycle','finalize','GLOBAL'), ('HQ_ADMIN','orders.lifecycle','cancel','GLOBAL'), ('HQ_ADMIN','orders.lifecycle','cross_store_source_manage','GLOBAL'), ('HQ_ADMIN','orders.lifecycle','verification_view','GLOBAL'), ('HQ_ADMIN','orders.lifecycle','verification_resolve','GLOBAL'),
    ('HQ_ADMIN','warranties','read','GLOBAL'), ('HQ_ADMIN','warranties','write','GLOBAL'),
    ('HQ_ADMIN','construction','read','GLOBAL'), ('HQ_ADMIN','construction','write','GLOBAL'),
    ('HQ_ADMIN','products','read','GLOBAL'), ('HQ_ADMIN','products','write','GLOBAL'), ('HQ_ADMIN','products','suggested-price-write','GLOBAL'),
    ('HQ_ADMIN','pricing.template','write','GLOBAL'), ('HQ_ADMIN','inventory','read','GLOBAL'), ('HQ_ADMIN','inventory','write','GLOBAL'),
    ('HQ_ADMIN','purchase','read','GLOBAL'), ('HQ_ADMIN','purchase','write','GLOBAL'),
    ('HQ_ADMIN','finance','read','GLOBAL'), ('HQ_ADMIN','finance','write','GLOBAL'), ('HQ_ADMIN','finance.cost','read','GLOBAL'),
    ('HQ_ADMIN','finance.application','submit','GLOBAL'), ('HQ_ADMIN','finance.document','read','GLOBAL'), ('HQ_ADMIN','finance.document','attach','GLOBAL'), ('HQ_ADMIN','finance.expense','review','GLOBAL'), ('HQ_ADMIN','finance.reimbursement','review','GLOBAL'), ('HQ_ADMIN','finance.reimbursement','pay','GLOBAL'),
    ('HQ_ADMIN','rebates','read','GLOBAL'), ('HQ_ADMIN','rebates','review','GLOBAL'), ('HQ_ADMIN','rebates','pay','GLOBAL'), ('HQ_ADMIN','commissions','write','GLOBAL'),
    ('HQ_ADMIN','returns','write','GLOBAL'), ('HQ_ADMIN','returns','create','GLOBAL'), ('HQ_ADMIN','returns','manage','GLOBAL'), ('HQ_ADMIN','returns','approve','GLOBAL'), ('HQ_ADMIN','returns','finance','GLOBAL'),
    ('HQ_ADMIN','after-sales','read','GLOBAL'), ('HQ_ADMIN','after-sales','write','GLOBAL'), ('HQ_ADMIN','reports','read','GLOBAL'),
    ('HQ_ADMIN','store','read','GLOBAL'), ('HQ_ADMIN','store','write','GLOBAL'), ('HQ_ADMIN','users','read','GLOBAL'), ('HQ_ADMIN','users','write','GLOBAL'),
    ('HQ_ADMIN','permissions.policy','read','GLOBAL'), ('HQ_ADMIN','permissions.policy','write','GLOBAL'), ('HQ_ADMIN','permissions.policy','publish','GLOBAL'),
    ('HQ_ADMIN','settings.dictionary','read','GLOBAL'), ('HQ_ADMIN','settings.dictionary','write','GLOBAL'), ('HQ_ADMIN','settings.security','read','GLOBAL'), ('HQ_ADMIN','settings.security','write','GLOBAL'), ('HQ_ADMIN','customer.tags','read','GLOBAL'), ('HQ_ADMIN','customer.tags','write','GLOBAL'), ('HQ_ADMIN','settings.audit.global','read','GLOBAL'),
    ('MANAGER','customers','read','STORE'), ('MANAGER','customers','write','STORE'), ('MANAGER','orders','read','STORE'), ('MANAGER','orders','write','STORE'),
    ('MANAGER','orders.lifecycle','finalize','STORE'), ('MANAGER','orders.lifecycle','cancel','STORE'), ('MANAGER','orders.lifecycle','cross_store_source_manage','STORE'), ('MANAGER','orders.lifecycle','verification_view','STORE'), ('MANAGER','orders.lifecycle','verification_resolve','STORE'),
    ('MANAGER','warranties','read','STORE'), ('MANAGER','warranties','write','STORE'), ('MANAGER','construction','read','STORE'), ('MANAGER','construction','write','STORE'),
    ('MANAGER','products','read','STORE'), ('MANAGER','products','write','STORE'), ('MANAGER','products','suggested-price-write','STORE'), ('MANAGER','inventory','read','STORE'), ('MANAGER','inventory','write','STORE'), ('MANAGER','purchase','read','STORE'), ('MANAGER','purchase','write','STORE'), ('MANAGER','after-sales','read','STORE'), ('MANAGER','after-sales','write','STORE'), ('MANAGER','reports','read','STORE'), ('MANAGER','finance','read','STORE'), ('MANAGER','finance','write','STORE'),
    ('MANAGER','finance.application','submit','OWN'), ('MANAGER','finance.document','read','OWN'), ('MANAGER','finance.document','read','STORE'), ('MANAGER','finance.document','attach','OWN'), ('MANAGER','finance.document','attach','STORE'), ('MANAGER','finance.expense','review','STORE'),
    ('MANAGER','rebates','read','STORE'), ('MANAGER','rebates','review','STORE'), ('MANAGER','commissions','write','STORE'), ('MANAGER','returns','write','STORE'), ('MANAGER','returns','create','STORE'), ('MANAGER','returns','manage','STORE'), ('MANAGER','returns','approve','STORE'), ('MANAGER','returns','finance','STORE'),
    ('MANAGER','store','read','STORE'), ('MANAGER','store','write','STORE'),
    ('MANAGER','store.dictionary','read','STORE'), ('MANAGER','store.dictionary','write','STORE'), ('MANAGER','store.members','read','STORE'), ('MANAGER','store.members','write','STORE'), ('MANAGER','store.profile','read','STORE'), ('MANAGER','store.profile','write','STORE'), ('MANAGER','store.operations','read','STORE'), ('MANAGER','store.operations','write','STORE'), ('MANAGER','store.notifications','read','STORE'), ('MANAGER','store.notifications','write','STORE'), ('MANAGER','store.capacity','read','STORE'), ('MANAGER','store.capacity','write','STORE'), ('MANAGER','finance.labor_cost','read','STORE'), ('MANAGER','finance.labor_cost','write','STORE'), ('MANAGER','finance.settlement','read','STORE'), ('MANAGER','finance.settlement','write','STORE'), ('MANAGER','finance.accounts','read','STORE'), ('MANAGER','finance.accounts','write','STORE'), ('MANAGER','finance.audit','read','STORE'),
    ('SALES','customers','read','OWN'), ('SALES','customers','write','OWN'), ('SALES','orders','read','OWN'), ('SALES','orders','write','OWN'), ('SALES','warranties','read','STORE'), ('SALES','products','read','STORE'), ('SALES','reports','read','STORE'), ('SALES','finance.application','submit','OWN'), ('SALES','finance.document','read','OWN'), ('SALES','finance.document','attach','OWN'), ('SALES','rebates','read','OWN'), ('SALES','rebates','apply','OWN'),
    ('CUSTOMER_SERVICE','customers','read','STORE'), ('CUSTOMER_SERVICE','customers','write','STORE'), ('CUSTOMER_SERVICE','orders','read','STORE'), ('CUSTOMER_SERVICE','orders','write','STORE'), ('CUSTOMER_SERVICE','warranties','read','STORE'), ('CUSTOMER_SERVICE','warranties','write','STORE'), ('CUSTOMER_SERVICE','products','read','STORE'), ('CUSTOMER_SERVICE','inventory','read','STORE'), ('CUSTOMER_SERVICE','purchase','read','STORE'), ('CUSTOMER_SERVICE','after-sales','read','STORE'), ('CUSTOMER_SERVICE','after-sales','write','STORE'), ('CUSTOMER_SERVICE','finance.application','submit','OWN'), ('CUSTOMER_SERVICE','finance.document','read','OWN'), ('CUSTOMER_SERVICE','finance.document','attach','OWN'), ('CUSTOMER_SERVICE','rebates','read','STORE'), ('CUSTOMER_SERVICE','rebates','apply','STORE'), ('CUSTOMER_SERVICE','returns','write','STORE'), ('CUSTOMER_SERVICE','returns','create','STORE'),
    ('PURCHASING','orders','read','STORE'), ('PURCHASING','warranties','read','STORE'), ('PURCHASING','inventory','read','STORE'), ('PURCHASING','inventory','write','STORE'), ('PURCHASING','products','read','STORE'), ('PURCHASING','products','write','STORE'), ('PURCHASING','purchase','read','STORE'), ('PURCHASING','purchase','write','STORE'), ('PURCHASING','after-sales','read','STORE'), ('PURCHASING','finance.application','submit','OWN'), ('PURCHASING','finance.document','read','OWN'), ('PURCHASING','finance.document','attach','OWN'), ('PURCHASING','returns','write','STORE'), ('PURCHASING','returns','manage','STORE'),
    ('FINANCE','orders','read','STORE'), ('FINANCE','warranties','read','STORE'), ('FINANCE','finance','read','STORE'), ('FINANCE','finance','write','STORE'), ('FINANCE','finance.cost','read','STORE'), ('FINANCE','products','read','STORE'), ('FINANCE','reports','read','STORE'), ('FINANCE','finance.application','submit','OWN'), ('FINANCE','finance.document','read','OWN'), ('FINANCE','finance.document','read','STORE'), ('FINANCE','finance.document','attach','OWN'), ('FINANCE','finance.document','attach','STORE'), ('FINANCE','finance.reimbursement','review','STORE'), ('FINANCE','finance.reimbursement','pay','STORE'), ('FINANCE','rebates','read','STORE'), ('FINANCE','rebates','pay','STORE'), ('FINANCE','commissions','write','STORE'), ('FINANCE','returns','write','STORE'), ('FINANCE','returns','finance','STORE'),
    ('SCHEDULER','orders','read','STORE'), ('SCHEDULER','warranties','read','STORE'), ('SCHEDULER','warranties','write','STORE'), ('SCHEDULER','construction','read','STORE'), ('SCHEDULER','construction','write','STORE'), ('SCHEDULER','products','read','STORE'), ('SCHEDULER','after-sales','read','STORE'), ('SCHEDULER','after-sales','write','STORE'), ('SCHEDULER','finance.application','submit','OWN'), ('SCHEDULER','finance.document','read','OWN'), ('SCHEDULER','finance.document','attach','OWN'),
    ('CONSTRUCTION','orders','read','STORE'), ('CONSTRUCTION','warranties','read','STORE'), ('CONSTRUCTION','construction','read','STORE'), ('CONSTRUCTION','products','read','STORE'), ('CONSTRUCTION','after-sales','read','STORE'), ('CONSTRUCTION','after-sales','write','OWN'), ('CONSTRUCTION','finance.application','submit','OWN'), ('CONSTRUCTION','finance.document','read','OWN'), ('CONSTRUCTION','finance.document','attach','OWN'),
    ('APPRENTICE','orders','read','STORE'), ('APPRENTICE','warranties','read','STORE'), ('APPRENTICE','construction','read','STORE'), ('APPRENTICE','products','read','STORE'), ('APPRENTICE','after-sales','read','STORE'), ('APPRENTICE','after-sales','write','OWN'), ('APPRENTICE','finance.application','submit','OWN'), ('APPRENTICE','finance.document','read','OWN'), ('APPRENTICE','finance.document','attach','OWN')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5('mallbay:baseline:' || role."id" || ':' || baseline."permissionCode" || ':' || baseline."action" || ':' || baseline."scope"), role."id", baseline."permissionCode", baseline."action", baseline."scope"
FROM baseline
JOIN "PermissionRole" role ON role."code" = baseline."roleCode"
WHERE NOT EXISTS (SELECT 1 FROM "PermissionPolicyVersion" WHERE "status" = 'PUBLISHED')
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;

-- Translate the former broad settings grants once, retaining their scope but
-- not creating any capability which the old grant did not imply.
WITH legacy("roleId", "sourceAction", "sourceScope") AS (
  SELECT "roleId", "action", "scope"
  FROM "PermissionRoleGrant"
  WHERE "permissionCode" = 'settings'
), mapping("permissionCode", "action", "scope", "sourceAction", "sourceScope") AS (
  VALUES
    ('permissions.policy','read','GLOBAL','read','GLOBAL'), ('settings.dictionary','read','GLOBAL','read','GLOBAL'), ('settings.security','read','GLOBAL','read','GLOBAL'), ('customer.tags','read','GLOBAL','read','GLOBAL'), ('settings.audit.global','read','GLOBAL','read','GLOBAL'),
    ('permissions.policy','write','GLOBAL','write','GLOBAL'), ('permissions.policy','publish','GLOBAL','write','GLOBAL'), ('settings.dictionary','write','GLOBAL','write','GLOBAL'), ('settings.security','write','GLOBAL','write','GLOBAL'), ('customer.tags','write','GLOBAL','write','GLOBAL'),
    ('store.dictionary','read','STORE','read','STORE'), ('store.members','read','STORE','read','STORE'), ('store.profile','read','STORE','read','STORE'), ('store.operations','read','STORE','read','STORE'), ('store.notifications','read','STORE','read','STORE'), ('store.capacity','read','STORE','read','STORE'), ('finance.labor_cost','read','STORE','read','STORE'), ('finance.settlement','read','STORE','read','STORE'), ('finance.accounts','read','STORE','read','STORE'), ('finance.audit','read','STORE','read','STORE'),
    ('store.dictionary','write','STORE','write','STORE'), ('store.members','write','STORE','write','STORE'), ('store.profile','write','STORE','write','STORE'), ('store.operations','write','STORE','write','STORE'), ('store.notifications','write','STORE','write','STORE'), ('store.capacity','write','STORE','write','STORE'), ('finance.labor_cost','write','STORE','write','STORE'), ('finance.settlement','write','STORE','write','STORE'), ('finance.accounts','write','STORE','write','STORE')
)
INSERT INTO "PermissionRoleGrant" ("id", "roleId", "permissionCode", "action", "scope")
SELECT md5('mallbay:settings-split:' || legacy."roleId" || ':' || mapping."permissionCode" || ':' || mapping."action" || ':' || mapping."scope"), legacy."roleId", mapping."permissionCode", mapping."action", mapping."scope"
FROM legacy
JOIN mapping ON mapping."sourceAction" = legacy."sourceAction" AND mapping."sourceScope" = legacy."sourceScope"
ON CONFLICT ("roleId", "permissionCode", "action", "scope") DO NOTHING;

DELETE FROM "PermissionRoleGrant" WHERE "permissionCode" = 'settings';
UPDATE "PermissionDefinition"
SET "status" = 'DISABLED', "updatedAt" = CURRENT_TIMESTAMP
WHERE "code" = 'settings';

-- Existing members become explicit role bindings once. Deliberately disabled
-- bindings are not reactivated: deployment preflight reports those records.
INSERT INTO "PermissionRoleBinding" ("id", "userId", "roleId", "scopeType", "storeId", "status", "effectiveAt", "createdAt", "updatedAt")
SELECT md5('mallbay:membership-binding:' || member."userId" || ':' || role."id" || ':' || member."storeId"), member."userId", role."id", 'STORE', member."storeId", 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "StoreMember" member
JOIN "PermissionRole" role ON role."code" = member."position"::text AND role."status" = 'ACTIVE'
WHERE NOT EXISTS (
  SELECT 1 FROM "PermissionRoleBinding" binding
  WHERE binding."userId" = member."userId"
    AND binding."roleId" = role."id"
    AND binding."scopeType" = 'STORE'
    AND binding."storeId" = member."storeId"
)
ON CONFLICT ("userId", "roleId", "scopeType", "storeId") DO NOTHING;

-- Persist the transformed grant set as a new published policy, so role grants
-- and policy history again have one authority source after this migration.
UPDATE "PermissionPolicyVersion"
SET "status" = 'ROLLED_BACK', "updatedAt" = CURRENT_TIMESTAMP
WHERE "status" = 'PUBLISHED';

INSERT INTO "PermissionPolicyVersion" ("id", "version", "status", "payload", "publishedAt", "createdAt", "updatedAt")
SELECT
  md5('mallbay:permission-catalog:' || CURRENT_TIMESTAMP::text),
  COALESCE((SELECT MAX("version") FROM "PermissionPolicyVersion"), 0) + 1,
  'PUBLISHED',
  jsonb_build_object(
    'source', 'permission-catalog-migration',
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
