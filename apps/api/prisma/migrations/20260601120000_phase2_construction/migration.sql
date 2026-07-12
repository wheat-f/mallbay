-- CreateEnum
CREATE TYPE "ConstructionTaskStatus" AS ENUM ('DISPATCHED', 'IN_CONSTRUCTION', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ConstructionPhotoStage" AS ENUM ('BEFORE', 'DURING', 'AFTER');

-- CreateEnum
CREATE TYPE "QualityCheckResult" AS ENUM ('PASS', 'REWORK_REQUIRED');

-- CreateEnum
CREATE TYPE "WorkerSkillTag" AS ENUM ('PPF', 'COLOR_FILM', 'HEAT_FILM', 'MODIFICATION', 'INSPECTION', 'OUTSIDE');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('WORKING', 'REST', 'OUTSIDE');

-- CreateTable
CREATE TABLE "DailyCapacity" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "inStoreCapacity" INTEGER NOT NULL DEFAULT 0,
    "inStoreReserved" INTEGER NOT NULL DEFAULT 0,
    "outsideCapacity" INTEGER NOT NULL DEFAULT 0,
    "outsideReserved" INTEGER NOT NULL DEFAULT 0,
    "heatFilmCapacity" INTEGER NOT NULL DEFAULT 0,
    "heatFilmReserved" INTEGER NOT NULL DEFAULT 0,
    "inspectionCapacity" INTEGER NOT NULL DEFAULT 0,
    "inspectionReserved" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyCapacity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionWorkerProfile" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canWorkOutside" BOOLEAN NOT NULL DEFAULT false,
    "skillTags" "WorkerSkillTag"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionWorkerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionRecord" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "ConstructionTaskStatus" NOT NULL DEFAULT 'DISPATCHED',
    "dispatchedById" TEXT NOT NULL,
    "dispatchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "actualMinutes" INTEGER,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "qualityResult" "QualityCheckResult",
    "qualityNote" TEXT,
    "qualityCheckedById" TEXT,
    "qualityCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConstructionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionAssignment" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "workerUserId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructionAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConstructionPhoto" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "stage" "ConstructionPhotoStage" NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "takenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConstructionPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Schedule" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'WORKING',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Schedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkerCommissionSnapshot" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "workerUserId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "calculationNote" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkerCommissionSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyCapacity_storeId_idx" ON "DailyCapacity"("storeId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyCapacity_storeId_date_key" ON "DailyCapacity"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionWorkerProfile_userId_key" ON "ConstructionWorkerProfile"("userId");

-- CreateIndex
CREATE INDEX "ConstructionWorkerProfile_storeId_isActive_idx" ON "ConstructionWorkerProfile"("storeId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionRecord_orderId_key" ON "ConstructionRecord"("orderId");

-- CreateIndex
CREATE INDEX "ConstructionRecord_storeId_status_idx" ON "ConstructionRecord"("storeId", "status");

-- CreateIndex
CREATE INDEX "ConstructionRecord_dispatchedById_idx" ON "ConstructionRecord"("dispatchedById");

-- CreateIndex
CREATE INDEX "ConstructionAssignment_recordId_idx" ON "ConstructionAssignment"("recordId");

-- CreateIndex
CREATE INDEX "ConstructionAssignment_workerUserId_idx" ON "ConstructionAssignment"("workerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "ConstructionAssignment_orderId_workerUserId_key" ON "ConstructionAssignment"("orderId", "workerUserId");

-- CreateIndex
CREATE INDEX "ConstructionPhoto_recordId_stage_idx" ON "ConstructionPhoto"("recordId", "stage");

-- CreateIndex
CREATE INDEX "ConstructionPhoto_uploadedById_idx" ON "ConstructionPhoto"("uploadedById");

-- CreateIndex
CREATE INDEX "LeaveRequest_storeId_startDate_endDate_idx" ON "LeaveRequest"("storeId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_workerId_status_idx" ON "LeaveRequest"("workerId", "status");

-- CreateIndex
CREATE INDEX "Schedule_storeId_date_idx" ON "Schedule"("storeId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "Schedule_workerId_date_key" ON "Schedule"("workerId", "date");

-- CreateIndex
CREATE INDEX "WorkerCommissionSnapshot_orderId_idx" ON "WorkerCommissionSnapshot"("orderId");

-- CreateIndex
CREATE INDEX "WorkerCommissionSnapshot_workerUserId_idx" ON "WorkerCommissionSnapshot"("workerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkerCommissionSnapshot_recordId_workerUserId_key" ON "WorkerCommissionSnapshot"("recordId", "workerUserId");

-- AddForeignKey
ALTER TABLE "DailyCapacity" ADD CONSTRAINT "DailyCapacity_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionWorkerProfile" ADD CONSTRAINT "ConstructionWorkerProfile_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionWorkerProfile" ADD CONSTRAINT "ConstructionWorkerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionRecord" ADD CONSTRAINT "ConstructionRecord_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionRecord" ADD CONSTRAINT "ConstructionRecord_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionRecord" ADD CONSTRAINT "ConstructionRecord_dispatchedById_fkey" FOREIGN KEY ("dispatchedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionRecord" ADD CONSTRAINT "ConstructionRecord_qualityCheckedById_fkey" FOREIGN KEY ("qualityCheckedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionAssignment" ADD CONSTRAINT "ConstructionAssignment_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ConstructionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionAssignment" ADD CONSTRAINT "ConstructionAssignment_workerUserId_fkey" FOREIGN KEY ("workerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionPhoto" ADD CONSTRAINT "ConstructionPhoto_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ConstructionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConstructionPhoto" ADD CONSTRAINT "ConstructionPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Schedule" ADD CONSTRAINT "Schedule_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCommissionSnapshot" ADD CONSTRAINT "WorkerCommissionSnapshot_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ConstructionRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCommissionSnapshot" ADD CONSTRAINT "WorkerCommissionSnapshot_workerUserId_fkey" FOREIGN KEY ("workerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkerCommissionSnapshot" ADD CONSTRAINT "WorkerCommissionSnapshot_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
