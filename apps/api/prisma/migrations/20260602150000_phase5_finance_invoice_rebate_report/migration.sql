-- CreateEnum
CREATE TYPE "FinanceApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentRecordType" AS ENUM ('ORDER_PAYMENT', 'EXPENSE', 'REIMBURSEMENT', 'REBATE', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('APPLIED', 'ISSUED', 'VOIDED', 'REISSUED');

-- CreateEnum
CREATE TYPE "RebateStatus" AS ENUM ('APPLIED', 'APPROVED', 'REJECTED', 'PAID');

-- CreateTable
CREATE TABLE "ExpenseApplication" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "FinanceApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReimbursementApplication" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "applicantId" TEXT NOT NULL,
    "expenseId" TEXT,
    "title" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "FinanceApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReimbursementApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "accountId" TEXT,
    "type" "PaymentRecordType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "sourceId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "taxNo" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'APPLIED',
    "invoiceNo" TEXT,
    "appliedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceLog" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerRebate" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "RebateStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRebate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RebateLog" (
    "id" TEXT NOT NULL,
    "rebateId" TEXT NOT NULL,
    "status" "RebateStatus" NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RebateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExpenseApplication_storeId_status_idx" ON "ExpenseApplication"("storeId", "status");

-- CreateIndex
CREATE INDEX "ExpenseApplication_applicantId_idx" ON "ExpenseApplication"("applicantId");

-- CreateIndex
CREATE INDEX "ReimbursementApplication_storeId_status_idx" ON "ReimbursementApplication"("storeId", "status");

-- CreateIndex
CREATE INDEX "ReimbursementApplication_applicantId_idx" ON "ReimbursementApplication"("applicantId");

-- CreateIndex
CREATE INDEX "ReimbursementApplication_expenseId_idx" ON "ReimbursementApplication"("expenseId");

-- CreateIndex
CREATE INDEX "PaymentRecord_storeId_type_idx" ON "PaymentRecord"("storeId", "type");

-- CreateIndex
CREATE INDEX "PaymentRecord_sourceId_idx" ON "PaymentRecord"("sourceId");

-- CreateIndex
CREATE INDEX "PaymentRecord_createdById_idx" ON "PaymentRecord"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");

-- CreateIndex
CREATE INDEX "Invoice_storeId_status_idx" ON "Invoice"("storeId", "status");

-- CreateIndex
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");

-- CreateIndex
CREATE INDEX "InvoiceLog_invoiceId_idx" ON "InvoiceLog"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceLog_createdById_idx" ON "InvoiceLog"("createdById");

-- CreateIndex
CREATE INDEX "CustomerRebate_storeId_status_idx" ON "CustomerRebate"("storeId", "status");

-- CreateIndex
CREATE INDEX "CustomerRebate_orderId_idx" ON "CustomerRebate"("orderId");

-- CreateIndex
CREATE INDEX "RebateLog_rebateId_idx" ON "RebateLog"("rebateId");

-- CreateIndex
CREATE INDEX "RebateLog_createdById_idx" ON "RebateLog"("createdById");

-- AddForeignKey
ALTER TABLE "ExpenseApplication" ADD CONSTRAINT "ExpenseApplication_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApplication" ADD CONSTRAINT "ExpenseApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseApplication" ADD CONSTRAINT "ExpenseApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementApplication" ADD CONSTRAINT "ReimbursementApplication_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementApplication" ADD CONSTRAINT "ReimbursementApplication_applicantId_fkey" FOREIGN KEY ("applicantId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementApplication" ADD CONSTRAINT "ReimbursementApplication_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "ExpenseApplication"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReimbursementApplication" ADD CONSTRAINT "ReimbursementApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PaymentAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLog" ADD CONSTRAINT "InvoiceLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceLog" ADD CONSTRAINT "InvoiceLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRebate" ADD CONSTRAINT "CustomerRebate_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRebate" ADD CONSTRAINT "CustomerRebate_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerRebate" ADD CONSTRAINT "CustomerRebate_appliedById_fkey" FOREIGN KEY ("appliedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateLog" ADD CONSTRAINT "RebateLog_rebateId_fkey" FOREIGN KEY ("rebateId") REFERENCES "CustomerRebate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RebateLog" ADD CONSTRAINT "RebateLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
