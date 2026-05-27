# MallBay 渐进式改造计划

本计划用于将当前代码库逐步推进到架构基线。它不是重写计划。

## 目标

MUST：

- 保持业务行为不变。
- 优先提升安全性和可维护性。
- 每一步都要小、独立、可回滚。
- 风险重构前先补测试。
- 除非明确计划迁移，否则保持现有 API 路由兼容。

## 当前问题清单

### P0：门店照片上传缺少授权校验

当前问题：

- `StoresController.uploadStorePhoto` 在确认当前用户是否为目标门店店长前就上传到 OSS。
- Controller 动态 import 并实例化 `OssService`。

风险：

- 任意已登录用户可能向其他门店 id 下上传照片。
- 上传基础设施绕过 Nest 依赖注入，难以测试。

目标：

- 通过 Nest 注入上传服务。
- 上传前校验店长权限。
- 补充允许和拒绝上传的测试。

### P0：生产 JWT secret 存在开发默认值

当前问题：

- Auth service 在配置缺失时回退到开发 secret。

风险：

- 生产环境可能在缺失环境变量时使用可预测密钥运行。

目标：

- 使用 typed config validation 或 `ConfigService.getOrThrow`。
- 仅在显式本地开发路径中允许默认值。

### P0：前端持久化 access token 和 refresh token

当前问题：

- Zustand persist 将 `accessToken` 和 `refreshToken` 存入 local storage。

风险：

- 一旦发生 XSS，长期会话凭据可被窃取。

目标：

- 短期减少持久化数据并集中 refresh 行为。
- 中期将 refresh token 移至 HttpOnly cookie，access token 仅保存在内存中。

### P1：StoresService 职责过宽

当前问题：

- `StoresService` 混合了授权判断、领域规则、事务、查询投影和通知副作用。

风险：

- 状态流转 bug 难以测试。
- 后续门店工作流会进一步增加耦合。

目标：

- 抽取 `StorePolicy`。
- 抽取 `StoreRepository`。
- 抽取高风险 use case：
  - `SubmitStoreForReviewUseCase`
  - `ReviewStoreSubmissionUseCase`
  - `ChangeStoreManagerUseCase`
  - `SetStoreFrozenUseCase`

### P1：API 错误未标准化

当前问题：

- Nest 默认 exception 响应没有项目级错误码和 request id。

风险：

- 前端只能解析人类可读 message。
- 生产排障缺少请求关联。

目标：

- 增加 request id middleware。
- 增加全局 exception filter。
- 定义稳定错误码常量。

### P1：前端 API client 单文件过大

当前问题：

- `apps/web/src/lib/api.ts` 同时包含 request 基础设施、领域 API client 和响应类型。

风险：

- 类型容易与后端漂移。
- 页面变更容易触碰无关 API 代码。

目标：

- 保留 `src/lib/request.ts` 作为底层 client。
- 将 API client 移到 `src/features/<feature>/api.ts`。
- 稳定契约移动到 `packages/shared`。

### P1：测试覆盖缺失

当前问题：

- 当前没有 `*.spec.ts` 或 `*.test.ts` 文件。

风险：

- 重构可能静默破坏认证、权限和状态流转。

目标：

- 为 policy 增加单元测试。
- 为门店审核和邀请增加 use-case 测试。
- 为关键认证和权限路径增加 E2E 测试。

### P2：部分数据库约束仅由应用层保证

当前问题：

- 部分不变量只写在注释中，由应用层保证。

示例：

- 同一门店只有一张封面图。
- 同一门店同一时间只有一条 pending audit submission。

风险：

- 并发写入可能破坏不变量。

目标：

- 评估 partial unique index 或事务锁。
- 在测试刻画当前行为后再增加 migration。

### P2：ESLint 配置过弱

当前问题：

- ESLint 仅使用基础 JS recommended 规则。

风险：

- TypeScript、React、import 和架构边界违规无法被捕获。

目标：

- 增加 TypeScript ESLint。
- 增加 React / Next linting。
- 目录约定稳定后增加 import boundary 规则。

## 升级路线

### Phase 1：安全与基础稳定

1. 门店照片上传前要求店长授权。
2. OSS service 接入 Nest DI。
3. 生产 JWT secret 缺失时 fail fast。
4. 限制分页 `pageSize`。
5. 为上传授权和 auth secret 配置增加 smoke tests。

### Phase 2：API 基础设施

1. 增加 request id middleware。
2. 增加全局 exception filter。
3. 定义稳定 API 错误码。
4. 更新前端 request client，保留 `code` 和 `requestId`。

### Phase 3：门店领域拆分

1. 为门店提交、审核、冻结、变更店长增加 characterization tests。
2. 抽取 `StorePolicy`。
3. 抽取 `StoreRepository`。
4. 抽取 `ReviewStoreSubmissionUseCase`。
5. 抽取 `SubmitStoreForReviewUseCase`。
6. 抽取 `ChangeStoreManagerUseCase`。

### Phase 4：前端 API client 拆分

1. 创建 `src/lib/request.ts`。
2. 将 auth API 移到 `src/features/auth/api.ts`。
3. 将 store API 移到 `src/features/stores/api.ts`。
4. 将 member API 移到 `src/features/members/api.ts`。
5. 将 notification API 移到 `src/features/notifications/api.ts`。
6. 在 `src/lib/api.ts` 保留临时 re-export。

### Phase 5：认证安全加固

1. 增加基于 cookie 的 refresh 行为。
2. 兼容期内保留旧 token 响应。
3. 将 refresh token 移出 local storage。
4. access token 仅保存在内存中。
5. 增加 logout 和 refresh E2E 覆盖。

### Phase 6：数据库不变量

1. 识别当前重复数据风险。
2. 增加数据预检脚本。
3. 在 PostgreSQL 支持良好的场景下增加数据库级约束。
4. 更新 repository 处理约束冲突。

### Phase 7：可观测性

1. 增加结构化日志。
2. 为敏感操作增加审计日志。
3. 增加 latency、error、login failure、upload failure 指标。
4. 增加 HTTP、Prisma、OSS trace。

## 首个推荐改造批次

开始实现时建议按以下顺序：

1. docs-only PR：提交治理文档。
2. 上传授权和 OSS DI。
3. JWT config fail-fast。
4. 为以上两项补测试。
