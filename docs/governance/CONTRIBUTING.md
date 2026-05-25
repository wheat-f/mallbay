# MallBay 贡献规范

本文档定义 MallBay 代码变更进入主干前必须遵守的协作规则。

## 开发原则

MUST：

- 行为变更必须小步、可回滚。
- 除非任务明确要求，否则保持现有业务行为不变。
- 优先采用 feature-first 组织方式。
- 在重构业务规则前补充测试。
- 除非已有迁移计划，否则保持 API 兼容。

RECOMMENDED：

- 只重构当前任务涉及的代码。
- 将机械格式化与行为变更拆开提交。

## 本地开发流程

```bash
pnpm install
docker compose up -d
pnpm prisma:generate
pnpm prisma:migrate
pnpm dev
```

提交 PR 前按变更范围运行检查：

```bash
pnpm typecheck
pnpm build
```

## 分支命名

MUST：

- 分支名必须清晰表达目的。
- 一个分支只承载一个逻辑目标。

推荐：

```text
feature/store-review-policy
fix/store-photo-upload-auth
refactor/api-error-filter
docs/architecture-governance
codex/<short-scope>
```

禁止：

```text
test
fix
xxx
new-code
```

## Commit Message

MUST 使用 Conventional Commits：

```text
feat: add store review policy
fix: require manager permission for store photo upload
refactor: split store audit use case
test: cover invitation acceptance rules
docs: add API guidelines
chore: update workspace config
```

禁止：

```text
fix: xxx
update
wip
final
```

## Pull Request 规范

每个 PR MUST 包含：

- Scope：变更范围。
- Verification：执行过的验证命令和结果。
- Risk：可能影响的风险点。
- Rollback：如何安全回滚。
- 可见 UI 变更必须附截图。
- 数据库或 API 契约变更必须说明迁移方式。

PR MUST NOT：

- 混合无关 feature 和重构。
- 提交非必要生成物。
- 在未说明兼容性的情况下修改公开 API 响应结构。

## Code Review 规范

Reviewer MUST 优先检查：

- 鉴权和资源所有权。
- token 与凭据安全。
- 事务一致性。
- 数据库查询形状和分页。
- API 兼容性。
- 业务规则测试覆盖。

## 数据库变更规范

MUST：

- 使用 Prisma migration。
- 已提交的 migration 视为不可变。
- 在 PR 中包含回滚说明。
- 尽可能本地验证 migration。

MUST NOT：

- 修改已经合并的 migration。
- 在没有数据方案的情况下执行破坏性 migration。
- 仅依赖应用层注释保证关键唯一性。

## 安全规范

MUST：

- 永不提交真实密钥。
- 永不记录密码、token、完整手机号、OSS 凭据或 refresh token hash。
- 校验上传文件类型和大小。
- 上传或修改资源前必须校验资源所有权。
- 生产环境密钥必须显式配置。
