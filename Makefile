.DEFAULT_GOAL := help
SHELL := /bin/bash

COMPOSE_FILE ?= deploy/docker/compose.yaml
POSTGRES_PORT ?= 5430
POSTGRES_USER ?= opentrip
POSTGRES_DB ?= opentrip
MINIAPP_DIR ?= apps/miniapp
WECHAT_DEVTOOLS_CLI ?= /Applications/wechatwebdevtools.app/Contents/MacOS/cli

.PHONY: help install env setup postgres-up postgres-down dev dev-nodb dev-web dev-api
.PHONY: miniapp-env miniapp-sync-appid miniapp-clear-cache miniapp build-miniapp dev-miniapp miniapp-open dev-miniapp-api
.PHONY: db-init db-reset db-migrate db-seed db-generate db-pull db-push db-studio db-snapshot
.PHONY: deploy-up deploy-down deploy-logs
.PHONY: build test lint typecheck check docs clean deploy

help:
	@echo "OpenTrip Makefile targets:"
	@echo ""
	@echo "Setup:"
	@echo "  make install         Install dependencies with pnpm"
	@echo "  make env             Create .env from .env.example if missing"
	@echo "  make setup           Full setup: install + env + postgres + migrate + seed"
	@echo ""
	@echo "Docker (local Postgres):"
	@echo "  make postgres-up     Start Postgres via docker compose (postgres service only)"
	@echo "  make postgres-down   Stop Postgres container"
	@echo ""
	@echo "Docker (full stack):"
	@echo "  make deploy-up       Build and start postgres + api + web"
	@echo "  make deploy-down     Stop full docker compose stack"
	@echo "  make deploy-logs     Follow api container logs"
	@echo ""
	@echo "Development:"
	@echo "  make dev             Start Postgres + migrate + web + api dev servers"
	@echo "  make dev-nodb        Start web + api only (skip Postgres startup)"
	@echo "  make dev-web         Start Vite only (http://localhost:5170)"
	@echo "  make dev-api         Start API only (http://localhost:8780)"
	@echo ""
	@echo "WeChat Mini Program (Taro):"
	@echo "  make miniapp              Build weapp, open DevTools, then watch"
	@echo "  make dev-miniapp          Taro weapp watch only"
	@echo "  make build-miniapp        One-shot weapp build → apps/miniapp/dist"
	@echo "  make miniapp-open         Open apps/miniapp in WeChat Developer Tools"
	@echo "  make miniapp-sync-appid   Sync TARO_APP_WECHAT_APP_ID into private config"
	@echo "  make miniapp-clear-cache  Clear DevTools file/compile cache and rebuild watcher"
	@echo "  make dev-miniapp-api      Postgres + API + Taro watch (local Mini Program debug)"
	@echo ""
	@echo "Database (Prisma):"
	@echo "  make db-generate     Generate Prisma Client from schema.prisma"
	@echo "  make db-pull         Regenerate prisma/schema.prisma from the live database"
	@echo "  make db-snapshot     Alias for db-pull; snapshot the current DB schema"
	@echo "  make db-push         Push schema changes to the database (dev/hack only)"
	@echo "  make db-migrate      Apply pending Prisma migrations"
	@echo "  make db-migrate-dev  Create a new Prisma migration from schema changes"
	@echo "  make db-seed         Seed demo data via Prisma"
	@echo "  make db-reset        Drop public schema, generate client, re-migrate, and re-seed"
	@echo "  make db-init         Run migrations then seed demo data"
	@echo "  make db-studio       Open Prisma Studio"
	@echo ""
	@echo "Build & QA:"
	@echo "  make build           Build all packages"
	@echo "  make test            Run tests"
	@echo "  make lint            Run ESLint"
	@echo "  make typecheck       Run TypeScript"
	@echo "  make check           typecheck + lint + test + ui:check + build"
	@echo "  make docs            Validate documentation links"
	@echo "  make ui              Validate UI conventions"
	@echo "  make clean           Remove build artifacts"
	@echo ""
	@echo "Deploy info:"
	@echo "  make deploy          Print Cloudflare / Docker deployment pointers"

install:
	pnpm install

env: install
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "Created .env from .env.example"; \
	else \
		echo ".env already exists"; \
	fi

