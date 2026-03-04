FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/workers/package.json ./apps/workers/
COPY packages/database/package.json ./packages/database/
COPY packages/shared/package.json ./packages/shared/
COPY packages/ai-gateway/package.json ./packages/ai-gateway/
RUN pnpm install --frozen-lockfile --filter @marketplace/workers...

FROM base AS builder
COPY --from=deps /app ./
COPY . .
RUN pnpm --filter @marketplace/workers build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/apps/workers/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "dist/main.js"]
