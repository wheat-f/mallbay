# Finance Workflow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将财务管理重构为可查询、可审批、可付款、可追溯的费用与报销闭环，并把财务首页恢复为列表和待办驱动的工作台。

**Architecture:** 保留现有 `ExpenseApplication`、`ReimbursementApplication`、`PaymentRecord`，新增审批记录、附件和明确的流水方向。API 按查询、费用工作流、报销工作流和附件服务拆分；Web 将单个巨型 `/finance` 页面拆为总览、费用、报销、账户和流水路由，并复用现有管理端设计令牌。

**Tech Stack:** TypeScript 6、NestJS 11、Prisma 7、PostgreSQL 17、Next.js 16、React 19、Ant Design 6、TanStack Query 5、Node test runner、pnpm 11。

**Source of Truth:** `docs/superpowers/specs/2026-07-13-finance-workflow-redesign.md`

## Global Constraints

- 费用申请是事前审批；报销是实际费用发生后的事后付款申请。
- 审批通过不等于已付款；只有确认付款才能生成资金流水。
- 资金金额始终保存正整数分值，收入/支出由 `PaymentDirection` 明确表达。
- 申请人只能查看自己的申请；店长、财务和管理员按门店权限查看全量。
- 前端隐藏无权限动作，服务端必须再次校验角色、门店和状态。
- 附件必须通过现有 `OssService` 上传并持久化 URL，不保存临时本地路径。
- 重复审批、重复付款和非法状态跳转不得产生重复记录。
- 不引入通用审批引擎、银企直连、多币种或会计总账。
- 不修改或提交 `apps/web/node_modules`、`.codegraph/`、`docs/bug/`。

---

## File Structure

### API and data

- Modify `apps/api/prisma/schema.prisma`: 财务枚举、审批记录、附件、业务单号和流水方向。
- Create `apps/api/prisma/migrations/20260713120000_finance_workflow_redesign/migration.sql`: 安全迁移历史财务数据。
- Modify `packages/shared/src/index.ts`: 财务列表、详情、附件、审批记录和分页类型。
- Modify `apps/api/src/common/policies/permission.policy.ts`: 我的申请、费用审批、财务审核和付款权限。
- Modify `apps/api/src/finance/dto/finance.dto.ts`: 分页筛选、审批、付款、撤回和重新提交 DTO。
- Create `apps/api/src/finance/finance-query.service.ts`: 工作台、分页列表、详情和流水查询。
- Create `apps/api/src/finance/expense-workflow.service.ts`: 费用创建、审批、撤回和重新提交。
- Create `apps/api/src/finance/reimbursement-workflow.service.ts`: 报销创建、审核、撤回、重新提交和幂等付款。
- Create `apps/api/src/finance/finance-attachments.service.ts`: 附件上传和权限校验。
- Modify `apps/api/src/finance/finance.controller.ts`: 新增查询和动作端点。
- Modify `apps/api/src/finance/finance.module.ts`: 注册拆分后的服务。
- Modify `apps/api/src/finance/finance.service.ts`: 临时兼容旧调用，委托给新服务。

### Web

- Modify `apps/web/src/features/finance/api.ts`: 新 API 客户端和分页契约。
- Modify `apps/web/src/features/finance/display.ts`: 状态、节点、方向和操作显示函数。
- Create `apps/web/src/features/finance/routes.ts`: 财务模块路由和角色可见入口。
- Create `apps/web/src/features/finance/components/finance-application-table.tsx`: 费用/报销通用列表壳。
- Create `apps/web/src/features/finance/components/finance-attachment-upload.tsx`: 多附件上传与预览。
- Create `apps/web/src/features/finance/components/finance-approval-timeline.tsx`: 数据驱动审批时间线。
- Rewrite `apps/web/app/finance/page.tsx`: 财务总览与待办。
- Create `apps/web/app/finance/expenses/page.tsx`: 费用列表和创建抽屉。
- Create `apps/web/app/finance/expenses/[id]/page.tsx`: 费用详情和审批动作。
- Create `apps/web/app/finance/reimbursements/page.tsx`: 报销列表和创建抽屉。
- Create `apps/web/app/finance/reimbursements/[id]/page.tsx`: 报销审核、付款与流水关联。
- Create `apps/web/app/finance/accounts/page.tsx`: 收款账户列表和维护抽屉。
- Create `apps/web/app/finance/ledger/page.tsx`: 资金流水筛选与列表。
- Modify `apps/web/app/globals.css`: 新路由的财务工作台响应式布局。

---

