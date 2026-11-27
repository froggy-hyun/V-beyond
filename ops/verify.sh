#!/usr/bin/env bash
set -euo pipefail
export COMPOSE_PROJECT_NAME="product-lens-ci-${GITHUB_RUN_ID:-local}"
export WEB_PORT=${CI_WEB_PORT:-18181}
repo=$(pwd)
compose=(docker compose -f "$repo/compose.yaml" --env-file "$repo/.env.example")
trap '"${compose[@]}" down -v --remove-orphans' EXIT
docker build --target test backend
docker build -t product-lens-backend:local backend
docker build -t product-lens-frontend:local frontend
"${compose[@]}" up -d --wait --wait-timeout 180
cd frontend
npm ci
npx playwright install --with-deps chromium
BASE_URL="http://127.0.0.1:$WEB_PORT" npm run e2e
cd ..
