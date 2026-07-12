# ─────────────────────────────────────────────────────────────────
# Stage 1: base — Node + pnpm
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS base
# 原生模块编译工具（sharp、bcrypt 等需要）
RUN apk add --no-cache python3 make g++
RUN npm install -g pnpm@11.0.9

# ─────────────────────────────────────────────────────────────────
# Stage 2: deps — install all workspace dependencies
# ─────────────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json        ./apps/api/
COPY apps/web/package.json        ./apps/web/

RUN pnpm install --frozen-lockfile

# ─────────────────────────────────────────────────────────────────
# Stage 3: builder — Next.js production build (standalone output)
# ─────────────────────────────────────────────────────────────────
FROM deps AS builder
WORKDIR /app

COPY . .

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# NEXT_PUBLIC_ 变量在 build 时静态编译进代码，必须在此阶段传入
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_AUTH_CREDENTIAL_ENCRYPTION_ENABLED=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_AUTH_CREDENTIAL_ENCRYPTION_ENABLED=$NEXT_PUBLIC_AUTH_CREDENTIAL_ENCRYPTION_ENABLED

# Build shared package first
RUN pnpm --filter @mallbay/shared build 2>/dev/null || true

# Build Next.js web app
RUN pnpm --filter @mallbay/web build

# ─────────────────────────────────────────────────────────────────
# Stage 4: runner — minimal standalone image
# ─────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# next build --standalone output mirrors the monorepo directory tree
# inside .next/standalone — copy it wholesale, then add static assets
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static      ./apps/web/.next/static
# public 目录可选，有才复制
COPY --from=builder /app/apps/web/public*           ./apps/web/public/

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
# standalone server.js sits at apps/web/server.js within the copied tree
CMD ["node", "apps/web/server.js"]
