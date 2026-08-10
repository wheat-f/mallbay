# 总部管理员初始化与总部治理入口详细设计

## 1. 文档信息

| 项目 | 内容 |
|---|---|
| 需求名称 | 总部管理员初始化与总部治理入口补齐 |
| 状态 | 方案已确认，待实施 |
| 日期 | 2026-08-10 |
| 本轮范围 | 总部管理员初始化、总部治理菜单、复合角色访问、人员绑定限制 |
| 不包含 | 总部产品、跨门店客户、跨门店订单、库存采购、总部经营分析 |

## 2. 背景与问题

当前权限迁移脚本已经定义 `HQ_ADMIN` 和总部全局权限，但系统同时保留旧的 `isAuditor` 标记和按门店岗位过滤的前端菜单，导致总部权限的责任主体和入口不稳定：

- `HQ_ADMIN` 可以拥有 `GLOBAL` 权限，但不属于 `StorePosition`；
- 前端菜单主要按门店岗位过滤，只有“门店审核”使用 `auditorOnly` 直接显示；
- “系统设置”和当前门店“人员管理”还要经过 `permissionCode=settings`、`action=read` 的菜单权限过滤；
- 权限绑定页面当前固定为 `STORE` 范围，无法管理总部绑定；
- 根据全部 `isAuditor=true` 用户自动创建总部绑定，会把历史审核员身份扩大为总部管理员。

本设计将总部管理员收敛为一个可追溯的初始化账号，并让复合角色用户同时使用总部和门店导航。

## 3. 已确认决策

### 3.1 总部管理员账号

- 本机及其他本地开发环境显式配置目标用户名为 `xiaoming`；测试库和生产环境显式配置为 `zhouluoren`。
- 初始密码由环境变量 `HQ_ADMIN_PASSWORD` 提供，不写入脚本、源码、迁移文件或提交记录。
- 目标用户已存在时不覆盖密码、不覆盖昵称、不覆盖头像、不删除既有门店关系。
- 目标用户不存在时，脚本使用 `HQ_ADMIN_PASSWORD` 创建；密码变量缺失时直接失败，不创建半成品账号。

### 3.2 总部绑定

目标用户必须拥有一条有效绑定：

```text
roleCode: HQ_ADMIN
scopeType: HQ
storeId: null
status: ACTIVE
```

脚本不再扫描 `isAuditor=true` 并为所有用户创建 `HQ_ADMIN/HQ` 绑定。

目标用户原有的门店角色绑定保持不变，因此本机 `xiaoming` 预期可以同时拥有：

```text
MANAGER / STORE / 当前门店
HQ_ADMIN / HQ / 总部
```

### 3.3 人员绑定限制

当前阶段不开放总部管理员通过页面或公开接口修改、创建、停用其他人员的总部角色绑定。

- 不在主导航展示“总部成员与角色绑定”；
- 角色绑定页面不得提供总部绑定写入口；
- 角色绑定写接口对当前阶段的人员绑定操作返回明确拒绝；
- 权限迁移脚本是本阶段唯一允许建立总部管理员绑定的入口；
- 不删除已有绑定数据，保留查询和审计能力，便于后续恢复正式人员管理。

本限制只针对人员角色绑定，不改变总部管理员访问已经开放的“门店审核”和“系统设置”页面；权限矩阵是否可编辑继续沿用现有权限发布规则，不新增人员绑定能力。

## 4. 领域模型

### 4.1 身份关系

```text
User
 ├── isAuditor：旧兼容字段，不再作为新总部授权来源
 ├── StoreMember：门店岗位关系，例如 MANAGER
 └── PermissionRoleBinding
      ├── HQ_ADMIN / HQ：总部治理范围
      └── MANAGER / STORE：当前门店运营范围
```

### 4.2 权限来源优先级

```text
有效 PermissionRoleBinding
        ↓
PermissionRoleGrant
        ↓
AccessContext / 当前用户权限结果
        ↓
后端接口、页面守卫、菜单入口
```

`isAuditor` 只允许作为迁移期间的兼容数据或展示信息，不得作为新的菜单放行、页面放行或业务接口放行依据。

