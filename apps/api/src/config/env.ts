import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

type EnvPathOptions = {
  cwd: string;
  moduleDir: string;
};

export const PRISMA_CLI_DATABASE_URL_PLACEHOLDER =
  "postgresql://mallbay:mallbay@localhost:55432/mallbay?schema=public";

export function getApiEnvFilePaths() {
  return buildApiEnvFilePaths({
    cwd: process.cwd(),
    moduleDir: __dirname
  });
}

export function buildApiEnvFilePaths({ cwd, moduleDir }: EnvPathOptions) {
  const repoRootFromModule = path.resolve(moduleDir, "../../../..");
  const apiRootFromModule = path.resolve(moduleDir, "../..");
  const candidates = [
    path.join(repoRootFromModule, ".env"),
    path.join(apiRootFromModule, ".env"),
    path.join(cwd, ".env"),
    path.join(cwd, "../../.env")
  ];

  return [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
}

export function getRequiredEnvValue(key: string, envFilePaths = getApiEnvFilePaths()) {
  const processValue = process.env[key];
  if (processValue) return processValue;

  const fileValue = readEnvValue(key, envFilePaths);
  if (fileValue) return fileValue;

  throw new Error(`${key} is required; check env file loading`);
}

export function getPrismaCliDatabaseUrl(envFilePaths = getApiEnvFilePaths()) {
  const processValue = process.env.DATABASE_URL;
  if (processValue) return processValue;

  const fileValue = readEnvValue("DATABASE_URL", envFilePaths);
  return fileValue ?? PRISMA_CLI_DATABASE_URL_PLACEHOLDER;
}

export function readEnvValue(key: string, envFilePaths: string[]) {
  for (const envFilePath of envFilePaths) {
    if (!existsSync(envFilePath)) continue;

    const content = readFileSync(envFilePath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || match[1] !== key) continue;
      return stripEnvQuotes(match[2]);
    }
  }

  return undefined;
}

function stripEnvQuotes(value: string) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