### Task 1: Add Finance Workflow Schema and Shared Contracts

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20260713120000_finance_workflow_redesign/migration.sql`
- Modify: `packages/shared/src/index.ts`
- Test: `apps/api/src/prisma/schema.test.ts`

**Interfaces:**
- Produces: `FinanceApplicationType`, `FinanceApprovalNode`, `FinanceApprovalAction`, `FinanceAttachmentCategory`, `PaymentDirection`.
- Produces: `PaginatedResult<T>`, `FinanceApplicationDetail`, `FinanceApprovalRecordSummary`, `FinanceAttachmentSummary`, `FinanceOverviewSummary`.

- [ ] **Step 1: Write the failing schema test**

Add assertions to `apps/api/src/prisma/schema.test.ts`:

```ts
test("finance workflow schema exposes approval attachment and payment direction", () => {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  assert.match(schema, /enum PaymentDirection[\s\S]*INCOME[\s\S]*EXPENSE/);
  assert.match(schema, /model FinanceApprovalRecord/);
  assert.match(schema, /model FinanceAttachment/);
  assert.match(schema, /direction\s+PaymentDirection/);
  assert.match(schema, /paymentRecordId\s+String\?\s+@unique/);
});
```

- [ ] **Step 2: Run the schema test and confirm failure**

Run:

```powershell
pnpm --filter @mallbay/api test
```

Expected: FAIL because the new models and enums do not exist.

- [ ] **Step 3: Add schema models and fields**

Add the exact enum and core model shapes:

```prisma
enum PaymentDirection {
  INCOME
  EXPENSE
}

enum FinanceApplicationType {
  EXPENSE
  REIMBURSEMENT
}

enum FinanceApprovalNode {
  MANAGER_REVIEW
  FINANCE_REVIEW
  PAYMENT
}

enum FinanceApprovalAction {
  SUBMITTED
  APPROVED
  REJECTED
  WITHDRAWN
  RESUBMITTED
  PAID
}

enum FinanceAttachmentCategory {
  INVOICE
  CONTRACT
  PAYMENT_PROOF
  OTHER
}
```

Add these exact fields to the existing models:

```prisma
// ExpenseApplication
applicationNo String               @unique
currentNode   FinanceApprovalNode?
submittedAt   DateTime?

// ReimbursementApplication
applicationNo    String               @unique
currentNode      FinanceApprovalNode?
submittedAt      DateTime?
payeeName        String?
payeeAccount     String?
paymentAccountId String?
paidAt           DateTime?
paymentRecordId  String?               @unique
exceptionReason  String?

// PaymentRecord
direction  PaymentDirection
occurredAt DateTime         @default(now())
```

Add the new models exactly as follows:

```prisma
model FinanceApprovalRecord {
  id              String                @id @default(cuid())
  storeId         String
  applicationType FinanceApplicationType
  applicationId   String
  node             FinanceApprovalNode
  action           FinanceApprovalAction
  operatorId       String
  note             String?
  createdAt        DateTime              @default(now())

  store    Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
  operator User  @relation(fields: [operatorId], references: [id])

  @@index([applicationType, applicationId, createdAt])
  @@index([storeId, createdAt])
  @@index([operatorId])
}

model FinanceAttachment {
  id              String                    @id @default(cuid())
  storeId         String
  applicationType FinanceApplicationType
  applicationId   String
  category        FinanceAttachmentCategory
  fileUrl         String
  fileName        String
  contentType     String
  fileSize        Int
  uploadedById    String
  createdAt       DateTime                  @default(now())

  store      Store @relation(fields: [storeId], references: [id], onDelete: Cascade)
  uploadedBy User  @relation(fields: [uploadedById], references: [id])

  @@index([applicationType, applicationId, createdAt])
  @@index([storeId, createdAt])
  @@index([uploadedById])
}
```

Add `financeApprovalRecords` and `financeAttachments` back-relations to `Store`, and named back-relations to `User`. Add optional relations from `ReimbursementApplication.paymentAccountId` to `PaymentAccount.id` and from `paymentRecordId` to `PaymentRecord.id`, with matching back-relations.

- [ ] **Step 4: Write a migration that preserves historical data**

The migration MUST:

```sql
CREATE TYPE "PaymentDirection" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "FinanceApplicationType" AS ENUM ('EXPENSE', 'REIMBURSEMENT');
CREATE TYPE "FinanceApprovalNode" AS ENUM ('MANAGER_REVIEW', 'FINANCE_REVIEW', 'PAYMENT');
CREATE TYPE "FinanceApprovalAction" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'RESUBMITTED', 'PAID');
CREATE TYPE "FinanceAttachmentCategory" AS ENUM ('INVOICE', 'CONTRACT', 'PAYMENT_PROOF', 'OTHER');

