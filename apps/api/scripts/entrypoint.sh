#!/bin/sh
set -e

echo "[entrypoint] Running Prisma migrations..."
node_modules/.bin/prisma migrate deploy --schema apps/api/prisma/schema.prisma

echo "[entrypoint] Starting API server..."
exec node apps/api/dist/main.js
