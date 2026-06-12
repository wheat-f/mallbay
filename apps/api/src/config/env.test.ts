import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { buildApiEnvFilePaths, readEnvValue } from "./env";

const repoRoot = "/workspace/mallbay";
const apiDir = path.join(repoRoot, "apps/api");
const sourceModuleDir = path.join(apiDir, "src/config");
const distModuleDir = path.join(apiDir, "dist/config");

test("buildApiEnvFilePaths includes repository root env when API starts from apps/api", () => {
  assert.equal(
    buildApiEnvFilePaths({ cwd: apiDir, moduleDir: sourceModuleDir })[0],
    path.join(repoRoot, ".env")
  );
});

test("buildApiEnvFilePaths includes repository root env when API starts from repository root", () => {
  assert.equal(
    buildApiEnvFilePaths({ cwd: repoRoot, moduleDir: sourceModuleDir })[0],
    path.join(repoRoot, ".env")
  );
});

test("buildApiEnvFilePaths includes repository root env after TypeScript is compiled", () => {
  assert.equal(
    buildApiEnvFilePaths({ cwd: apiDir, moduleDir: distModuleDir })[0],
    path.join(repoRoot, ".env")
  );
});

test("readEnvValue reads quoted values from explicit env files", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "mallbay-env-"));
  const envFile = path.join(dir, ".env");
  writeFileSync(envFile, 'DATABASE_URL="postgresql://postgres:postgres@localhost:55432/mallbay?schema=public"\n');

  assert.equal(
    readEnvValue("DATABASE_URL", [envFile]),
    "postgresql://postgres:postgres@localhost:55432/mallbay?schema=public"
  );
});
