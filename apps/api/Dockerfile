FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json turbo.json ./
COPY apps/api/package*.json ./apps/api/
RUN npm ci --workspace=apps/api --include-workspace-root

# Build
COPY apps/api ./apps/api
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

EXPOSE 3001

# Default: run API. Override CMD to "node apps/api/dist/worker.js" for the worker service.
CMD ["node", "apps/api/dist/index.js"]
