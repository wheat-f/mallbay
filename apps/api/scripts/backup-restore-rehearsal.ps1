param(
  [string]$RestoreDatabase = "mallbay_restore_rehearsal",
  [string]$BackupPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "../../..")).Path
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($BackupPath)) {
  $BackupPath = Join-Path $repoRoot ".tmp\mallbay-rehearsal.sql"
}
$validationPath = Join-Path (Split-Path -Parent $BackupPath) "mallbay-rehearsal-validate.sql"

New-Item -ItemType Directory -Force (Split-Path -Parent $BackupPath) | Out-Null

function Invoke-Compose {
  param([string[]]$Arguments)
  & docker compose @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "docker compose $($Arguments -join ' ') failed with exit code $LASTEXITCODE"
  }
}

try {
  Write-Host "[1/4] Exporting mallbay to $BackupPath"
  # Windows PowerShell's native redirection emits UTF-16 for text streams;
  # use cmd.exe only for this non-destructive binary-safe capture.
  $exportCommand = "docker compose exec -T postgres pg_dump -U postgres -d mallbay --format=plain --no-owner > $BackupPath"
  & cmd.exe /d /s /c $exportCommand
  if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }

  Write-Host "[2/4] Recreating temporary database $RestoreDatabase"
  Invoke-Compose @("exec", "-T", "postgres", "dropdb", "-U", "postgres", "--if-exists", $RestoreDatabase)
  Invoke-Compose @("exec", "-T", "postgres", "createdb", "-U", "postgres", $RestoreDatabase)

  Write-Host "[3/4] Restoring backup"
  $postgresContainer = (& docker compose ps -q postgres).Trim()
  if ([string]::IsNullOrWhiteSpace($postgresContainer)) { throw "postgres container is not running" }
  & docker cp $BackupPath "$postgresContainer`:/tmp/mallbay-rehearsal.sql"
  if ($LASTEXITCODE -ne 0) { throw "docker cp failed with exit code $LASTEXITCODE" }
  & docker compose exec -T postgres psql --set ON_ERROR_STOP=1 -U postgres -d $RestoreDatabase -f /tmp/mallbay-rehearsal.sql
  if ($LASTEXITCODE -ne 0) { throw "psql restore failed with exit code $LASTEXITCODE" }

  Write-Host "[4/4] Validating restored lifecycle schema and data"
  $migrationDirectory = Join-Path $repoRoot "apps/api/prisma/migrations"
  $expectedMigrations = @(Get-ChildItem -LiteralPath $migrationDirectory -Directory | Select-Object -ExpandProperty Name)
  if ($expectedMigrations.Count -eq 0) { throw "no Prisma migrations found under $migrationDirectory" }
  $validationSql = @'
DO $$
DECLARE
  expected_count integer := __EXPECTED_MIGRATIONS__;
  actual_count integer;
BEGIN
  SELECT COUNT(*) INTO actual_count FROM "_prisma_migrations";
  IF actual_count <> expected_count THEN
    RAISE EXCEPTION 'migration count mismatch: expected %, got %', expected_count, actual_count;
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL) THEN
    RAISE EXCEPTION 'restored database contains unfinished or rolled-back migrations';
  END IF;
  IF EXISTS (SELECT 1 FROM "_prisma_migrations" GROUP BY migration_name HAVING COUNT(*) > 1) THEN
    RAISE EXCEPTION 'restored database contains duplicate migration names';
  END IF;
END $$;
SELECT to_regclass('"OrderLifecycleCommandRecord"') AS lifecycle_commands,
       to_regclass('"ConstructionPhoto"') AS construction_photo,
       to_regtype('"ConstructionEvidenceStatus"') AS construction_evidence_status;
SELECT column_name FROM information_schema.columns
 WHERE table_name = 'ConstructionPhoto'
   AND column_name IN ('requestFingerprint', 'status')
 ORDER BY column_name;
SELECT COUNT(*) AS orders FROM "Order";
'@
  $validationSql = $validationSql.Replace("__EXPECTED_MIGRATIONS__", [string]$expectedMigrations.Count)
  Set-Content -LiteralPath $validationPath -Value $validationSql -Encoding ASCII
  & docker cp $validationPath "$postgresContainer`:/tmp/mallbay-rehearsal-validate.sql"
  if ($LASTEXITCODE -ne 0) { throw "docker cp validation file failed with exit code $LASTEXITCODE" }
  Invoke-Compose @(
    "exec", "-T", "postgres", "psql", "--set", "ON_ERROR_STOP=1", "-U", "postgres", "-d", $RestoreDatabase,
    "-f", "/tmp/mallbay-rehearsal-validate.sql"
  )

  Write-Host "Backup/restore rehearsal passed."
}
finally {
  Write-Host "Cleaning temporary database $RestoreDatabase"
  & docker compose exec -T postgres dropdb -U postgres --if-exists $RestoreDatabase | Out-Host
  & docker compose exec -T postgres rm -f /tmp/mallbay-rehearsal.sql | Out-Host
  & docker compose exec -T postgres rm -f /tmp/mallbay-rehearsal-validate.sql | Out-Host
  if (Test-Path -LiteralPath $BackupPath) {
    Remove-Item -LiteralPath $BackupPath -Force
  }
  if (Test-Path -LiteralPath $validationPath) {
    Remove-Item -LiteralPath $validationPath -Force
  }
}
