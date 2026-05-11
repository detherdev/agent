# Next.js standalone build for self-host on Fly. Vercel doesn't need this —
# it builds Next directly. Use this if you'd rather keep everything on Fly.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/web/package.json ./packages/web/
RUN pnpm install --frozen-lockfile --filter "web..."

# ---------- build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/web/node_modules ./packages/web/node_modules
COPY tsconfig.base.json package.json pnpm-workspace.yaml ./
COPY packages/web/ ./packages/web/

# Clerk's build-time check needs *some* publishable key. Production uses
# the real one from Fly secrets at runtime.
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_dummy_build_only
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter web build

# ---------- runtime ----------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Next.js standalone output bundles everything it needs. We only need to
# copy three things: standalone server, static assets, public.
COPY --from=build /app/packages/web/.next/standalone/ ./
COPY --from=build /app/packages/web/.next/static ./packages/web/.next/static
COPY --from=build /app/packages/web/public ./packages/web/public 2>/dev/null || true

RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app
USER app

EXPOSE 3000
CMD ["node", "packages/web/server.js"]
