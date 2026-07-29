# 系统设置职责工作台实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将系统设置从单页原型落地为按职责、能力、数据范围驱动的工作台，并建立配置版本、草稿/发布、服务端校验与审计闭环。

**Architecture:** NestJS 提供统一设置能力清单、配置版本与审计 API；每个写接口在服务端按用户角色和门店范围授权。Next.js `/settings` 只消费服务端能力并按职责渲染卡片，模块页复用公共版本状态与错误反馈。现有字典模型继续承载系统固定、总部模板和门店自定义项，并补齐逐项状态、引用保护和并发版本校验。

**Tech Stack:** Next.js 16, React 19, Ant Design 6, TanStack Query, NestJS 11, Prisma 7, PostgreSQL, Jest/Node test runner。

## Global Constraints

- 权限由“角色 × 能力 × 操作 × 数据范围”组成，前端隐藏按钮不构成授权。
- 无 `view` 权限的接口返回 403；店长和财务只能访问当前门店，财务不得修改门店运营开关。
- 本期不设置审批节点；具备 `publish` 权限且校验通过即可发布。
- 已发布版本不可直接修改；修改必须创建新草稿，历史订单继续使用已有快照。
- 字典继承顺序为系统固定 > 总部模板 > 门店自定义；总部禁用项门店不可重新启用。
- 被引用的字典项只能禁用，不能删除；导出不得包含密钥、密码、令牌。

---

