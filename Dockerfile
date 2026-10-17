# syntax=docker/dockerfile:1.7
# KnittingTracker — static PWA image (ADR-7).
# Stage 1 builds the app with pnpm; stage 2 serves dist/ with unprivileged nginx (uid 101, :8080).
# Base images are pinned by tag; Renovate keeps them (and their digests) up to date.

ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=1.29-alpine

FROM node:${NODE_VERSION} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=1 \
    HUSKY=0
RUN corepack enable
WORKDIR /app

# Dependency layer: only manifests, so source changes do not invalidate the store cache.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/grid-renderer/package.json packages/grid-renderer/
COPY packages/importer/package.json packages/importer/
COPY packages/test-fixtures/package.json packages/test-fixtures/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .
ARG VITE_APP_ENV=prod
ENV VITE_APP_ENV=${VITE_APP_ENV}
RUN pnpm --filter @kt/web build

FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runtime
LABEL org.opencontainers.image.title="KnittingTracker" \
      org.opencontainers.image.description="Local-first PWA for tracking knitting chart progress" \
      org.opencontainers.image.licenses="UNLICENSED"

COPY --chown=root:root docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --chown=root:root docker/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build --chown=root:root /app/apps/web/dist /usr/share/nginx/html

USER 101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
