# Multi-stage build for the api/worker/trigger-worker.
#
# The same image is used for all three processes — they just differ by CMD.
# fly.toml's [processes] block picks which entry point to run.

FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# ---------- deps stage: lockfile + manifests, install everything we need ----------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/runtime/package.json ./packages/runtime/
COPY packages/api/package.json ./packages/api/
COPY packages/evals/package.json ./packages/evals/
# We don't need the web package for the api image.
RUN pnpm install --frozen-lockfile \
    --filter "api..." \
    --filter "runtime..." \
    --filter "evals..."

# ---------- build stage: bring sources in, build runtime → evals → api ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/runtime/node_modules ./packages/runtime/node_modules
COPY --from=deps /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=deps /app/packages/evals/node_modules ./packages/evals/node_modules
COPY tsconfig.base.json package.json pnpm-workspace.yaml ./
COPY packages/runtime/ ./packages/runtime/
COPY packages/evals/ ./packages/evals/
COPY packages/api/ ./packages/api/
COPY db ./db
COPY packs ./packs
COPY scripts ./scripts

RUN pnpm --filter runtime build
RUN pnpm --filter evals build
RUN pnpm --filter api build

# ---------- runtime stage: only what the running process needs ----------
FROM base AS runner
ENV NODE_ENV=production

# Copy compiled output + production deps + runtime data dirs.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/runtime/dist ./packages/runtime/dist
COPY --from=build /app/packages/runtime/package.json ./packages/runtime/package.json
COPY --from=build /app/packages/evals/dist ./packages/evals/dist
COPY --from=build /app/packages/evals/package.json ./packages/evals/package.json
COPY --from=build /app/packages/api/dist ./packages/api/dist
COPY --from=build /app/packages/api/package.json ./packages/api/package.json
COPY --from=build /app/db ./db
COPY --from=build /app/packs ./packs
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./

# Drop root.
RUN addgroup -g 1001 -S app && adduser -u 1001 -S app -G app
USER app

# Default to the api process; fly.toml overrides for worker/triggers.
EXPOSE 3001
CMD ["node", "packages/api/dist/index.js"]
