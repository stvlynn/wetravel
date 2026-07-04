# Web image — build the SPA, serve with nginx (+ /api proxy). Context: repo root.
FROM node:20-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --filter @wetravel/web... --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/web ./apps/web

ARG BASE_URL
ENV BASE_URL=$BASE_URL
WORKDIR /app/apps/web
RUN pnpm build

FROM nginx:1.27-alpine AS runtime
COPY deploy/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
