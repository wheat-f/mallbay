# PermissionGovernance 深化实施计划

## 1. 目标

把权限策略、角色和绑定治理收拢到 `PermissionGovernance` seam，令 `AccessContext` 仅承担运行时访问判定；不改数据结构、路由和业务权限结果。

## 2. 实施步骤

1. 新增治理 token 与领域契约，覆盖策略版本、角色、绑定和目录治理；不暴露 Prisma 类型给 controller。
2. 在 `PermissionsModule` 中以 `useExisting` 将现有实现绑定到治理 seam，保留 `AccessContext` 运行时 seam。
3. 迁移 `PermissionsController` 的策略、角色和绑定入口注入治理 seam；`auth/me/permissions` 继续注入 `AccessContext`。
4. 将角色/绑定写入与审计纳入事务；事务提交后失效用户/全局缓存，失败不改变状态。
5. 增加策略并发、总部管理员保护、绑定范围、审计回滚和缓存失效 contract tests。
6. 运行 API typecheck、Nest build、权限模块测试和全量 API 测试。

## 3. 文件范围

- 新增：`apps/api/src/permissions/domain/permission-governance.ts`
- 修改：`permissions.controller.ts`、`permissions.module.ts`、必要的权限实现/测试文件
- 新增或修改：`permission-governance.contract.test.ts`、权限模块测试
- 不修改：Prisma schema、已有路由路径、`AccessContext` 的运行时语义

## 4. 完成标准

- controller 不再直接依赖包含运行时实现的治理宽实现。
- 发布、回滚、角色和绑定写入均满足审计一致性和缓存提交后失效。
- `AccessContext` 的既有调用方与结果兼容。
- contract tests、API typecheck、Nest build 和回归测试通过。

