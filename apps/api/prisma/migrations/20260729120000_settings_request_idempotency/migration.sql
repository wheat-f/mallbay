ALTER TABLE "SettingsConfigVersion" ADD COLUMN IF NOT EXISTS "requestId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "SettingsConfigVersion_createdById_requestId_key" ON "SettingsConfigVersion"("createdById", "requestId");
