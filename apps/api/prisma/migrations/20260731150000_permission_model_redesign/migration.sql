CREATE TYPE "PermissionRoleType" AS ENUM ('SYSTEM', 'CUSTOM');
CREATE TYPE "PermissionRoleStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "PermissionPolicyVersionStatus" AS ENUM ('DRAFT', 'VALIDATED', 'PUBLISHED', 'ROLLED_BACK', 'VALIDATION_FAILED');
CREATE TYPE "PermissionBindingStatus" AS ENUM ('ACTIVE', 'DISABLED');
CREATE TYPE "PermissionScopeType" AS ENUM ('HQ', 'STORE');

CREATE TABLE "PermissionDefinition" ("code" TEXT NOT NULL,"name" TEXT NOT NULL,"resource" TEXT NOT NULL,"actions" TEXT[] NOT NULL,"supportedScopes" TEXT[] NOT NULL,"status" TEXT NOT NULL DEFAULT 'ACTIVE',"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "PermissionDefinition_pkey" PRIMARY KEY ("code"));
CREATE INDEX "PermissionDefinition_resource_status_idx" ON "PermissionDefinition"("resource", "status");

CREATE TABLE "PermissionRole" ("id" TEXT NOT NULL,"code" TEXT NOT NULL,"name" TEXT NOT NULL,"description" TEXT,"type" "PermissionRoleType" NOT NULL DEFAULT 'CUSTOM',"status" "PermissionRoleStatus" NOT NULL DEFAULT 'ACTIVE',"createdById" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "PermissionRole_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PermissionRole_code_key" ON "PermissionRole"("code");
CREATE INDEX "PermissionRole_status_type_idx" ON "PermissionRole"("status", "type");

CREATE TABLE "PermissionRoleGrant" ("id" TEXT NOT NULL,"roleId" TEXT NOT NULL,"permissionCode" TEXT NOT NULL,"action" TEXT NOT NULL,"scope" TEXT NOT NULL,CONSTRAINT "PermissionRoleGrant_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PermissionRoleGrant_roleId_permissionCode_action_scope_key" ON "PermissionRoleGrant"("roleId", "permissionCode", "action", "scope");
CREATE INDEX "PermissionRoleGrant_permissionCode_action_scope_idx" ON "PermissionRoleGrant"("permissionCode", "action", "scope");

CREATE TABLE "PermissionRoleBinding" ("id" TEXT NOT NULL,"userId" TEXT NOT NULL,"roleId" TEXT NOT NULL,"scopeType" "PermissionScopeType" NOT NULL,"storeId" TEXT,"status" "PermissionBindingStatus" NOT NULL DEFAULT 'ACTIVE',"effectiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"expiredAt" TIMESTAMP(3),"createdById" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "PermissionRoleBinding_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PermissionRoleBinding_userId_roleId_scopeType_storeId_key" ON "PermissionRoleBinding"("userId", "roleId", "scopeType", "storeId");
CREATE INDEX "PermissionRoleBinding_userId_status_effectiveAt_expiredAt_idx" ON "PermissionRoleBinding"("userId", "status", "effectiveAt", "expiredAt");
CREATE INDEX "PermissionRoleBinding_storeId_status_idx" ON "PermissionRoleBinding"("storeId", "status");

CREATE TABLE "PermissionPolicyVersion" ("id" TEXT NOT NULL,"version" INTEGER NOT NULL,"status" "PermissionPolicyVersionStatus" NOT NULL,"payload" JSONB NOT NULL,"createdById" TEXT,"publishedAt" TIMESTAMP(3),"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"updatedAt" TIMESTAMP(3) NOT NULL,CONSTRAINT "PermissionPolicyVersion_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "PermissionPolicyVersion_version_key" ON "PermissionPolicyVersion"("version");
CREATE INDEX "PermissionPolicyVersion_status_createdAt_idx" ON "PermissionPolicyVersion"("status", "createdAt" DESC);
