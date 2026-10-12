# Builds the API into a single bundled file, then ships it on a slim Node runtime.

FROM node:22-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Install dependencies first so this layer is cached until a package.json changes.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile --filter "@le-uma/api..."; \
    else pnpm install --filter "@le-uma/api..."; fi

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
RUN pnpm --filter @le-uma/api build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    MIGRATIONS_DIR=/app/migrations \
    PORT=3000
WORKDIR /app
COPY --from=build /app/apps/api/dist ./dist
COPY apps/api/migrations ./migrations
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "--enable-source-maps", "dist/server.js"]
