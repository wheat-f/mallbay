# MallBay 架构规范

MallBay 当前定位为 **Nx monorepo 下的模块化单体**。当前系统包含：

- `apps/web`：Next.js、React、Ant Design、TanStack Query、Zustand。
- `apps/api`：NestJS API、Prisma、PostgreSQL，Redis 依赖已预置。
- `packages/shared`：前后端共享的 TypeScript 契约。

MallBay 目前不是微服务系统。在模块边界、数据所有权、可观测性和部署运维能力成熟之前，不应拆分为微服务。

## 模块边界

后端采用 feature-first 模块组织：

- `auth`：注册、登录、刷新令牌轮换、当前用户会话。
- `users`：个人资料、登录凭据绑定、头像、密码操作、审核员用户操作。
- `stores`：门店生命周期、审核提交、公开和审核员门店视图。
- `members`：门店成员、邀请、成员移除。
- `notifications`：通知和未读状态。
- `prisma`：数据库客户端基础设施。

MUST：

- 保持功能模块所有权清晰。每个模块拥有自己的路由、DTO、用例、领域策略和仓储。
- 跨模块调用必须通过对外导出的 provider，不允许直接访问其他模块的私有仓储或 Prisma 查询形状。
- `packages/shared` 不得引入 Nest、React、Prisma 或数据库实现细节。

RECOMMENDED：

- 当一个 service 同时承担多类职责时，在该 feature 下增加 `domain`、`repositories`、`use-cases` 目录。

禁止示例：

```ts
const { OssService } = await import("../users/oss.service");
const oss = new OssService();
```

推荐示例：

```ts
constructor(private readonly uploadAvatarUseCase: UploadAvatarUseCase) {}
```

## 分层规则

依赖方向固定为：

```text
Controller -> Application Service / Use Case -> Domain Policy -> Repository -> Prisma
```

MUST：

- Controller 只处理 HTTP 路由、Guard、DTO 绑定、文件拦截器和响应交接。
- Service 和 Use Case 负责编排业务流程、事务、仓储和外部服务。
- Domain Policy 表达纯业务规则，不依赖 Nest、HTTP、Prisma 或 `process.env`。
- Repository 封装 Prisma 查询和持久化映射。
- Prisma model 是持久化模型，不是公开 API 实体。

临时例外：

- 在代码库仍较小时，现有 service 可以继续直接调用 `PrismaService`。但新增高风险流程，例如审核、接受邀请、变更店长、重置密码，应优先建立 use-case 或 repository 边界。

## 禁止的跨层调用

MUST NOT：

- 在 controller 中调用 Prisma。
- 在 controller 中使用 `new` 实例化 service。
- 在 domain、controller 或业务 service 中散落读取 `process.env`。
- 返回包含 `passwordHash` 或 `refreshTokenHash` 的原始用户记录。
- 在 `packages/shared` 中放业务规则。

## API 层职责

Controller MUST：

- 声明路由和 HTTP 方法语义。
- 显式应用 Guard 和 `@Public()`。
- 接收 DTO 和路由参数。
- 委托给一个 service 或 use case。

Controller MUST NOT：

- 开启事务。
- 查询 Prisma。
- 构造外部服务客户端。
- 决定领域状态流转。

## Service / Use Case 职责

Service 和 Use Case MUST：

- 拥有应用工作流。
- 定义事务边界。
- 调用 repository 和其他模块导出的 service。
- 让副作用显式、可测试。

Service 方法 SHOULD 控制在约 50 行内。Service 类 SHOULD 控制在约 250 行内。超过后应按用例拆分。

## Repository / Data Access 职责

Repository MUST：

- 封装 Prisma 查询形状。
- 保持数据库投影显式。
- 对列表查询强制分页。
- 避免泄露敏感字段。

Repository MUST NOT：

- 包含 HTTP exception。
- 包含 UI 专用响应格式。
- 调用外部网络服务。

## Domain 职责

Domain 代码 MUST：

- 表达门店状态流转、店长权限、邀请资格、审核约束等规则。
- 保持确定性和可单元测试。
- 避免框架依赖。

推荐示例：

- `StorePolicy.canSubmitForReview(member, store)`
- `InvitationPolicy.canAccept(invitation, currentMembership)`
- `StoreAuditPolicy.nextStatusAfterRejection(hasApprovedSubmission)`

## DTO / VO / Entity 规范

MUST：

- DTO 使用 `class-validator` 校验入参。
- DTO 不得复用为持久化模型。
- Value Object 表达已校验的领域概念，例如 `StorePhotoSet`。
- API 响应必须使用显式契约，放在 `packages/shared` 或本地 response mapper 中。
- Prisma model 保持为持久化实体。
## 当前代码实现映射

以下模块清单以 `apps/api/src/` 当前目录为准，新增模块应继续遵循 feature-first 组织：

| 领域 | 代码目录 | 主要职责 |
|---|---|---|
| 身份与门店 | `auth`、`users`、`stores`、`members` | 登录、会话、门店生命周期、成员与岗位 |
| 客户与订单 | `customers`、`products`、`orders`、`sales-quotes` | 客户车辆、产品、报价、订单、收款和订单审计 |
| 履约 | `inventory`、`purchases`、`construction` | 批次库存、采购、人工锁库/出库、派工、施工、质检和返工 |
| 交付与售后 | `warranties`、`after-sales`、`commissions` | 质保卡、最终交付、售后工单、施工和售后提成 |
| 经营财务 | `finance`、`invoices`、`rebates`、`reports` | 费用、报销、发票、返利、报表和经营汇总 |
| 平台能力 | `notifications`、`settings`、`prisma`、`common` | 站内待办、系统设置、数据库和公共能力 |

订单最终交付的领域规则集中在：

- `apps/api/src/orders/domain/order-workflow.ts`：根据现有订单状态、施工、质检、质保和收款数据派生当前阶段及能力。
- `apps/api/src/orders/domain/order-delivery.ts`：在事务内完成质保生成/激活、订单完成、审计和待办关闭。
- `apps/api/src/construction/construction.service.ts`：施工完工、质检、返工记录和复检入口。

架构文档不得把施工记录 `COMPLETED` 描述为订单已完成；订单只有在尾款结清并完成最终交付事务后才进入 `OrderStatus.COMPLETED`。
