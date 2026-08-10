# 总部管理员初始化与总部治理入口补齐 PRD 评审报告

## 1. 评审信息

| 项目 | 内容 |
|---|---|
| 被评审文档 | [总部管理员初始化与总部治理入口补齐 PRD](./hq-admin-bootstrap-and-governance-access-prd.md) |
| 评审技能 | `requirement-review` |
| 评审日期 | 2026-08-11 |
| 评审轮次 | 3 轮修订后终审 |
| 最终结论 | 通过，可进入研发 |

## 2. 评审范围

本次按目标、范围、角色、对象、流程、状态、权限与数据范围、接口、页面、异常、验收和回归测试逐项检查，并与以下设计基线交叉核对：

> 2026-08-11 规则变更：PRD v1.4 已将总部管理员目标调整为“优先 `HQ_ADMIN_USERNAME`，未配置时按 `zhouluoren` → `xiaoming` 选择首个已存在账号”。迁移脚本只补齐已存在账号的总部绑定，不读取或重置账号密码。

- [总部管理员初始化与总部治理入口详细设计](./hq-admin-bootstrap-and-governance-access-design.md)
- [ADR 0013：单一总部管理员初始化账号](../adr/0013-bootstrap-single-hq-admin.md)
- [CONTEXT.md](../../CONTEXT.md)
- `apps/api/scripts/migrate-permissions.ts`
- `apps/api/src/permissions/permissions.service.ts`
- `apps/api/src/permissions/permissions.controller.ts`
- `apps/web/src/features/workbench/management-menu.tsx`
- `apps/web/src/features/workbench/management-shell.tsx`
- `apps/web/app/admin/layout.tsx`
- `apps/web/app/settings/role-bindings/page.tsx`

## 3. 首轮问题与处理结果

| 编号 | 严重级别 | 问题 | 影响 | 处理结果 |
|---|---|---|---|---|
| R1 | S0 | `PermissionsService` 仍可能通过 `isAuditor` 兼容回退授予 HQ 权限 | 历史审核员可能绕过显式 HQ 绑定访问总部 | PRD 新增 PR-006A/006B，明确移除 `getForUser` 和权限发布路径的运行时回退，并加入回归验收 |
| R2 | S1 | `HQ_ADMIN_USERNAME` 未配置时回退 `zhouluoren` | 本地环境可能误绑定测试/生产账号 | 改为所有环境显式配置；迁移脚本只校验非空，环境映射由部署预检负责 |
| R3 | S1 | “唯一总部管理员”没有冲突处理 | 已有其他 HQ 管理员时可能产生多账号 | 新增 `HQ_ADMIN_BINDING_CONFLICT`、事务前置检查、禁止自动停用/删除和并发验收 |
| R4 | S1 | 停用目标绑定的处理规则前后矛盾 | 初始化可能无法恢复，或发生静默提权 | 固定为仅恢复目标用户自己的停用绑定，记录审计；非激活用户返回 `HQ_ADMIN_TARGET_INACTIVE` |
| R5 | S1 | 绑定写操作范围过宽，可能误伤门店人员管理 | 破坏店长已有门店成员维护流程 | 收窄为 HQ 管理员对其他人员或总部范围绑定冻结；明确保留门店店长流程 |
| R6 | S2 | `settings.read`、等价总部权限等表述不够精确 | 研发可能把权限 code、action、scope 混用 | 统一为 `permissionCode=settings`、`action=read`、`scope=GLOBAL`，总部入口要求 `HQ_ADMIN/HQ` |

以上问题均已在 PRD 中修订，并同步到详细设计、ADR 和领域上下文。

## 4. 终审检查

### 4.1 目标与范围

- 本期目标限定为总部管理员初始化、总部治理入口、复合角色访问和绑定限制。
- 明确不建设总部产品、跨门店业务、总部成员列表和多管理员治理。
- 未引入新的业务 API、权限模型或虚假业务数据要求。

结论：通过。

### 4.2 角色与权限

- 总部身份由有效 `roleCode=HQ_ADMIN`、`scopeType=HQ` 绑定定义。
- `isAuditor` 仅保留为历史字段，不再作为菜单、页面、接口或权限发布回退。
- 复合角色同时保留 `HQ_ADMIN/HQ` 与 `MANAGER/STORE` 的范围，不扩大组织边界。
- `/admin`、`/settings` 服务端必须复核总部权限；`/members` 继续按当前门店范围工作。

结论：通过，无 S0/S1 权限歧义。

### 4.3 环境与迁移

- 所有环境优先使用 `HQ_ADMIN_USERNAME`；未配置时按 `zhouluoren` → `xiaoming` 选择首个已存在账号。
- 目标账号必须预先存在；迁移脚本不读取或设置密码，不创建未知密码账号。
- 配置账号不存在，或两个回退账号均不存在时返回 `HQ_ADMIN_TARGET_NOT_FOUND`。
- 绑定补齐/恢复、审计写入在同一事务内完成，失败回滚。
- 已定义唯一性冲突、非激活目标、停用绑定恢复、重复执行和并发执行行为。

结论：通过。

### 4.4 接口与页面

- 已列出当前角色绑定写接口及冻结边界。
- HQ 管理员不能通过页面或公开接口绑定、修改、停用其他人员或总部范围绑定。
- 门店店长既有门店成员管理流程不被冻结。
- 系统设置继续沿用现有 capability、action、scope 和权限发布规则。
- 菜单加载失败时保守隐藏总部入口，不根据 `isAuditor` 放行。

结论：通过。

### 4.5 异常与验收

- 已覆盖配置缺失、密码缺失、角色异常、账号非激活、总部绑定冲突、停用绑定、权限加载失败、无门店上下文、越权请求和并发迁移。
- 验收标准已覆盖迁移幂等、权限边界、菜单显示、接口 403/业务错误、数据范围和事务回滚。
- 回归测试要求覆盖迁移脚本、权限服务、Web 导航和绑定冻结。

结论：通过。

## 5. 非阻塞实施注意事项

以下事项不构成需求阻塞，但研发实现时必须遵守：

1. 各环境账号初始化流程需要预先创建可登录的目标账号，迁移脚本只负责分配总部管理员绑定。
2. 并发初始化需要在事务内重新检查有效 `HQ_ADMIN/HQ` 绑定，确保最终最多一个有效绑定。
3. 迁移脚本不接触密码；密码不得出现在日志、异常、审计 metadata、前端 bundle 或提交内容中。
4. 关闭 `isAuditor` 运行时回退后，需要验证普通门店用户的既有门店权限没有回归。

## 6. 评审结论

PRD 已完成两轮修订，当前不存在 S0/S1 阻塞项，范围、权限主体、环境账号、迁移幂等性、异常边界、接口限制和验收标准均已明确。

**结论：需求评审通过，可以进入研发实现和测试用例编写。**
