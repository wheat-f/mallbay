# ─────────────────────────────────────────────────────────────────
# Stage 1: base — Node + pnpm
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
# 原生模块编译工具（bcrypt、@prisma/engines 等需要）
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm@11.0.9

# ─────────────────────────────────────────────────────────────────
# Stage 2: deps — install all workspace dependencies
# ─────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

# Copy manifests first for layer-cache efficiency
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json       ./apps/api/
COPY apps/web/package.json       ./apps/web/

RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────
# Stage 3: builder — generate Prisma client + compile TypeScript
# ─────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY . .

# Generate Prisma client (writes into node_modules/.prisma)
RUN pnpm --filter @mallbay/api prisma:generate

# Build shared package first (api depends on it)
RUN pnpm --filter @mallbay/shared build 2>/dev/null || true

# Build NestJS API
RUN pnpm --filter @mallbay/api exec tsc -p tsconfig.app.json

# ─────────────────────────────────────────────────────────────────
# Stage 4: runner — lean production image
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production

# Copy the generated node_modules (includes prisma client + all deps)
COPY --from=builder /app/node_modules           ./node_modules
COPY --from=builder /app/packages               ./packages
COPY --from=builder /app/package.json           ./package.json

# Copy API build artifacts
COPY --from=builder /app/apps/api/dist             ./apps/api/dist
COPY --from=builder /app/apps/api/package.json     ./apps/api/package.json
COPY --from=builder /app/apps/api/prisma           ./apps/api/prisma
COPY --from=builder /app/apps/api/prisma.config.ts ./apps/api/prisma.config.ts

# Startup script
COPY apps/api/scripts/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001

# dumb-init handles PID 1 + signal forwarding
ENTRYPOINT ["dumb-init", "--"]
CMD ["/entrypoint.sh"]
