# MallBay 编码规范

本文档定义 MallBay 在 TypeScript、NestJS、Next.js、React 和 Prisma 代码中的项目级规范。

## TypeScript

MUST：

- 保持 `strict` 模式开启。
- 公开 API 类型优先显式声明。
- 避免使用 `any`。
- 对不可信输入使用 `unknown` 并完成类型收窄。
- 仅导入类型时使用 `type` import。

允许例外：

```ts
// 第三方基础设施库类型不完整时，允许在 adapter 层集中隔离。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const OSS = require("ali-oss") as any;
```

禁止：

```ts
function handle(value: any) {
  return value.data;
}
```

## 命名规范

MUST：

- class、React component、DTO class、Prisma model 使用 PascalCase。
- 变量、函数、对象字段、Prisma 字段使用 camelCase。
- 与 Prisma enum 对齐的枚举值使用 UPPER_SNAKE_CASE。
- DTO 文件命名为 `*.dto.ts`。
- Guard 文件命名为 `*.guard.ts`。
- Use Case 文件命名为 `*.use-case.ts`。
- Repository 文件命名为 `*.repository.ts`。

推荐：

```text
review-store.dto.ts
review-store-submission.use-case.ts
store.repository.ts
store-policy.ts
NotificationBell.tsx
```

## 函数和类大小

MUST：

- 函数只承担一个变化原因。
- 函数超过约 50 行时应拆分，除非流程线性且简单。
- Service 类超过约 250 行时应拆分。
- React 页面组件超过约 300 行时应拆分。

RECOMMENDED：

- 重复权限判断抽为 policy。
- 大页面抽出展示组件。
- 页面中的 API hooks 下沉到 feature。

## 注释规范

MUST：

- 解释非显而易见决策的原因。
- 标注尚未由数据库强制约束的业务不变量。

MUST NOT：

- 注释显而易见的赋值。
- 用注释替代缺失的约束或测试。

推荐：

```ts
// 强制重置密码后使 refresh token 失效。
await prisma.user.update({
  data: { passwordHash, refreshTokenHash: null }
});
```

## 错误处理

后端 MUST：

- 抛出 Nest exception 或项目定义的领域错误。
- 引入后统一使用全局 exception filter。
- 返回稳定的 API 错误码供前端处理。

前端 MUST：

- 在交互边界将 API 错误转换为用户可理解的信息。
- API client 引入错误码后必须保留机器可读字段。

禁止：

```ts
throw new Error("no permission");
```

推荐：

```ts
throw new ForbiddenException("无权限");
```

## 日志规范

MUST：

- 引入 logger 后使用结构化日志。
- 可用时包含 request id、path、status、duration、user id。
- 对凭据和 token 脱敏。

MUST NOT 记录：

- 密码。
- access token。
- refresh token。
- 完整手机号。
- OSS access key。
- `passwordHash` 或 `refreshTokenHash`。

## Async / Await

MUST：

- 对有副作用的 Promise 使用 `await`。
- 只有调用方拥有错误处理时才直接返回 Promise。
- 避免 fire-and-forget；如必须后台执行，必须捕获并记录失败。

禁止：

```ts
this.notifications.send(userId, "STORE_FROZEN", payload);
return { success: true };
```

推荐：

```ts
await this.notifications.send(userId, "STORE_FROZEN", payload);
return { success: true };
```

## 配置管理

MUST：

- 后端配置通过 `ConfigService` 或 typed config provider 读取。
- 浏览器可见变量必须使用 `NEXT_PUBLIC_` 前缀。
- 生产必需配置缺失时必须 fail fast。

MUST NOT：

- 在业务 service 中散落读取 `process.env`。
- 为生产可用密钥提供默认 fallback。

## React 与状态管理

MUST：

- 服务端状态使用 TanStack Query。
- Zustand 仅用于登录会话、UI 偏好或短生命周期客户端状态。
- 页面组件尽量只做路由组合。

MUST NOT：

- 将服务端列表数据放入 Zustand。
- 在多个页面文件中重复 API 响应类型。
- 明知具体 query key 时仍做粗粒度全局失效。

## Prisma

MUST：

- 面向用户的数据使用显式 `select` 或 response mapping。
- 列表查询必须分页。
- 多表写入必须使用事务。

MUST NOT：

- 公开列表接口使用无 `take` 的 `findMany`。
- 使用无约束 `where` 的 `deleteMany`。
- 使用 `$queryRawUnsafe`。
