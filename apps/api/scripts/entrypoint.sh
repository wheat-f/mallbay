#!/bin/sh
set -e

echo "[entrypoint] Running Prisma migrations..."
# cd 到 apps/api，让 prisma 能找到同目录的 prisma.config.ts
cd /app/apps/api
/app/node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Starting API server..."
exec node /app/apps/api/dist/main.js