ALTER TABLE "ExpenseApplication" ADD COLUMN "applicationNo" TEXT;
ALTER TABLE "ReimbursementApplication" ADD COLUMN "applicationNo" TEXT;
ALTER TABLE "PaymentRecord" ADD COLUMN "direction" "PaymentDirection";
ALTER TABLE "PaymentRecord" ADD COLUMN "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "PaymentRecord"
SET "direction" = CASE
  WHEN "type" = 'ORDER_PAYMENT' THEN 'INCOME'::"PaymentDirection"
  WHEN "type" IN ('EXPENSE', 'REIMBURSEMENT', 'REBATE') THEN 'EXPENSE'::"PaymentDirection"
  WHEN "amountCents" < 0 THEN 'EXPENSE'::"PaymentDirection"
  ELSE 'INCOME'::"PaymentDirection"
END,
"amountCents" = ABS("amountCents");

ALTER TABLE "PaymentRecord" ALTER COLUMN "direction" SET NOT NULL;

UPDATE "ExpenseApplication"
SET "applicationNo" = 'FIN-EXP-HIS-' || UPPER("id");

UPDATE "ReimbursementApplication"
SET "applicationNo" = 'FIN-RMB-HIS-' || UPPER("id");

ALTER TABLE "ExpenseApplication" ALTER COLUMN "applicationNo" SET NOT NULL;
ALTER TABLE "ReimbursementApplication" ALTER COLUMN "applicationNo" SET NOT NULL;
CREATE UNIQUE INDEX "ExpenseApplication_applicationNo_key" ON "ExpenseApplication"("applicationNo");
CREATE UNIQUE INDEX "ReimbursementApplication_applicationNo_key" ON "ReimbursementApplication"("applicationNo");
```

The same migration must add the remaining columns, create both new tables with their indexes and foreign keys, and add the optional payment-account/payment-record foreign keys. Do not rewrite or delete existing finance rows.

- [ ] **Step 5: Add shared contracts**

Add to `packages/shared/src/index.ts`:

```ts
export type PaymentDirection = "INCOME" | "EXPENSE";
export type FinanceApplicationType = "EXPENSE" | "REIMBURSEMENT";
export type FinanceApprovalNode = "MANAGER_REVIEW" | "FINANCE_REVIEW" | "PAYMENT";
export type FinanceApprovalAction = "SUBMITTED" | "APPROVED" | "REJECTED" | "WITHDRAWN" | "RESUBMITTED" | "PAID";
export type FinanceAllowedAction =
  | "REVIEW_EXPENSE"
  | "WITHDRAW"
  | "RESUBMIT"
  | "CREATE_REIMBURSEMENT"
  | "REVIEW_REIMBURSEMENT"
  | "PAY"
  | "UPLOAD_ATTACHMENT";

export type PaginatedResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
};
```

Define detail types using these exact enum names and include `allowedActions: FinanceAllowedAction[]`.

- [ ] **Step 6: Generate Prisma and run tests**

Run:

```powershell
pnpm --filter @mallbay/api prisma:generate
pnpm --filter @mallbay/api test
pnpm typecheck
```

Expected: all commands exit 0.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/prisma packages/shared/src/index.ts apps/api/src/prisma/schema.test.ts
git commit -m "feat: add finance workflow persistence"
```

---

### Task 2: Separate Finance Permissions and Query Scopes

**Files:**
- Modify: `apps/api/src/common/policies/permission.policy.ts`
- Modify: `apps/api/src/common/policies/permission.policy.test.ts`
- Modify: `apps/api/src/finance/dto/finance.dto.ts`
- Create: `apps/api/src/finance/finance-query.service.ts`
- Create: `apps/api/src/finance/finance-query.service.test.ts`

**Interfaces:**
- Consumes: Prisma models and shared finance statuses from Task 1.
- Produces: `FinanceQueryService.listExpenses(actor, query)`, `listReimbursements(actor, query)`, `getExpenseDetail(actor, id)`, `getReimbursementDetail(actor, id)`, `getOverview(actor, storeId)`, `listPaymentRecords(actor, query)`.
- Produces: `ListFinanceApplicationsDto` with `scope`, `status`, `keyword`, `page`, `pageSize`.

- [ ] **Step 1: Write failing permission tests**

```ts
test("PermissionPolicy separates finance workflow responsibilities", () => {
  assert.equal(PermissionPolicy.canViewOwnFinanceApplication(purchasing, "store-1", "purchasing-1"), true);
  assert.equal(PermissionPolicy.canViewAllFinanceApplications(purchasing, "store-1"), false);
  assert.equal(PermissionPolicy.canReviewExpense(manager, "store-1"), true);
  assert.equal(PermissionPolicy.canReviewExpense(finance, "store-1"), false);
  assert.equal(PermissionPolicy.canReviewReimbursement(finance, "store-1"), true);
  assert.equal(PermissionPolicy.canPayReimbursement(manager, "store-1"), false);
  assert.equal(PermissionPolicy.canPayReimbursement(finance, "store-1"), true);
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```powershell
pnpm --filter @mallbay/api test
```

Expected: FAIL because the policy methods are missing.

- [ ] **Step 3: Implement explicit policy methods**

Use the existing admin and store membership helpers:

```ts
static canViewOwnFinanceApplication(user: UserWithStoreMember, storeId: string, applicantId: string) {
  return this.isAdmin(user) || (this.isStoreMember(user, storeId) && user.id === applicantId);
}