setup: install env postgres-up db-init
	@echo "Setup complete! Run 'make dev' to start development."

postgres-up:
	@if node -e 'const net=require("net");const port=parseInt(process.env.POSTGRES_PORT||"$(POSTGRES_PORT)",10);const s=net.connect({port,host:"127.0.0.1"});s.setTimeout(500);s.on("connect",()=>{s.end();process.exit(0)});s.on("timeout",()=>{s.destroy();process.exit(1)});s.on("error",()=>{process.exit(1)});' >/dev/null 2>&1; then \
		echo "Postgres already reachable on port $(POSTGRES_PORT); skipping container startup."; \
	else \
		echo "Starting Postgres (docker compose)..."; \
		docker compose -f $(COMPOSE_FILE) up -d postgres; \
		echo "Waiting for Postgres to become ready..."; \
		for i in $$(seq 1 30); do \
			if docker compose -f $(COMPOSE_FILE) exec -T postgres pg_isready -U $(POSTGRES_USER) -d $(POSTGRES_DB) >/dev/null 2>&1; then \
				echo "Postgres is ready."; \
				break; \
			fi; \
			if [ $$i -eq 30 ]; then \
				echo "Postgres did not become ready in time."; \
				exit 1; \
			fi; \
			sleep 1; \
		done; \
	fi

postgres-down:
	@docker compose -f $(COMPOSE_FILE) stop postgres 2>/dev/null || true
	@echo "Postgres stopped."

dev: env postgres-up db-migrate
	@echo "Starting web + api dev servers (Ctrl+C to stop)..."
	@echo "  web  → http://localhost:5170  (proxies /api to :8780)"
	@echo "  api  → http://localhost:8780"
	pnpm dev

dev-nodb: env
	@echo "Starting web + api dev servers without Postgres startup (Ctrl+C to stop)..."
	pnpm dev

dev-web: env
	pnpm --filter @opentrip/web dev

dev-api: env postgres-up db-migrate
	pnpm --filter @opentrip/api dev

miniapp-sync-appid:
	@node "$(MINIAPP_DIR)/scripts/sync-wechat-appid.mjs"

miniapp-env: install
	@if [ ! -f $(MINIAPP_DIR)/.env ]; then \
		cp $(MINIAPP_DIR)/.env.example $(MINIAPP_DIR)/.env; \
		echo "Created $(MINIAPP_DIR)/.env from .env.example"; \
	else \
		echo "$(MINIAPP_DIR)/.env already exists"; \
	fi
	@$(MAKE) miniapp-sync-appid

build-miniapp: miniapp-env
	@echo "Building WeChat Mini Program (taro build --type weapp)…"
	pnpm --filter @opentrip/miniapp build

dev-miniapp: miniapp-env
	@echo "Taro weapp watch → $(MINIAPP_DIR)/dist (Ctrl+C to stop)"
	@echo "Open the project in WeChat Developer Tools: make miniapp-open"
	@echo "In DevTools Details, enable 不校验合法域名 for local http://localhost:8780"
	pnpm --filter @opentrip/miniapp dev

miniapp-clear-cache: miniapp-env
	@if [ ! -d $(MINIAPP_DIR)/dist ]; then \
		echo "$(MINIAPP_DIR)/dist missing — run make build-miniapp (or make miniapp) first."; \
		exit 1; \
	fi
	@node -e 'const fs=require("fs");const p="$(MINIAPP_DIR)/project.private.config.json";let id="";try{id=JSON.parse(fs.readFileSync(p,"utf8")).appid||""}catch{}if(!String(id).trim()){console.error("WeChat AppID missing. Set TARO_APP_WECHAT_APP_ID in apps/miniapp/.env, then run: make miniapp-sync-appid");process.exit(1)}console.log("DevTools AppID synced ("+String(id).trim().slice(0,4)+"…).")'
	@if [ ! -x "$(WECHAT_DEVTOOLS_CLI)" ]; then \
		echo "WeChat Developer Tools CLI not found: $(WECHAT_DEVTOOLS_CLI)"; \
		echo "Set WECHAT_DEVTOOLS_CLI to the installed CLI path."; \
		exit 1; \
	fi
	@echo "Opening project before DevTools cache cleanup…"
	@printf 'n\n' | "$(WECHAT_DEVTOOLS_CLI)" open --project "$(CURDIR)/$(MINIAPP_DIR)" || { \
		echo "DevTools CLI unavailable. Manually enable 设置 → 安全设置 → 服务端口, then retry."; \
		exit 1; \
	}
	@echo "Clearing DevTools file and compile caches…"
	@"$(WECHAT_DEVTOOLS_CLI)" cache --clean file --project "$(CURDIR)/$(MINIAPP_DIR)"
	@"$(WECHAT_DEVTOOLS_CLI)" cache --clean compile --project "$(CURDIR)/$(MINIAPP_DIR)"
	@echo "Rebuilding DevTools file watcher…"
	@"$(WECHAT_DEVTOOLS_CLI)" reset-fileutils --project "$(CURDIR)/$(MINIAPP_DIR)"

