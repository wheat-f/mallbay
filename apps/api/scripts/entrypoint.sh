#!/bin/sh
set -e

echo "[entrypoint] Running database invariant preflight..."
# cd 到 apps/api，让 prisma 能找到同目录的 prisma.config.ts
cd /app/apps/api
node dist/prisma/preflight-db-invariants.js

echo "[entrypoint] Running Prisma migrations..."
/app/node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Starting API server..."
exec node /app/apps/api/dist/main.js