### Task 1: 建立设置领域公共模型与能力 API

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/src/settings/settings-capabilities.ts`
- Create: `apps/api/src/settings/settings-access.service.ts`
- Create: `apps/api/src/settings/settings.controller.ts`
- Modify: `apps/api/src/settings/settings.module.ts`
- Modify: `apps/api/src/app.module.ts`
- Test: `apps/api/src/settings/settings-access.service.test.ts`

**Interfaces:**
- `SettingsAccessService.getCapabilities(user): Promise<CapabilityView[]>`
- `SettingsAccessService.assert(user, code, action, scopeId?): Promise<ResolvedSettingsActor>`
- `GET /settings/capabilities` returns visible domains, actions, scope and status.

- [x] **Step 1: Add persisted configuration version and settings audit fields**

Add Prisma models/enums for `SettingsConfigVersion` and `SettingsCapability` while reusing `AuditEvent` for immutable operation records. Include indexes on `(domain, scopeId, status)`, `(capabilityCode, scopeId)`, actor and created time. Add `User` and `Store` relations and run `pnpm prisma:generate`.

- [x] **Step 2: Implement role-to-capability policy**

Map `isAuditor` to HQ governance, `MANAGER` to store operations, `FINANCE` to finance settings, and all authenticated users to own account settings. Return the smallest safe store scope and never trust a requested store id when it differs from the authenticated member's store.

- [x] **Step 3: Expose capability list and 403 behavior**

Implement `GET /settings/capabilities` under `JwtAuthGuard`. `assert` must throw `ForbiddenException("当前角色无权访问该设置")` for missing view/action or scope mismatch. Add unit tests for manager, finance, auditor, cross-store access and read-only users.

- [x] **Step 4: Run focused API tests**

Run `pnpm --filter @mallbay/api test -- settings-access.service.test.ts` (or the repository's equivalent Jest target). Expected: all policy cases pass.

### Task 2: 完善配置版本草稿、校验、发布与审计

**Files:**
- Create: `apps/api/src/settings/config-versions.service.ts`
- Create: `apps/api/src/settings/config-versions.controller.ts`
- Create: `apps/api/src/settings/dto/config-version.dto.ts`
- Modify: `apps/api/src/settings/settings.module.ts`
- Modify: `apps/api/src/observability/audit-log.service.ts`
- Test: `apps/api/src/settings/config-versions.service.test.ts`

**Interfaces:**
- `POST /settings/config-versions` creates a draft after permission and payload validation.
- `PATCH /settings/config-versions/:id` updates only draft versions using `expectedVersion`.
- `POST /settings/config-versions/:id/validate` returns field errors and validation status.
- `POST /settings/config-versions/:id/publish` rechecks permission/version overlap and records audit.
- `GET /settings/config-versions?domain=&scopeId=` lists versions within the caller's scope.

- [x] **Step 1: Write validation and lifecycle tests**

Cover draft creation, required payload, invalid enum, expired published version, overlapping `effectiveAt`, stale `expectedVersion`, publish authorization and audit payload containing before/after summary, actor, role/store and result.

- [x] **Step 2: Implement lifecycle service transactionally**

Use Prisma transactions for draft writes, validation result, publish state transition and `AuditEvent` creation. Published rows are immutable; publish must reject another published version whose effective interval overlaps.

- [x] **Step 3: Add idempotency and error mapping**

Accept an idempotency key for create/publish, return the original result for retries, and map stale writes to HTTP 409 with a refreshable message. Do not report success until the transaction commits.

- [x] **Step 4: Run service tests and typecheck**

Run the focused test file and `pnpm --filter @mallbay/api typecheck`.

### Task 3: 将字典 API 对齐 PRD 的继承、逐项状态和审计规则

**Files:**
- Modify: `apps/api/src/settings/dictionaries.service.ts`
- Modify: `apps/api/src/settings/dictionaries.controller.ts`
- Modify: `apps/api/src/settings/dto/dictionary.dto.ts`
- Test: `apps/api/src/settings/dictionaries.service.test.ts`

**Interfaces:**
- Existing dictionary endpoints remain backward compatible.
- `PATCH /settings/dictionaries/items/:itemId/status` accepts `version` and returns the latest dictionary version/item.
- `DELETE /settings/dictionaries/items/:itemId` rejects `usageCount > 0` with reference count.

- [x] **Step 1: Add failing tests for PRD dictionary cases**

Test independent child toggle, duplicate code conflict, HQ-disabled item cannot be re-enabled by store manager, referenced item cannot delete, stale version conflict, and audit on enable/disable/failure.

- [x] **Step 2: Implement server-side policy and normalized response**

Resolve inherited rows in fixed/template/store order, expose `source`, `referencedCount`, `deletePolicy` and current `version`, and preserve legacy `items` for existing consumers.

- [x] **Step 3: Add audit writes to every mutation**

Persist success and failure metadata through the existing audit service; include field-level before/after summaries and reason without sensitive values.

- [x] **Step 4: Run dictionary tests and API typecheck**

Run the focused dictionary tests and API typecheck.

### Task 4: 重构 Next.js 设置首页为职责工作台

**Files:**
- Modify: `apps/web/app/settings/page.tsx`
- Modify: `apps/web/src/features/settings/access.ts`
- Modify: `apps/web/src/features/settings/api.ts`
- Create: `apps/web/src/features/settings/workbench-model.ts`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/src/features/settings/settings-page.test.ts`

**Interfaces:**
- `settingsApi.capabilities()` consumes `GET /settings/capabilities`.
- `getSettingsWorkspaces(capabilities)` returns HQ/STORE/FINANCE/OWN card groups.
- Cards display status, source, version, updatedAt, operator and pending/validation-failure counts.

- [x] **Step 1: Add frontend model tests**

Assert manager only sees store/own, finance only sees finance/own, auditor sees HQ/store/finance/own, and unimplemented capabilities are rendered as disabled “规划中” without an actionable button.

- [x] **Step 2: Implement capability-driven loading**

Load capabilities after auth hydration; show loading/error states; do not infer visibility from hard-coded position checks. Keep a unified “查看全部设置” entry that navigates to a real route and renders a 403 page when blocked.

- [x] **Step 3: Implement responsive workbench UI**

Use the existing Ant Design visual language, with clear domain sections, state tags, recent changes/audit links and no static KPI claims. Preserve current navigation only where it maps to an actual implemented action.

- [x] **Step 4: Run frontend settings tests and typecheck**

Run `pnpm --filter @mallbay/web test` for settings tests and `pnpm --filter @mallbay/web typecheck`.

### Task 5: 实现字典树与草稿/发布交互

