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
site=$(sed -n 's/^SITE_HOST=//p' .env)
[[ -n "$site" ]]
verify_market() {
  local url="https://$site/api/v1"
  local tls=(--resolve "$site:443:127.0.0.1")
  curl -fsS --retry 8 --retry-all-errors --retry-delay 3 --max-time 5 \
    "${tls[@]}" "$url/stocks?market=KR" >/dev/null || return 1
  if ! grep -qx 'MARKET_DATA_MODE=KIS' .env; then return 0; fi
  for attempt in {1..26}; do
    if curl -fsS --max-time 5 "${tls[@]}" "$url/market/quotes?ids=KR%3AKOSPI%3A004370,US%3ANYSE%3AKO" |
      python3 -c 'import json,sys; rows=json.load(sys.stdin); sys.exit(not (len(rows)==2 and all(r["feedMode"]=="KIS_REST" and r["freshness"]=="FRESH" and r["price"] for r in rows)))'; then
      return 0
    fi
    sleep 3
  done
  return 1
}

if docker compose up -d --wait --wait-timeout 150 && verify_market; then
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
