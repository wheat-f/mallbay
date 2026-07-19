-- 请假申请：类型、审批留痕与通知。
ALTER TABLE "LeaveRequest"
  ADD COLUMN "leaveType" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNote" TEXT;

ALTER TABLE "LeaveRequest"
  ADD CONSTRAINT "LeaveRequest_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAVE_APPROVAL_REQUIRED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAVE_APPROVED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LEAVE_REJECTED';

-- 已存在的“年假”历史记录保留原事由，但归入“其他”类型；新申请不再提供年假。
UPDATE "LeaveRequest"
SET "leaveType" = CASE
  WHEN "reason" LIKE '事假:%' THEN 'PERSONAL'
  WHEN "reason" LIKE '病假:%' THEN 'SICK'
  WHEN "reason" LIKE '年假:%' THEN 'OTHER'
  WHEN "reason" LIKE '调休:%' THEN 'COMP_TIME'
  ELSE 'OTHER'
END
WHERE "leaveType" IS NULL;

UPDATE "Dictionary"
SET "items" = '["事假", "病假", "调休", "其他"]'::jsonb
WHERE "code" = 'LEAVE_TYPE';

INSERT INTO "DictionaryItem" ("id", "dictionaryId", "code", "name", "sortOrder", "status", "isSystem", "updatedAt")
SELECT 'leave-type-comp-time-' || dictionary.id, dictionary.id, 'COMP_TIME', '调休', 2, 'ACTIVE', false, CURRENT_TIMESTAMP
FROM "Dictionary" AS dictionary
WHERE dictionary."code" = 'LEAVE_TYPE'
ON CONFLICT ("dictionaryId", "code") DO UPDATE
SET "name" = EXCLUDED."name", "sortOrder" = EXCLUDED."sortOrder", "status" = 'ACTIVE', "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "DictionaryItem" AS item
SET "status" = 'INACTIVE'
FROM "Dictionary" AS dictionary
WHERE item."dictionaryId" = dictionary.id
  AND dictionary.code = 'LEAVE_TYPE'
  AND item.name = '年假';
