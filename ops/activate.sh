#!/usr/bin/env bash
set -euo pipefail
base=$1
release=$2
cd "$release"
export DOCKER_CONFIG
DOCKER_CONFIG=$(mktemp -d)
trap 'rm -rf -- "$DOCKER_CONFIG"; rm -f registry-token registry-user' EXIT
docker login ghcr.io -u "$(cat registry-user)" --password-stdin < registry-token
rm -f registry-token registry-user
previous=$(readlink -f "$base/current" || true)
docker compose pull
if docker compose up -d --wait --wait-timeout 150 && curl -fsS --retry 3 http://127.0.0.1:18081/api/v1/stocks?market=KR >/dev/null; then
  ln -s "$release" "$base/current.new"
  mv -Tf "$base/current.new" "$base/current"
else
  if [[ -f "$previous/compose.yaml" ]]; then
    (cd "$previous" && docker compose up -d --wait --wait-timeout 150)
  fi
  exit 1
fi
# 현재 및 직전 릴리스만 남겨 운영 키 사본을 제한
for path in "$base"/releases/build.*; do
  if [[ -d "$path" && "$path" != "$previous" && "$path" != "$release" ]]; then rm -rf -- "$path"; fi
done