static canViewAllFinanceApplications(user: UserWithStoreMember, storeId: string) {
  return this.canManageFinance(user, storeId);
}

static canReviewExpense(user: UserWithStoreMember, storeId: string) {
  return this.isAdmin(user) || this.isStoreManager(user, storeId);
}

static canReviewReimbursement(user: UserWithStoreMember, storeId: string) {
  return this.isAdmin(user) || (this.isStoreMember(user, storeId) && user.storeMember?.position === StorePosition.FINANCE);
}

static canPayReimbursement(user: UserWithStoreMember, storeId: string) {
  return this.canReviewReimbursement(user, storeId);
}
```

- [ ] **Step 4: Write failing query scope tests**

Test that `scope=mine` adds `applicantId=actor.id`, purchasing cannot request `scope=all`, managers can request `scope=all`, and detail lookup rejects a different applicant.

```ts
assert.deepEqual(capturedWhere, { storeId: "store-1", applicantId: "purchasing-1" });
await assert.rejects(() => service.listExpenses(purchasing, { storeId: "store-1", scope: "all", page: 1, pageSize: 20 }), /无权限/);
```

- [ ] **Step 5: Implement paginated queries and overview**

Use `findMany` and `count` in `Promise.all`, cap `pageSize` at 100, and include applicant, approval records, attachments and linked reimbursement summaries. Return:

```ts
return { items, page, pageSize, total };
```

The overview returns real counts and month sums, with no demo fallback values.

- [ ] **Step 6: Run focused and full API tests**

```powershell
pnpm --filter @mallbay/api test
pnpm --filter @mallbay/api typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/api/src/common/policies apps/api/src/finance/dto apps/api/src/finance/finance-query.service.ts apps/api/src/finance/finance-query.service.test.ts
git commit -m "feat: scope finance queries by role"
```

---

### Task 3: Implement Expense Approval Workflow

**Files:**
- Create: `apps/api/src/finance/expense-workflow.service.ts`
- Create: `apps/api/src/finance/expense-workflow.service.test.ts`
- Modify: `apps/api/src/finance/finance.controller.ts`
- Modify: `apps/api/src/finance/finance.module.ts`
- Modify: `apps/api/src/finance/finance.service.ts`

**Interfaces:**
- Produces: `create(actor, dto)`, `review(actor, id, dto)`, `withdraw(actor, id, note)`, `resubmit(actor, id, dto)`.
- Review payload: `{ decision: "APPROVE" | "REJECT"; note?: string }`.

- [ ] **Step 1: Write failing state transition tests**

Cover create, manager approval, rejection, applicant withdrawal, rejected resubmission, and rejection of `PAID` on expenses.

```ts
await assert.rejects(
  () => service.review(finance, "expense-1", { decision: "APPROVE" }),
  /无权限/
);
await assert.rejects(
  () => service.withdraw(applicant, "approved-expense", "不再发生"),
  /只有待审批费用可以撤回/
);
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
pnpm --filter @mallbay/api test
```

Expected: FAIL because `ExpenseWorkflowService` does not exist.

- [ ] **Step 3: Implement transactional transitions**

Generate business numbers with `buildFinanceApplicationNo("EXPENSE", now)`: `FIN-EXP-${yyyyMMdd}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`. Rely on the unique index and retry the entire create transaction at most 3 times only for Prisma `P2002` on `applicationNo`. Every action writes `FinanceApprovalRecord` in the same transaction.

```ts
if (expense.status !== FinanceApprovalStatus.PENDING) {
  throw new ConflictException("只有待审批费用可以处理");
}
if (!PermissionPolicy.canReviewExpense(actor, expense.storeId)) {
  throw new ForbiddenException("无权限审批费用申请");
}
```

For approved expenses set `status=APPROVED`; rejected expenses set `status=REJECTED`; withdrawal sets `CANCELLED`; resubmission resets to `PENDING` and writes `RESUBMITTED`.

- [ ] **Step 4: Wire controller endpoints**

Add:

```ts
@Get("expenses/:id")
@Post("expenses/:id/review")
@Post("expenses/:id/withdraw")
@Post("expenses/:id/resubmit")
```

Keep existing `POST /finance/expenses` behavior but delegate to `ExpenseWorkflowService.create`.

- [ ] **Step 5: Run API tests and typecheck**

```powershell
pnpm --filter @mallbay/api test
pnpm --filter @mallbay/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/finance
git commit -m "feat: add expense approval workflow"
```

---

### Task 4: Split Reimbursement Review From Idempotent Payment

**Files:**
- Create: `apps/api/src/finance/reimbursement-workflow.service.ts`
- Create: `apps/api/src/finance/reimbursement-workflow.service.test.ts`
- Modify: `apps/api/src/finance/finance.controller.ts`
- Modify: `apps/api/src/finance/finance.module.ts`
- Modify: `apps/api/src/finance/finance.service.ts`

**Interfaces:**
- Produces: `create`, `review`, `pay`, `withdraw`, `resubmit`.
- Payment payload: `{ paymentAccountId: string; note?: string; paidAt?: string }`.
- Payment result: `{ reimbursement: ReimbursementApplication; paymentRecord: PaymentRecord; alreadyPaid: boolean }`.

- [ ] **Step 1: Write failing reimbursement tests**

Cover approved expense amount availability, exception reason, review without payment, payment with one expense-direction record, and repeated payment returning the existing record.

```ts
const first = await service.pay(finance, "reimbursement-1", { paymentAccountId: "account-1" });
const second = await service.pay(finance, "reimbursement-1", { paymentAccountId: "account-1" });
assert.equal(first.paymentRecord.id, second.paymentRecord.id);
assert.equal(second.alreadyPaid, true);
assert.equal(paymentRecordCreateCount, 1);
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
pnpm --filter @mallbay/api test
```

Expected: FAIL.

- [ ] **Step 3: Implement review and payment as separate transactions**

Review only changes `PENDING -> APPROVED/REJECTED`. Payment accepts only `APPROVED`, validates active same-store account, then runs:

```ts
return this.prisma.$transaction(async (tx) => {
  const current = await tx.reimbursementApplication.findUniqueOrThrow({ where: { id } });
  if (current.status === FinanceApprovalStatus.PAID && current.paymentRecordId) {
    return {
      reimbursement: current,
      paymentRecord: await tx.paymentRecord.findUniqueOrThrow({ where: { id: current.paymentRecordId } }),
      alreadyPaid: true
    };
  }
  if (current.status !== FinanceApprovalStatus.APPROVED) {
    throw new ConflictException("只有已审核报销可以付款");
  }
  const paymentRecord = await tx.paymentRecord.create({
    data: {
      storeId: current.storeId,
      accountId: dto.paymentAccountId,
      direction: PaymentDirection.EXPENSE,
      type: PaymentRecordType.REIMBURSEMENT,
      amountCents: current.amountCents,
      sourceId: current.id,
      note: dto.note ?? "报销付款",
      occurredAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
      createdById: actor.id
    }
  });
  const reimbursement = await tx.reimbursementApplication.update({
    where: { id: current.id },
    data: { status: FinanceApprovalStatus.PAID, paidAt: paymentRecord.occurredAt, paymentRecordId: paymentRecord.id }
  });
  return { reimbursement, paymentRecord, alreadyPaid: false };
});
```

- [ ] **Step 4: Add payment endpoint and remove `PAID` from review DTO**

Add `POST /finance/reimbursements/:id/pay`. `ReviewFinanceDto` accepts only `APPROVED | REJECTED`; the payment endpoint is the only business path to `PAID`.

- [ ] **Step 5: Run API tests**

```powershell
pnpm --filter @mallbay/api test
pnpm --filter @mallbay/api typecheck
```

Expected: PASS and no test creates a positive-direction reimbursement income.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/finance
git commit -m "feat: separate reimbursement payment"
```

