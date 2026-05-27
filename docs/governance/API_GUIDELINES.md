# MallBay API 规范

MallBay 当前使用 NestJS 提供 REST API。本文档定义当前与未来接口的规则。

## API 风格

MUST：

- 当前 API 保持 REST 风格。
- 除 multipart 上传外，请求和响应使用 JSON。
- 路由命名以资源为中心。
- 在未提供迁移说明前保持现有路由兼容。

RECOMMENDED：

- 新增面向外部消费的接口时引入 `/api/v1`。
- 迁移期间保留旧的无版本路由作为兼容入口。

## 路由语义

MUST：

- `GET` 用于读取。
- `POST` 用于创建和非幂等命令。
- `PATCH` 用于局部更新和状态流转。
- `DELETE` 用于删除。

禁止：

```text
GET /stores/:id/freeze
POST /stores/:id/delete
```

推荐：

```text
PATCH /api/v1/stores/:id/status
DELETE /api/v1/stores/:storeId/members/:userId
```

## 响应结构

当前 API 直接返回数据。新增和迁移后的 API SHOULD 使用 `packages/shared` 中的显式响应契约。

分页列表 MUST 返回：

```ts
type PageResult<T> = {
  total: number;
  page: number;
  pageSize: number;
  items: T[];
};
```

命令成功 SHOULD 返回：

```json
{ "success": true }
```

创建资源 SHOULD 返回：

```json
{ "id": "resource-id" }
```

## 错误结构

MUST 渐进迁移到：

```json
{
  "code": "STORE_NOT_FOUND",
  "message": "门店不存在",
  "details": {},
  "requestId": "req_..."
}
```

MUST：

- `message` 必须对用户安全。
- `code` 必须稳定，供前端逻辑使用。
- 接入请求追踪后包含 `requestId`。

MUST NOT：

- 向客户端返回 stack trace。
- 暴露敏感内部字段名。
- 返回原始数据库错误。

推荐错误码：

```text
AUTH_INVALID_CREDENTIALS
AUTH_REFRESH_TOKEN_INVALID
STORE_NOT_FOUND
STORE_FORBIDDEN
STORE_ALREADY_FROZEN
STORE_REVIEW_NOTE_REQUIRED
MEMBER_ALREADY_IN_STORE
UPLOAD_INVALID_FILE_TYPE
```

## 分页规范

MUST：

- 接收 `page` 和 `pageSize`。
- 默认 `page = 1`。
- 默认 `pageSize = 20`。
- 限制 `pageSize <= 100`。
- 返回 `total`、`page`、`pageSize`、`items`。

禁止：

```ts
return prisma.store.findMany();
```

推荐：

```ts
const page = dto.page ?? 1;
const pageSize = Math.min(dto.pageSize ?? 20, 100);
const skip = (page - 1) * pageSize;
```

## 鉴权与授权

MUST：

- 默认要求认证。
- 公开接口必须显式使用 `@Public()`。
- 每个写操作必须校验资源所有权。
- 角色和资源权限应在 service、use-case 或 policy 中校验。

当前角色：

- 匿名访客。
- 已登录用户。
- 门店店长。
- 门店成员。
- 审核员。

MUST NOT：

- 信任前端角色判断。
- 在校验资源权限前允许上传或修改。
- 仅从路由形状推断权限。

## Token 策略

当前行为：

- access token 和 refresh token 返回给前端。
- 前端将两者持久化在 Zustand local storage。

目标行为：

- access token 短期有效，仅保存在内存中。
- refresh token 存储在 HttpOnly secure cookie 中。
- refresh token 使用时轮换。
- logout 使服务端 refresh token 状态失效。

MUST：

- 服务端保存 refresh token hash。
- 重置密码时清除 refresh token 状态。
- 生产环境使用强密钥且无默认 fallback。

## 幂等性

以下操作 RECOMMENDED 支持幂等：

- 创建门店。
- 提交门店审核。
- 邀请成员。
- 重置密码。
- 文件上传登记。

当重复提交会产生重复副作用时，使用 `Idempotency-Key`。

## 版本策略

MUST：

- 开始版本化后，新公开 API 使用 `/api/v1`。
- 客户端迁移完成前保留旧接口。
- PR 和发布说明中记录破坏性变更。

推荐迁移流程：

1. 增加 `/api/v1/...` 新响应结构接口。
2. 保持旧接口不变。
3. 前端 client 迁移到 v1。
4. 后续独立清理旧接口。

## 上传接口

MUST：

- 校验文件存在、大小、MIME 类型和资源所有权。
- 避免在 controller 中构造上传客户端。
- 存储服务必须封装在可注入 service 后面。
- 只返回公开 URL 或 object key，不返回 provider 凭据。

禁止：

```ts
const oss = new OssService();
const url = await oss.uploadStorePhoto(storeId, file);
```

推荐：

```ts
return this.uploadStorePhotoUseCase.execute({
  userId: req.user.id,
  storeId,
  file
});
```
