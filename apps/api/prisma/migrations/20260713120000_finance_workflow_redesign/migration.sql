-- Finance workflow redesign: preserve existing applications and cash records.
CREATE TYPE "PaymentDirection" AS ENUM ('INCOME', 'EXPENSE');
CREATE TYPE "FinanceApplicationType" AS ENUM ('EXPENSE', 'REIMBURSEMENT');
CREATE TYPE "FinanceApprovalNode" AS ENUM ('MANAGER_REVIEW', 'FINANCE_REVIEW', 'PAYMENT');
CREATE TYPE "FinanceApprovalAction" AS ENUM ('SUBMITTED', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'RESUBMITTED', 'PAID');
CREATE TYPE "FinanceAttachmentCategory" AS ENUM ('INVOICE', 'CONTRACT', 'PAYMENT_PROOF', 'OTHER');

ALTER TABLE "ExpenseApplication" ADD COLUMN "applicationNo" TEXT;
ALTER TABLE "ReimbursementApplication" ADD COLUMN "applicationNo" TEXT;
ALTER TABLE "PaymentRecord" ADD COLUMN "direction" "PaymentDirection";
ALTER TABLE "PaymentRecord" ADD COLUMN "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "ExpenseApplication"
SET "applicationNo" = 'FIN-EXP-HIS-' || UPPER("id")
WHERE "applicationNo" IS NULL;

UPDATE "ReimbursementApplication"
SET "applicationNo" = 'FIN-RMB-HIS-' || UPPER("id")
WHERE "applicationNo" IS NULL;

UPDATE "PaymentRecord"
SET "direction" = CASE
  WHEN "type" = 'ORDER_PAYMENT' THEN 'INCOME'::"PaymentDirection"
  WHEN "type" IN ('EXPENSE', 'REIMBURSEMENT', 'REBATE') THEN 'EXPENSE'::"PaymentDirection"
  WHEN "amountCents" < 0 THEN 'EXPENSE'::"PaymentDirection"
  ELSE 'INCOME'::"PaymentDirection"
END,
"amountCents" = ABS("amountCents");

ALTER TABLE "ExpenseApplication" ALTER COLUMN "applicationNo" SET NOT NULL;
ALTER TABLE "ReimbursementApplication" ALTER COLUMN "applicationNo" SET NOT NULL;
ALTER TABLE "PaymentRecord" ALTER COLUMN "direction" SET NOT NULL;

CREATE UNIQUE INDEX "ExpenseApplication_applicationNo_key" ON "ExpenseApplication"("applicationNo");
CREATE UNIQUE INDEX "ReimbursementApplication_applicationNo_key" ON "ReimbursementApplication"("applicationNo");

CREATE UNIQUE INDEX "PaymentRecord_type_sourceId_key"
  ON "PaymentRecord"("type", "sourceId");

ALTER TABLE "ExpenseApplication"
  ADD COLUMN "currentNode" "FinanceApprovalNode",
  ADD COLUMN "submittedAt" TIMESTAMP(3);

ALTER TABLE "ReimbursementApplication"
  ADD COLUMN "currentNode" "FinanceApprovalNode",
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "payeeName" TEXT,
  ADD COLUMN "payeeAccount" TEXT,
  ADD COLUMN "paymentAccountId" TEXT,
  ADD COLUMN "paidAt" TIMESTAMP(3),
  ADD COLUMN "paymentRecordId" TEXT,
  ADD COLUMN "exceptionReason" TEXT;

CREATE UNIQUE INDEX "ReimbursementApplication_paymentRecordId_key"
  ON "ReimbursementApplication"("paymentRecordId");
CREATE INDEX "ReimbursementApplication_paymentAccountId_idx"
  ON "ReimbursementApplication"("paymentAccountId");

CREATE TABLE "FinanceApprovalRecord" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "applicationType" "FinanceApplicationType" NOT NULL,
  "applicationId" TEXT NOT NULL,
  "node" "FinanceApprovalNode" NOT NULL,
  "action" "FinanceApprovalAction" NOT NULL,
  "operatorId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceApprovalRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FinanceAttachment" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "applicationType" "FinanceApplicationType" NOT NULL,
  "applicationId" TEXT NOT NULL,
  "category" "FinanceAttachmentCategory" NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FinanceApprovalRecord_applicationType_applicationId_createdAt_idx"
  ON "FinanceApprovalRecord"("applicationType", "applicationId", "createdAt");
CREATE INDEX "FinanceApprovalRecord_storeId_createdAt_idx"
  ON "FinanceApprovalRecord"("storeId", "createdAt");
CREATE INDEX "FinanceApprovalRecord_operatorId_idx"
  ON "FinanceApprovalRecord"("operatorId");
CREATE INDEX "FinanceAttachment_applicationType_applicationId_createdAt_idx"
  ON "FinanceAttachment"("applicationType", "applicationId", "createdAt");
CREATE INDEX "FinanceAttachment_storeId_createdAt_idx"
  ON "FinanceAttachment"("storeId", "createdAt");
CREATE INDEX "FinanceAttachment_uploadedById_idx"
  ON "FinanceAttachment"("uploadedById");

ALTER TABLE "ReimbursementApplication"
  ADD CONSTRAINT "ReimbursementApplication_paymentAccountId_fkey"
  FOREIGN KEY ("paymentAccountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReimbursementApplication"
  ADD CONSTRAINT "ReimbursementApplication_paymentRecordId_fkey"
  FOREIGN KEY ("paymentRecordId") REFERENCES "PaymentRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FinanceApprovalRecord"
  ADD CONSTRAINT "FinanceApprovalRecord_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceApprovalRecord"
  ADD CONSTRAINT "FinanceApprovalRecord_operatorId_fkey"
  FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FinanceAttachment"
  ADD CONSTRAINT "FinanceAttachment_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FinanceAttachment"
  ADD CONSTRAINT "FinanceAttachment_uploadedById_fkey"
  FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
