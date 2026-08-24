PORT ?= 8080

.PHONY: help install dev run clean reset

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'

install: ## Sync dependencies with uv
	uv sync

dev: ## Run with auto-reload (SQLite, default)
	uv run uvicorn backend.main:app --reload --port $(PORT)

dev-firestore: ## Run with auto-reload against Firestore (needs GOOGLE_CLOUD_PROJECT)
	SPOTIME_DB_BACKEND=firestore uv run uvicorn backend.main:app --reload --port $(PORT)

# Full cloud mode: Firestore for state + GCS for audio (signed URLs).
PROJECT ?= spotime-axjobo-2026
BUCKET ?= spotime-axjobo-2026-audio
cloud: ## Run against Firestore + GCS (full cloud, like production)
	GOOGLE_CLOUD_PROJECT=$(PROJECT) \
	SPOTIME_DB_BACKEND=firestore \
	SPOTIME_STORAGE_BACKEND=gcs \
	SPOTIME_GCS_BUCKET=$(BUCKET) \
	SPOTIME_SIGNER_SA=spotime-signer@$(PROJECT).iam.gserviceaccount.com \
	uv run uvicorn backend.main:app --reload --port $(PORT)

run: ## Run without reload (production-like)
	uv run uvicorn backend.main:app --host 0.0.0.0 --port $(PORT)

deploy: ## Build + deploy to Cloud Run (env vars already set on the service)
	gcloud run deploy spotime --source . --project=$(PROJECT) --region=us-central1

clean: ## Remove Python caches
	find . -type d -name __pycache__ -prune -exec rm -rf {} +

reset: ## Delete all local data (audio files + database)
	rm -rf data/
	@echo "Local library wiped."
