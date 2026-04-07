FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json turbo.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci --workspace=apps/api --include-workspace-root

# Build - copy only src (no stale dist from context)
COPY apps/api/src ./apps/api/src
COPY apps/api/tsconfig.json ./apps/api/tsconfig.json
COPY apps/api/drizzle.config.ts ./apps/api/drizzle.config.ts
RUN npm run build --workspace=apps/api

# Production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json turbo.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci --workspace=apps/api --omit=dev --include-workspace-root

COPY --from=base /app/apps/api/dist ./apps/api/dist
COPY --from=base /app/apps/api/src/db/migrations ./apps/api/dist/db/migrations
COPY apps/api/scripts ./apps/api/scripts

EXPOSE 3001

# Default: run API. Override CMD to "node apps/api/dist/worker.js" for the worker service.
CMD ["node", "apps/api/dist/index.js"]