---

### Task 5: Persist Finance Attachments and Approval History

**Files:**
- Create: `apps/api/src/finance/finance-attachments.service.ts`
- Create: `apps/api/src/finance/finance-attachments.service.test.ts`
- Modify: `apps/api/src/finance/finance.controller.ts`
- Modify: `apps/api/src/finance/finance.module.ts`
- Modify: `apps/api/src/oss/oss.service.ts`

**Interfaces:**
- Produces: `upload(actor, applicationType, applicationId, category, file)`.
- Returns: `FinanceAttachmentSummary` with persistent `fileUrl`.

- [ ] **Step 1: Write failing upload permission tests**

Test applicant upload to own pending/rejected application, reviewer access to same-store attachments, unrelated applicant rejection, and OSS URL persistence.

```ts
const attachment = await service.upload(applicant, "EXPENSE", "expense-1", "INVOICE", file);
assert.equal(attachment.fileUrl, "https://oss.example/finance/expense-1/invoice.pdf");
await assert.rejects(() => service.upload(otherApplicant, "EXPENSE", "expense-1", "OTHER", file), /无权限/);
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
pnpm --filter @mallbay/api test
```

Expected: FAIL.

- [ ] **Step 3: Add finance OSS namespace and attachment service**

Add `uploadFinanceAttachment(file, applicationId)` to `OssService`; use `finance/${applicationId}/${uuid}-${safeFileName}`. Set `FileInterceptor` limit to `10 * 1024 * 1024` bytes and accept only `application/pdf`, `image/jpeg`, `image/png`, and `image/webp`. Reject all other MIME types with `BadRequestException("仅支持 PDF、JPG、PNG 或 WebP 附件")`.

