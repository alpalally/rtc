FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies
COPY package*.json turbo.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm ci --workspace=apps/web --include-workspace-root

# Build
COPY apps/web ./apps/web
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=apps/web

# Production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json turbo.json ./
COPY apps/web/package*.json ./apps/web/
RUN npm ci --workspace=apps/web --omit=dev --include-workspace-root

COPY --from=base /app/apps/web/.next ./apps/web/.next
# public/ is optional — skip if it doesn't exist
RUN mkdir -p ./apps/web/public

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=apps/web"]
