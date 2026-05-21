# ─────────────────────────────────────────────────────────────────
# Stage 1: base — Node + pnpm
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@11.0.9 --activate

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
# Disable Next.js telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1

# Build shared package first
RUN pnpm --filter @mallbay/shared build 2>/dev/null || true

# Build Next.js web app
RUN pnpm --filter @mallbay/web build

# ─────────────────────────────────────────────────────────────────
# Stage 4: runner — minimal standalone image
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
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
COPY --from=builder /app/apps/web/public            ./apps/web/public

EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
# standalone server.js sits at apps/web/server.js within the copied tree
CMD ["node", "apps/web/server.js"]
