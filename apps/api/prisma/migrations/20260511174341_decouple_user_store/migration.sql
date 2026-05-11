-- CreateEnum
CREATE TYPE "StoreMemberRole" AS ENUM ('OWNER', 'MANAGER', 'STAFF');

-- Create the new member relation before removing the old direct User -> Store link.
CREATE TABLE "StoreMember" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "StoreMemberRole" NOT NULL DEFAULT 'STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreMember_pkey" PRIMARY KEY ("id")
);

INSERT INTO "StoreMember" ("id", "storeId", "userId", "role", "createdAt", "updatedAt")
SELECT
    'member_' || "User"."id",
    "User"."storeId",
    "User"."id",
    CASE
        WHEN "User"."role"::text = 'OWNER' THEN 'OWNER'::"StoreMemberRole"
        WHEN "User"."role"::text = 'MANAGER' THEN 'MANAGER'::"StoreMemberRole"
        ELSE 'STAFF'::"StoreMemberRole"
    END,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";

-- Store ownership is now metadata, while staff authority lives in StoreMember.
ALTER TABLE "Store" ADD COLUMN "createdById" TEXT;

UPDATE "Store"
SET "createdById" = "User"."id"
FROM "User"
WHERE "User"."storeId" = "Store"."id"
  AND "User"."role"::text = 'OWNER';

-- User.role now describes the account-level default perspective.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE TEXT USING 'CUSTOMER';
DROP TYPE "UserRole";
CREATE TYPE "UserRole" AS ENUM ('CUSTOMER', 'STAFF');
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING "role"::"UserRole";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'CUSTOMER';

ALTER TABLE "User" DROP CONSTRAINT "User_storeId_fkey";
DROP INDEX "User_storeId_idx";
ALTER TABLE "User" DROP COLUMN "storeId";

CREATE UNIQUE INDEX "StoreMember_storeId_userId_key" ON "StoreMember"("storeId", "userId");
CREATE INDEX "StoreMember_userId_idx" ON "StoreMember"("userId");
CREATE INDEX "Store_createdById_idx" ON "Store"("createdById");

ALTER TABLE "Store" ADD CONSTRAINT "Store_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StoreMember" ADD CONSTRAINT "StoreMember_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StoreMember" ADD CONSTRAINT "StoreMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
