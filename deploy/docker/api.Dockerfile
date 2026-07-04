# API image — Hono served by tsx. Build context is the repo root.
FROM node:20-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

# Install workspace deps (api + root). Copy manifests first for layer caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --filter @wetravel/api... --frozen-lockfile

# App source.
COPY tsconfig.base.json ./
COPY apps/api ./apps/api

WORKDIR /app/apps/api
EXPOSE 8787
CMD ["pnpm", "start"]