## 5. 目标架构

### 5.1 迁移脚本

权限迁移脚本继续负责系统角色和权限目录的幂等初始化，并增加唯一总部管理员目标用户处理：

1. 读取并校验 `HQ_ADMIN_USERNAME` 非空并原样使用；部署配置/发布预检负责校验本地、测试和生产的账号映射，脚本不猜测当前环境。
2. 读取 `HQ_ADMIN_PASSWORD`，仅在目标用户不存在且需要创建时使用。
3. 确保 `HQ_ADMIN` 系统角色存在并处于 `ACTIVE`。
4. 确保目标用户存在且处于可登录状态。
5. 确保目标用户存在唯一有效的 `HQ_ADMIN/HQ` 绑定。
6. 若目标用户已经存在门店成员关系或门店角色绑定，不修改这些关系。
7. 记录创建、跳过、补齐、失败和差异结果。
8. 脚本重复执行时返回幂等结果，不重复创建用户、角色或绑定。

推荐环境变量：

```env
# 测试库和生产环境
HQ_ADMIN_USERNAME=zhouluoren
HQ_ADMIN_PASSWORD=<由部署环境注入>

# 本机及其他本地开发环境
HQ_ADMIN_USERNAME=xiaoming
HQ_ADMIN_PASSWORD=<本机开发密码>
```

如果目标用户已存在，`HQ_ADMIN_PASSWORD` 不用于重置密码；如果目标用户不存在且密码未提供，脚本必须在数据库写入前失败。部署配置/发布预检必须阻止缺失用户名或环境账号映射错误的流程。

### 5.2 权限服务

权限服务需要保持以下行为：

- `HQ_ADMIN/HQ` 绑定解析出总部全局权限；
- `MANAGER/STORE` 绑定解析出当前门店权限；
- 多条绑定的允许权限取并集，但组织范围不能被扩大；
- 不因用户存在 `isAuditor=true` 自动补充 `HQ_ADMIN`；
- 旧 `isAuditor` 账号没有有效 `HQ_ADMIN/HQ` 绑定时，不能获得新的总部治理权限。

### 5.3 前端导航

目标导航按身份范围分组：

```text
人员与系统
└── 人员管理                 /members
    └── 当前门店成员管理

总部治理
├── 门店审核                 /admin
└── 系统设置                 /settings
```

菜单判断规则：

- “总部治理”要求当前权限结果包含有效 `roleCode=HQ_ADMIN`、`scopeType=HQ` 绑定；
- “门店审核”不再只依赖 `isAuditor`；
- “系统设置”使用 `permissionCode=settings`、`action=read` 和对应范围校验；
- “人员管理”继续使用 `MANAGER` 的门店范围能力；
- 同时拥有总部和门店绑定的用户同时看到两类菜单；
- 没有总部绑定的店长仍可看到门店人员管理，但看不到总部治理；
- 没有门店绑定的总部管理员不显示需要当前门店上下文的门店业务菜单。

### 5.4 页面与接口边界

#### 门店审核

- 页面入口：`/admin`。
- 页面守卫：总部有效权限。
- 后端接口：总部范围访问和操作由 `AccessContext` 决定。
- 旧 `isAuditor` 不得单独放行新请求。

#### 系统设置

- 页面入口：`/settings`。
- 总部管理员可看到总部治理能力卡片，例如角色与权限、字典模板、安全策略和全局审计，具体以服务端 capability 返回为准。
- 当前阶段不提供总部成员角色绑定的写入口。
- 访问其他设置页面仍遵循 capability、action 和 scope 校验。

#### 门店人员管理

- 页面入口：`/members`。
- 仍表示当前门店人员管理，不改造成总部用户管理。
- 复合角色用户以 `MANAGER/STORE` 绑定访问当前门店成员。

## 6. 公共接口设计

### 6.1 迁移脚本接口

迁移脚本内部形成可测试的初始化操作：

```ts
ensureHeadquartersAdmin({
  username: process.env.HQ_ADMIN_USERNAME,
  password: process.env.HQ_ADMIN_PASSWORD
})
```