**Files:**
- Create: `apps/web/app/settings/dictionaries/page.tsx`
- Create: `apps/web/src/features/settings/dictionary-workbench.tsx`
- Modify: `apps/web/src/features/settings/api.ts`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/src/features/settings/dictionary-workbench.test.ts`

- [x] **Step 1: Add interaction tests**

Cover selecting a parent dictionary, toggling one child while siblings remain unchanged, showing reference count before delete, preserving invalid form input after server validation failure, reloading server state after save, and blocking publish when version is stale.

- [x] **Step 2: Implement tree and item editor**

Render parent/child hierarchy, source and reference metadata, independent switches, add/edit/delete affordances according to capability actions, and explicit “总部已禁用” messaging.

- [x] **Step 3: Implement versioned draft/publish controls**

Save complete payload with client version, call validate before publish, show server field errors, and refetch on success to display version/time/operator.

- [x] **Step 4: Run focused browser-facing tests**

Run the dictionary workbench tests and web typecheck.

### Task 6: 增加 403、审计入口与职责域骨架

**Files:**
- Create: `apps/web/app/settings/forbidden/page.tsx`
- Create: `apps/web/app/settings/audit/page.tsx`
- Create: `apps/web/app/settings/store/page.tsx`
- Create: `apps/web/app/settings/finance/page.tsx`
- Create: `apps/web/app/settings/account/page.tsx`
- Modify: `apps/web/src/features/settings/api.ts`
- Test: `apps/web/src/features/settings/settings-routes.test.ts`

- [x] **Step 1: Add route authorization tests**

Assert direct access to an unauthorized module renders the 403 copy and return-home action; authorized users see the module shell with “规划中” only for capabilities not implemented in this increment.

- [x] **Step 2: Implement shared route guard and module shells**

Each route consumes capability data, calls the server-backed guard, and uses current store scope. Do not allow query-string store switching for manager/finance users.

- [x] **Step 3: Implement audit list filters and safe export contract**

Add paginated audit query with domain/action/date filters and server-side scope filtering. Export requests over 10,000 rows are rejected; sensitive fields are omitted or masked.

- [x] **Step 4: Run route tests and web build**

Run route tests and `pnpm --filter @mallbay/web build`.

### Task 7: 回归验证与 PRD 完成审计

**Files:**
- Modify: `docs/qa/system-settings-responsibility-workbench-checklist.md`
- Create: `docs/qa/release-evidence/system-settings-responsibility-workbench-20260728.md`

- [x] **Step 1: Run repository checks**

Run `pnpm lint`, `pnpm typecheck`, focused API/web tests and `pnpm build`.

- [x] **Step 2: Verify critical Given/When/Then cases**

Exercise manager, finance and auditor sessions; verify 403, current-store boundary, save/read-back, validation failure, version conflict, publish, dictionary child toggle/reference protection and audit/export masking.

- [x] **Step 3: Record evidence and deviations**

Document commands, outcomes, runtime screenshots if available, and any explicitly deferred PRD items. Do not claim full completion if a required behavior lacks direct evidence.

- [x] **Step 4: Update progress and complete only after evidence passes**

Mark the goal complete only when the implementation and verification cover all required items.


## 执行结果补充（2026-07-29）

- 所有 Task 1-7 已完成；实际 API/Web 入口、服务端能力校验、配置版本、字典继承、审计导出、灰度回滚和迁移控制均已落地。
- 新增 FinanceSettlement 落地任务：复用现有成本核算逻辑，新增版本化策略 payload、策略校验器和门店策略读取；迁移脚本 `npm run settings:migrate:finance-settlement` 首次生成 2 个门店 v1，重复执行 `created:0, skipped:2`。
- 审计授权最终边界：总部审计员可查看全局，店长可查看本店业务审计，财务可查看本店财务域审计，施工和采购返回 403；财务请求 `domain=STORE` 返回 403。
- 最终验证：设置领域回归 16/16，API typecheck/build 通过，Web typecheck/build 通过，生产构建 72/72 页面生成。