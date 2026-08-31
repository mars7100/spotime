PORT ?= 8080
WEB_PORT ?= 5173

.PHONY: help install dev dev-firestore cloud run build test test-web deploy clean reset

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Sync dependencies (uv for Python, npm for the frontend)
	uv sync
	npm --prefix frontend install

# Runs the API and the Vite dev server together. Vite proxies /api through to
# uvicorn, so the browser sees one origin exactly as it does in production.
# Browse http://localhost:$(WEB_PORT) — hot reload lives there, not on $(PORT).
define run_dev
	@trap 'kill 0' EXIT INT TERM; \
	$(1) uv run uvicorn backend.main:app --reload --port $(PORT) & \
	npm --prefix frontend run dev -- --port $(WEB_PORT) & \
	wait
endef

dev: ## Run API + frontend with hot reload (SQLite, default)
	$(call run_dev,)

dev-firestore: ## Run API + frontend against Firestore (needs GOOGLE_CLOUD_PROJECT)
	$(call run_dev,SPOTIME_DB_BACKEND=firestore)

# Full cloud mode: Firestore for state + GCS for audio (signed URLs).
PROJECT ?= spotime-axjobo-2026
BUCKET ?= spotime-axjobo-2026-audio
CLOUD_ENV = GOOGLE_CLOUD_PROJECT=$(PROJECT) \
	SPOTIME_DB_BACKEND=firestore \
	SPOTIME_STORAGE_BACKEND=gcs \
	SPOTIME_GCS_BUCKET=$(BUCKET) \
	SPOTIME_SIGNER_SA=spotime-signer@$(PROJECT).iam.gserviceaccount.com

cloud: ## Run API + frontend against Firestore + GCS (full cloud, like production)
	$(call run_dev,$(CLOUD_ENV))

build: ## Build the frontend into frontend/dist
	npm --prefix frontend run build

run: build ## Serve the built app without reload (production-like)
	uv run uvicorn backend.main:app --host 0.0.0.0 --port $(PORT)

test: ## Run all tests (backend + frontend)
	uv run pytest
	npm --prefix frontend run test

test-web: ## Run the frontend tests only
	npm --prefix frontend run test

deploy: ## Build + deploy to Cloud Run (env vars already set on the service)
	gcloud run deploy spotime --source . --project=$(PROJECT) --region=us-central1

clean: ## Remove Python caches
	find . -type d -name __pycache__ -prune -exec rm -rf {} +

reset: ## Delete all local data (audio files + database)
	rm -rf data/
	@echo "Local library wiped."