结果至少包含：

```ts
{
  username: string;
  userCreated: boolean;
  roleCreated: boolean;
  bindingCreated: boolean;
  bindingReactivated: boolean;
  existingStoreBindingsPreserved: boolean;
  status: "created" | "reconciled" | "failed";
  errorCode?: "HQ_ADMIN_BINDING_CONFLICT" | "HQ_ADMIN_TARGET_INACTIVE" | "HQ_ADMIN_CONFIG_INVALID";
}
```

### 6.2 权限结果接口

继续复用现有 `GET /auth/me/permissions`，前端需要使用返回的 `roles` 和 `permissions`，而不是只读取 `user.isAuditor`：

```ts
roles.some(role =>
  role.roleCode === "HQ_ADMIN" && role.scopeType === "HQ"
)
```

菜单仅用于体验层过滤，所有页面和接口仍必须由服务端再次校验。

### 6.3 角色绑定写接口

当前阶段对新增、修改或停用其他人员总部绑定返回明确业务错误，例如：

```text
HQ_MEMBER_BINDING_DISABLED
总部成员绑定暂未开放，请通过权限迁移脚本初始化总部管理员
```

不得通过前端隐藏代替服务端拒绝。

## 7. 迁移与兼容策略

### 阶段 1：初始化目标用户

- 发布 `HQ_ADMIN_USERNAME` 和 `HQ_ADMIN_PASSWORD` 环境变量约定；
- 本机及其他本地环境显式配置 `HQ_ADMIN_USERNAME=xiaoming`，测试库和生产显式配置 `HQ_ADMIN_USERNAME=zhouluoren`；
- 迁移脚本创建或补齐当前环境总部管理员；
- 验证目标用户的 HQ 绑定和既有门店角色不变。

### 阶段 2：收口总部访问判断

- 导航从 `auditorOnly` 改为总部权限判断；
- `/admin` 页面和服务端接口迁移到有效 HQ 权限判断；
- 旧 `isAuditor` 用户没有 HQ 绑定时不再获得总部治理访问。

### 阶段 3：冻结人员绑定写操作

- 隐藏总部成员绑定导航；
- 服务端拒绝总部管理员对其他人员或总部范围绑定的公开新增、停用和修改操作；
- 不改变店长当前门店成员管理流程；
- 保留数据查询和审计能力；
- 后续需要开放多总部成员时，再单独设计角色目录、审批、范围和审计方案。

## 8. 必须保持不变的行为

- 现有门店岗位定义和门店成员关系不变；
- `zhouluoren` 或本机 `xiaoming` 的既有 `MANAGER` 门店身份不被覆盖；
- 现有 `HQ_ADMIN` 权限目录和全局权限含义不被扩大；
- 权限发布、回滚、缓存失效和审计语义保持不变；
- 门店店长继续可以维护当前门店人员；
- 非总部用户不能通过修改 URL 访问门店审核或总部设置接口；
- 缺少 `HQ_ADMIN/HQ` 绑定的旧 `isAuditor` 用户不自动获得新的总部权限；
- 迁移脚本重复执行不会重复创建用户或绑定。

## 9. 错误与边界场景

| 场景 | 处理 |
|---|---|
| `HQ_ADMIN_USERNAME` 未配置或不符合环境约定 | 在任何写入前失败，不使用默认用户名 |
| `HQ_ADMIN_PASSWORD` 未配置且目标用户不存在 | 迁移失败，不写入半成品用户 |
| `HQ_ADMIN_USERNAME` 对应用户已存在 | 不改密码，只补齐 HQ 绑定 |
| 目标用户处于非激活状态 | 返回 `HQ_ADMIN_TARGET_INACTIVE`，不自动激活 |
| 其他用户已有有效 HQ_ADMIN/HQ 绑定 | 返回 `HQ_ADMIN_BINDING_CONFLICT`，不自动停用或删除 |
| 目标用户已有 HQ_ADMIN/HQ 绑定 | 跳过并报告幂等 |
| 目标用户自己的 HQ 绑定已停用 | 恢复为 ACTIVE 并记录初始化恢复审计 |
| 目标用户已有门店角色 | 保留，不覆盖、不删除 |
| 同名用户冲突 | 按唯一用户名使用现有用户，不创建第二个账号 |
| 旧 `isAuditor=true` 但无 HQ 绑定 | 总部治理页面和接口拒绝访问 |
| 非总部用户请求角色绑定写接口 | 按既有权限规则处理 |
| 总部管理员请求绑定其他人员 | 返回 `HQ_MEMBER_BINDING_DISABLED` |
| 绑定数据存在但角色已停用 | 按现有权限服务规则拒绝生效，并记录审计 |