- [ ] **Step 4: Add multipart endpoints**

Add:

```ts
@Post("expenses/:id/attachments")
@Post("reimbursements/:id/attachments")
```

Use `FileInterceptor("file")`; require `category` in form data; return the persisted attachment record.

- [ ] **Step 5: Run attachment and OSS tests**

```powershell
pnpm --filter @mallbay/api test
pnpm --filter @mallbay/api typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add apps/api/src/finance apps/api/src/oss
git commit -m "feat: persist finance attachments"
```

---

### Task 6: Add Web Finance Contracts, Routes, and Shared Components

**Files:**
- Modify: `apps/web/src/features/finance/api.ts`
- Modify: `apps/web/src/features/finance/api.test.ts`
- Modify: `apps/web/src/features/finance/display.ts`
- Modify: `apps/web/src/features/finance/display.test.ts`
- Create: `apps/web/src/features/finance/routes.ts`
- Create: `apps/web/src/features/finance/components/finance-application-table.tsx`
- Create: `apps/web/src/features/finance/components/finance-attachment-upload.tsx`
- Create: `apps/web/src/features/finance/components/finance-approval-timeline.tsx`

**Interfaces:**
- Consumes: shared contracts from Task 1 and API endpoints from Tasks 2-5.
- Produces: `financeRoutes`, `FinanceApplicationTable`, `FinanceAttachmentUpload`, `FinanceApprovalTimeline`.

- [ ] **Step 1: Write failing API client tests**

```ts
await financeApi.expenses({ storeId: "store-1", scope: "mine", page: 2, pageSize: 20 });
assert.equal(lastRequest.url, "/finance/expenses?storeId=store-1&scope=mine&page=2&pageSize=20");

await financeApi.payReimbursement("rmb-1", { paymentAccountId: "account-1" });
assert.equal(lastRequest.url, "/finance/reimbursements/rmb-1/pay");
```

Also test detail, review, withdraw, resubmit, overview and multipart attachment paths.

- [ ] **Step 2: Run Web tests and confirm failure**

```powershell
pnpm --filter @mallbay/web test
```

Expected: FAIL.

- [ ] **Step 3: Implement API client and display helpers**

Expose object-based list queries and these exact helpers:

```ts
getFinanceApprovalNodeLabel(node)
getPaymentDirectionLabel(direction)
getFinanceAllowedActions(detail)
getFinanceApplicationStatusTone(status)
```

- [ ] **Step 4: Write component tests**

Test that the table renders business number, applicant, amount, node and state; attachment upload supports multiple persisted files; timeline renders API records rather than static steps.

- [ ] **Step 5: Implement focused shared components**

`FinanceApplicationTable` accepts rows, loading, pagination and `onOpen`; it must not contain create or review forms. `FinanceAttachmentUpload` owns upload progress and retry per file. `FinanceApprovalTimeline` accepts only `FinanceApprovalRecordSummary[]`.

- [ ] **Step 6: Run Web tests and typecheck**

```powershell
pnpm --filter @mallbay/web test
pnpm --filter @mallbay/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/features/finance
git commit -m "feat: add finance workflow web contracts"
```

---

### Task 7: Rebuild Finance Overview and Expense Workspace

**Files:**
- Rewrite: `apps/web/app/finance/page.tsx`
- Create: `apps/web/app/finance/expenses/page.tsx`
- Create: `apps/web/app/finance/expenses/[id]/page.tsx`
- Create: `apps/web/src/features/finance/expense-page.test.ts`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: `financeApi.overview`, expense APIs, shared components and `allowedActions`.
- Produces routes `/finance`, `/finance/expenses`, `/finance/expenses/:id`.

- [ ] **Step 1: Write failing page structure tests**

```ts
assert.doesNotMatch(overviewSource, /新建费用申请[\s\S]*<Form/);
assert.match(overviewSource, /待我审批/);
assert.match(overviewSource, /待付款/);
assert.match(expensesSource, /费用申请列表/);
assert.match(expensesSource, /我的申请/);
assert.match(expensesSource, /新建费用申请/);
assert.match(detailSource, /审批记录/);
assert.match(detailSource, /关联报销/);
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
pnpm --filter @mallbay/web test
```

