# 总部管理员初始化与治理入口实施任务

## 1. 文档目的

将已评审通过的 [总部管理员初始化与总部治理入口补齐 PRD](./hq-admin-bootstrap-and-governance-access-prd.md) 拆分为可执行、可验证的工程任务。本文记录实现范围、状态、涉及文件和验收证据，不扩展总部产品功能。

## 2. 实施边界

本轮只交付：

- 优先使用 `HQ_ADMIN_USERNAME`，未配置时按 `zhouluoren` → `xiaoming` 顺序初始化唯一总部管理员；
- 目标账号必须预先存在，迁移脚本不读取密码环境变量；
- 以有效 `HQ_ADMIN/HQ` 绑定驱动总部治理入口；
- 保留复合角色用户的当前门店能力；
- 冻结总部管理员对其他人员和总部范围角色绑定的写操作；
- 移除 `isAuditor` 作为新的总部授权来源。

本轮不交付总部产品、跨门店业务工作台、总部成员管理页面或新的后端业务 API。

## 3. 任务清单

| 任务 | 内容 | 状态 | 主要验收 |
|---|---|---|---|
| T0 | 增加用户可用状态字段和数据库迁移 | 已完成 | PR-004B、AC-23 |
| T1 | 登录与 `/auth/me` 对停用账号拒绝，并从有效 HQ 绑定推导兼容 `isAuditor` | 已完成 | PR-006A、AC-25 |
| T2 | 权限迁移脚本按环境变量优先、`zhouluoren` → `xiaoming` 回退，补齐/恢复单一总部管理员 | 已完成 | PR-001~006、AC-1~7、21~24、26~27 |
| T3 | 停止权限服务从历史 `isAuditor` 回退授予总部权限 | 已完成 | PR-006A、PR-006B、AC-7、11、25 |
| T4 | 统一总部导航、`/admin` 页面守卫和系统设置访问判断 | 已完成 | PR-007~011、AC-8~13、18~20 |
| T5 | 冻结总部人员绑定写接口，保留门店店长成员流程 | 已完成 | PR-012~014、AC-14~16 |
| T6 | 增加迁移、权限服务、认证和 Web 导航回归覆盖 | 已完成/持续验证 | AC-1~27 |
| T7 | 部署配置预检和真实环境浏览器验收 | 待发布执行 | AC-21、AC-8~20 |

## 4. 任务详情

### T0：用户可用状态

涉及文件：

- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/migrations/20260810180000_user_active_status/migration.sql`

实现要求：`User.isActive` 默认 `true`；历史用户迁移后保持可用；停用账号由认证层拒绝登录。

### T1：认证身份收口

涉及文件：

- `apps/api/src/auth/auth.service.ts`

实现要求：

- 登录和微信登录拒绝 `isActive=false`；
- `/auth/me` 和新签发会话的兼容字段 `isAuditor` 只由有效 `HQ_ADMIN/HQ` 绑定推导；
- 不再把数据库历史 `isAuditor` 直接当作总部身份。

### T2：总部管理员初始化

涉及文件：

- `apps/api/scripts/migrate-permissions.ts`
- `.env.example`

实现要求：

- 优先使用 `HQ_ADMIN_USERNAME`；未配置时按 `zhouluoren` → `xiaoming` 顺序选择首个已存在账号；
- 目标用户不存在时失败并提示先创建账号，不创建无密码或未知密码账号；
- 目标用户已存在时不重置密码；
- 目标用户停用、其他用户已有有效 HQ 绑定时，在写入前失败；
- 目标用户自己的停用 HQ 绑定允许恢复；
- 用户、绑定和初始化审计在同一事务内完成，并使用 PostgreSQL advisory lock 防并发重复初始化；
- 不再遍历 `isAuditor` 创建总部绑定；门店成员角色继续按原关系迁移。

运行入口：

```bash
corepack pnpm --filter @mallbay/api permissions:migrate
```

### T3：权限来源收口

涉及文件：

- `apps/api/src/permissions/permissions.service.ts`
- `apps/api/src/permissions/permissions.interceptor.ts`
- `apps/api/src/permissions/permissions.controller.ts`

实现要求：

- `isAuditor` 仅保留历史兼容字段，不创建 HQ grant、HQ role 或全局管理员回退；
- 运行时请求兼容字段从有效 `HQ_ADMIN/HQ` 绑定推导；
- 权限发布和管理路径不再依据 `isAuditor` 放行管理员能力；
- 服务端拒绝无 HQ 绑定用户访问总部治理能力。

### T4：总部治理入口

涉及文件：

- `apps/web/src/features/workbench/management-menu.tsx`
- `apps/web/src/features/workbench/management-shell.tsx`
- `apps/web/src/features/settings/access.ts`
- `apps/web/app/admin/layout.tsx`
- `apps/web/app/settings/role-bindings/page.tsx`

实现要求：

- 总部导航只识别有效 `HQ_ADMIN/HQ` 角色；
- 复合角色用户同时保留总部治理、当前门店业务和当前门店人员管理入口；
- `/admin` 页面加载权限后再次守卫；
- 系统设置继续按有效 capability 展示；
- 总部成员绑定页面只读，隐藏新增和停用写操作。

### T5：绑定写操作冻结

涉及文件：

- `apps/api/src/permissions/permissions.service.ts`
- `apps/api/src/permissions/permissions.controller.ts`
- `apps/web/app/settings/role-bindings/page.tsx`

冻结接口：

- `POST /permissions/role-bindings`
- `POST /users/:userId/role-bindings`
- `PATCH /users/:userId/role-bindings/:bindingId`
- `POST /permissions/role-bindings/:id/disable`

有效 HQ 管理员对其他人员或 HQ 范围绑定写入返回 `HQ_MEMBER_BINDING_DISABLED`；权限迁移脚本不受该公开接口限制。门店店长的 STORE 范围成员维护保持不变。

## 5. 验证矩阵

### 已执行

```bash
corepack pnpm --filter @mallbay/api prisma:generate
corepack pnpm --filter @mallbay/api typecheck
corepack pnpm --filter @mallbay/web typecheck
corepack pnpm --filter @mallbay/api exec tsx --tsconfig tsconfig.app.json --test --test-name-pattern="login" src/auth/auth.service.test.ts
corepack pnpm --filter @mallbay/api exec tsx --tsconfig tsconfig.app.json --test --test-name-pattern="legacy isAuditor" src/permissions/permissions.service.test.ts
corepack pnpm --filter @mallbay/api exec tsx --tsconfig tsconfig.app.json --test --test-name-pattern="HQ administrators" src/permissions/permissions.service.test.ts
corepack pnpm --filter @mallbay/web test
git diff --check
```

结果：API/Web 类型检查通过；认证、历史审核员权限收口、总部绑定冻结的定向测试通过；Web 测试 616/616 通过；差异检查无错误。API 完整测试文件在当前 Windows 工作区超过命令超时，不能将其标记为全量通过。

### 待发布环境执行

1. 确认目标环境已存在 `zhouluoren` 且账号处于可用状态。
2. 执行迁移脚本并检查输出不含密码或密码哈希。
4. 使用总部管理员登录，确认显示“门店审核”“系统设置”；若同时有门店绑定，确认门店业务和“人员管理”仍可见。
5. 使用仅有历史 `isAuditor=true` 且无 HQ 绑定的账号，确认不显示总部入口且服务端拒绝总部访问。
6. 尝试四个角色绑定写接口，确认返回 `HQ_MEMBER_BINDING_DISABLED` 且数据库无变化。

## 6. 发布前检查

- 迁移优先使用 `HQ_ADMIN_USERNAME`，未配置时按 `zhouluoren` → `xiaoming` 回退；
- `zhouluoren` 不存在时必须先通过受控账号流程创建，迁移脚本不得创建无密码账号；
- 迁移脚本不重置 `zhouluoren` 密码；
- 迁移前先确认不存在其他有效 `HQ_ADMIN/HQ` 绑定；
- 生产执行前完成数据库备份和迁移窗口确认；
- 浏览器验收应使用真实权限响应，不以旧 `isAuditor` 字段作为判断依据。

## 7. 关联文档

- [详细设计](./hq-admin-bootstrap-and-governance-access-design.md)
- [PRD](./hq-admin-bootstrap-and-governance-access-prd.md)
- [ADR 0013](../adr/0013-bootstrap-single-hq-admin.md)
- [CONTEXT.md](../../CONTEXT.md)