## 10. 回归测试

### 10.1 迁移脚本

- 测试/生产显式配置 `HQ_ADMIN_USERNAME=zhouluoren` 时创建或补齐 `zhouluoren`、`HQ_ADMIN` 和总部绑定；
- 本机配置 `HQ_ADMIN_USERNAME=xiaoming` 时创建或补齐 `xiaoming`；
- 目标用户已有 `MANAGER` 时保留门店成员关系；
- 第二次执行不重复创建用户、角色或绑定；
- 缺少密码时不创建新用户；
- 存在其他有效总部绑定时返回冲突并回滚；
- 目标用户非激活时不自动激活；
- 目标用户自己的停用总部绑定可恢复并留下审计；
- 普通 `isAuditor=true` 用户不会被自动绑定 `HQ_ADMIN`。

### 10.2 权限服务

- `HQ_ADMIN/HQ` 能访问总部设置和门店审核；
- `MANAGER/STORE` 能访问当前门店人员管理；
- 复合角色用户同时拥有两类访问范围；
- 仅 `isAuditor=true`、没有 HQ 绑定的用户不能访问总部页面；
- 角色绑定写接口在关闭阶段稳定返回业务拒绝。

### 10.3 Web 导航

- 复合角色用户显示“总部治理”和“人员与系统”；
- 纯店长显示门店人员管理，不显示总部治理；
- 纯总部管理员显示总部治理，不显示依赖门店上下文的门店菜单；
- 页面直接访问和刷新不会因只隐藏菜单而绕过服务端守卫；
- 角色切换和当前门店上下文展示正确。

## 11. 涉及文件

### 需要修改

- `apps/api/scripts/migrate-permissions.ts`
- `apps/api/src/permissions/permissions.service.ts`
- `apps/api/src/permissions/permissions.controller.ts`（如需冻结绑定写接口）
- `apps/api/src/permissions/permissions.service.test.ts`
- `apps/api/src/permissions/permissions.controller.test.ts`
- `apps/web/src/features/workbench/management-menu.tsx`
- `apps/web/src/features/workbench/management-shell.tsx`
- `apps/web/app/admin/layout.tsx`
- `apps/web/src/features/workbench/management-menu.test.ts`
- `apps/web/src/features/workbench/management-shell.test.ts`
- `.env.example`

### 本机环境配置

- `.env`：设置 `HQ_ADMIN_USERNAME=xiaoming` 和本机 `HQ_ADMIN_PASSWORD`；该文件不提交。

### 已生成文档

- `docs/features/hq-admin-bootstrap-and-governance-access-design.md`
- `docs/adr/0013-bootstrap-single-hq-admin.md`
- `CONTEXT.md`

## 12. 验收标准

- 本机执行迁移后，`xiaoming` 同时拥有 `MANAGER/STORE` 和 `HQ_ADMIN/HQ`；
- 测试/生产显式配置目标为 `zhouluoren`，密码不出现在代码和脚本中；
- `isAuditor=true` 不再批量产生总部绑定；
- 复合角色用户可见“门店审核”“系统设置”和当前门店“人员管理”；
- 总部管理员不能从页面或公开 API 修改、绑定其他人员；
- 纯店长和无总部绑定用户看不到总部治理入口；
- API 类型检查、Web 类型检查、相关测试和权限迁移回归通过；
- 没有新增总部业务模块或跨门店产品能力。