Expected: FAIL because the routes do not exist and the overview still contains forms.

- [ ] **Step 3: Build the data-driven overview**

Render four KPI items from `financeApi.overview`; render three queue tabs using real counts; route queue rows to expense or reimbursement detail. Keep only `新建申请` and `导出流水` in the command bar.

- [ ] **Step 4: Build expense list and creation drawer**

Use URL search params for scope, status, keyword, page and pageSize. On create success:

```ts
message.success("费用申请已提交");
router.push(`/finance/expenses/${created.id}`);
```

The page first viewport must show filters and list, not the form.

- [ ] **Step 5: Build expense detail and role actions**

Render `allowedActions`; only mount review, withdraw, resubmit or create-reimbursement controls when allowed. Use `FinanceApprovalTimeline` and `FinanceAttachmentUpload`.

- [ ] **Step 6: Add responsive CSS**

Use existing `management-page`, 8px-or-less card radius, stable table width and mobile cards. At `max-width: 900px`, use full-width drawers and one-column detail layout.

- [ ] **Step 7: Run focused Web tests**

```powershell
pnpm --filter @mallbay/web test
pnpm --filter @mallbay/web typecheck
```

Expected: PASS.

- [ ] **Step 8: Commit**

```powershell
git add apps/web/app/finance apps/web/src/features/finance/expense-page.test.ts apps/web/app/globals.css
git commit -m "feat: rebuild finance expense workspace"
```

---

### Task 8: Build Reimbursement Review and Payment Workspace

**Files:**
- Create: `apps/web/app/finance/reimbursements/page.tsx`
- Create: `apps/web/app/finance/reimbursements/[id]/page.tsx`
- Create: `apps/web/src/features/finance/reimbursement-page.test.ts`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: reimbursement list/detail/review/pay APIs and payment account options.
- Produces routes `/finance/reimbursements` and `/finance/reimbursements/:id`.

- [ ] **Step 1: Write failing route and state tests**

```ts
assert.match(listSource, /我的报销/);
assert.match(listSource, /待审核/);
assert.match(listSource, /待付款/);
assert.match(detailSource, /financeApi\.reviewReimbursement/);
assert.match(detailSource, /financeApi\.payReimbursement/);
assert.doesNotMatch(detailSource, /value: "PAID"[\s\S]*审批结果/);
```

Test that payment controls appear only for `APPROVED` with `PAY` in `allowedActions`, and paid detail links to the payment record.

- [ ] **Step 2: Run tests and confirm failure**

```powershell
pnpm --filter @mallbay/web test
```

Expected: FAIL.

- [ ] **Step 3: Build reimbursement list and creation drawer**

The list uses status presets and URL filters. The create drawer requires either an approved `expenseId` or a non-empty `exceptionReason`; show approved amount, occupied amount and remaining amount when an expense is selected.

- [ ] **Step 4: Build mutually exclusive detail workspaces**

- `PENDING`: finance review form.
- `APPROVED`: payment account selector, payment date, payment note and `确认付款`.
- `REJECTED`: applicant resubmission controls.
- `PAID`: read-only payment summary and link to `/finance/payment-records/:id`.
- `CANCELLED`: read-only cancellation summary.

- [ ] **Step 5: Prevent repeated UI actions**

Disable mutation buttons while pending; after payment success replace action area with the returned payment summary and invalidate overview, reimbursement and ledger queries.

- [ ] **Step 6: Run focused tests and typecheck**

```powershell
pnpm --filter @mallbay/web test
pnpm --filter @mallbay/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/app/finance/reimbursements apps/web/src/features/finance/reimbursement-page.test.ts apps/web/app/globals.css
git commit -m "feat: add reimbursement payment workspace"
```

---

### Task 9: Extract Account and Ledger Workspaces

**Files:**
- Create: `apps/web/app/finance/accounts/page.tsx`
- Create: `apps/web/app/finance/ledger/page.tsx`
- Modify: `apps/web/app/finance/payment-records/[id]/page.tsx`
- Create: `apps/web/src/features/finance/account-ledger-page.test.ts`
- Modify: `apps/web/app/globals.css`

**Interfaces:**
- Consumes: payment account APIs, payment record pagination and direction filters.
- Produces routes `/finance/accounts`, `/finance/ledger`, and return navigation from payment detail.

- [ ] **Step 1: Write failing route tests**