miniapp-open: miniapp-clear-cache
	@echo "Project directory: $(CURDIR)/$(MINIAPP_DIR)"
	@echo "(project.config.json sets miniprogramRoot=dist/; AppID comes from env via project.private.config.json)"
	@echo "Restarting project after cache cleanup…"
	@"$(WECHAT_DEVTOOLS_CLI)" close --project "$(CURDIR)/$(MINIAPP_DIR)" || true
	@"$(WECHAT_DEVTOOLS_CLI)" open --project "$(CURDIR)/$(MINIAPP_DIR)"
	@echo "Enable 不校验合法域名 for local API (http://localhost:8780)."

# One-shot: compile → open DevTools → watch (standard local Mini Program debug loop).
miniapp: miniapp-env build-miniapp miniapp-open
	@echo "Starting Taro weapp watch (Ctrl+C to stop)…"
	pnpm --filter @opentrip/miniapp dev

# API + Mini Program compile watch (no Vite). Use with make miniapp-open in another terminal.
dev-miniapp-api: env postgres-up db-migrate miniapp-env
	@echo "API → http://localhost:8780"
	@echo "Taro weapp watch → $(MINIAPP_DIR)/dist"
	@echo "Then open DevTools: make miniapp-open"
	@echo "DevTools: enable 不校验合法域名 for local API calls"
	pnpm --filter @opentrip/api --filter @opentrip/miniapp --parallel dev

db-generate:
	pnpm --filter @opentrip/api db:generate

db-pull:
	pnpm --filter @opentrip/api db:pull

db-snapshot: db-pull
	@echo "Schema snapshot updated in apps/api/prisma/schema.prisma."

db-push:
	pnpm --filter @opentrip/api db:push

db-migrate:
	pnpm db:migrate

db-migrate-dev:
	pnpm --filter @opentrip/api db:migrate-dev

db-seed:
	pnpm db:seed

db-init: db-migrate db-seed
	@echo "Database initialized."

db-reset:
	pnpm db:reset

db-studio:
	pnpm db:studio

deploy-up:
	@if [ ! -f deploy/docker/.env ]; then \
		cp deploy/docker/.env.example deploy/docker/.env; \
		echo "Created deploy/docker/.env — set BETTER_AUTH_SECRET before production use."; \
	fi
	docker compose -f $(COMPOSE_FILE) --env-file deploy/docker/.env up -d --build

deploy-down:
	docker compose -f $(COMPOSE_FILE) --env-file deploy/docker/.env down 2>/dev/null \
		|| docker compose -f $(COMPOSE_FILE) down

deploy-logs:
	docker compose -f $(COMPOSE_FILE) logs -f api

build:
	pnpm build

test:
	pnpm test

lint:
	pnpm lint

typecheck:
	pnpm typecheck

check:
	pnpm check

ui:
	pnpm ui:check

docs:
	pnpm docs:check

clean:
	rm -rf apps/web/dist apps/miniapp/dist
	@echo "Cleaned build artifacts."

deploy:
	@echo "Cloudflare (git push to main auto-deploys):"
	@echo "  Web  https://opentrip.im"
	@echo "  API  https://api.opentrip.im"
	@echo "  Docs deploy/cloudflare/README.md"
	@echo "  Manual: CLOUDFLARE_API_TOKEN=… node deploy/cloudflare/scripts/deploy-web.mjs"
	@echo "Docker:     see deploy/docker/README.md"