```ts
assert.match(accountsSource, /收款账户列表/);
assert.match(accountsSource, /新增账户/);
assert.match(ledgerSource, /收入/);
assert.match(ledgerSource, /支出/);
assert.match(ledgerSource, /direction/);
assert.doesNotMatch(ledgerSource, /费用 \/ 报销单据/);
assert.match(detailSource, /router\.push\("\/finance\/ledger"\)/);
```

- [ ] **Step 2: Run tests and confirm failure**

```powershell
pnpm --filter @mallbay/web test
```

Expected: FAIL.

- [ ] **Step 3: Move account maintenance to list plus drawer**

Preserve create, edit, disable, default account and audit behavior. Replace the always-visible form with a drawer. Stop event propagation on row action buttons.

- [ ] **Step 4: Build direction-based ledger filtering**

Use API query fields `direction`, `type`, `accountId`, `dateFrom`, `dateTo`, `page`, `pageSize`. Do not infer direction from `amountCents`.

- [ ] **Step 5: Update payment detail navigation**

Return to `/finance/ledger` with filters preserved in query parameters when available.

- [ ] **Step 6: Run tests and typecheck**

```powershell
pnpm --filter @mallbay/web test
pnpm --filter @mallbay/web typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/app/finance apps/web/src/features/finance/account-ledger-page.test.ts apps/web/app/globals.css
git commit -m "feat: separate account and ledger workspaces"
```

---

### Task 10: Complete Regression, Migration, and Business Acceptance

**Files:**
- Modify: `docs/features/phase-5-finance-invoice-rebate-report-plan.md`
- Create: `docs/qa/finance-workflow-checklist.md`
- Modify: `.github/workflows/deploy.yml` only if migration verification is not already enforced by the API entrypoint.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: deployment and manual acceptance evidence.

- [ ] **Step 1: Add an API integration flow test**

Add a test that creates a purchasing applicant, submits an expense, approves it as manager, creates reimbursement, approves and pays as finance, refreshes each detail, and verifies one `EXPENSE` direction payment record.

```ts
assert.equal(reimbursement.status, "PAID");
assert.equal(records.filter((record) => record.sourceId === reimbursement.id).length, 1);
assert.equal(records[0].direction, "EXPENSE");
```

- [ ] **Step 2: Run complete verification**

```powershell
pnpm --filter @mallbay/api test
pnpm --filter @mallbay/api test:flow
pnpm --filter @mallbay/web test
pnpm typecheck
pnpm build
```

Expected: API 0 failures, flow 0 failures, Web 0 failures, typecheck 0 errors, build exit 0.

- [ ] **Step 3: Verify migration on disposable database**

Run against a disposable PostgreSQL database containing pre-migration finance rows:

```powershell
pnpm --filter @mallbay/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @mallbay/api db:preflight
```

Expected: migration succeeds, historical rows retain amounts, all payment records have non-null direction, and database invariant preflight exits 0.

- [ ] **Step 4: Write the manual acceptance checklist**

`docs/qa/finance-workflow-checklist.md` MUST record:

- expense application number
- applicant and role
- manager review result
- reimbursement application number
- attachment preview result
- finance review result
- payment account
- payment record number
- duplicate payment result
- refresh persistence result
- role-specific action visibility

- [ ] **Step 5: Update Phase 5 documentation**

Replace the old one-step reimbursement wording with the approved design: expense pre-approval, reimbursement finance review, separate payment and direction-based ledger.

- [ ] **Step 6: Run final placeholder and status checks**

```powershell
rg -n "T[B]D|T[O]DO|implement la[t]er|待补[充]" docs/superpowers/specs/2026-07-13-finance-workflow-redesign.md docs/superpowers/plans/2026-07-13-finance-workflow-redesign.md docs/qa/finance-workflow-checklist.md
git status --short
```

Expected: no placeholders; only intended source, migration, test and documentation files are changed.

- [ ] **Step 7: Commit final verification artifacts**

```powershell
git add apps/api/src/flows docs/features/phase-5-finance-invoice-rebate-report-plan.md docs/qa/finance-workflow-checklist.md .github/workflows/deploy.yml
git commit -m "test: verify finance workflow closure"
```

---

## Final Acceptance Criteria

- 申请人提交费用后刷新页面，仍能在“我的申请”查看详情和状态。
- 店长审批费用后不生成资金流水。
- 财务审核报销后状态为待付款，仍不生成资金流水。
- 财务确认付款后状态为已付款，并生成且只生成一条 `EXPENSE` 流水。
- 重复点击审批、付款、撤回或重新提交不会产生重复记录。
- 附件上传后可预览，刷新后仍从持久 URL 加载。
- 费用、报销、账户和流水各自拥有清晰的列表与操作入口。
- 店长、财务、申请人和管理员只看到自己的操作。
- 生产启动执行迁移和数据库不变量预检。
- API、流程、Web、类型检查和生产构建全部通过。
