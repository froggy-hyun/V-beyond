#!/usr/bin/env bash
set -euo pipefail
umask 077
: "${PROD_HOST:?}" "${PROD_SSH_USER:?}" "${PROD_SSH_KEY:?}" "${PROD_SSH_PASSWORD:?}" "${PROD_SSH_KNOWN_HOSTS:?}" "${GH_TOKEN:?}"
[[ "$PROD_HOST" =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]*$ && "$PROD_SSH_USER" =~ ^[a-z_][a-z0-9_-]*$ ]]
work=$(mktemp -d)
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/bundle"
printf '%s\n' "$PROD_SSH_KNOWN_HOSTS" > "$work/known_hosts"
printf '%s\n' "$PROD_SSH_KEY" > "$work/key"
cat > "$work/askpass" <<'ASK'
#!/bin/sh
printf '%s\n' "$PROD_SSH_PASSWORD"
ASK
chmod 700 "$work/askpass"
export SSH_ASKPASS="$work/askpass" SSH_ASKPASS_REQUIRE=force DISPLAY=:0
ssh_opts=(-i "$work/key" -o IdentitiesOnly=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$work/known_hosts" -o ConnectTimeout=12 -o NumberOfPasswordPrompts=1)
cp Caddyfile compose.public.yaml compose.yaml ops/activate.sh "$work/bundle/"
chmod 644 "$work/bundle/Caddyfile"
python3 - "$work/bundle/.env" <<'PY'
import os, sys
from pathlib import Path
keys = ('DB_PASSWORD', 'OPENAI_API_KEY', 'KIS_APP_KEY', 'KIS_APP_SECRET', 'BACKEND_IMAGE', 'FRONTEND_IMAGE')
with Path(sys.argv[1]).open('w') as env:
    print('COMPOSE_FILE=compose.yaml:compose.public.yaml', file=env)
    print('SITE_HOST=' + os.environ['PROD_HOST'], file=env)
    for key in keys:
        value = os.environ[key]
        if not value or any(char in value for char in "\r\n'\\"):
            raise ValueError('배포 설정값 확인 필요 ' + key)
        print(f"{key}='{value}'", file=env)
PY
printf '%s' "$GH_TOKEN" > "$work/bundle/registry-token"
printf '%s' "$GITHUB_ACTOR" > "$work/bundle/registry-user"
tar -C "$work/bundle" -cf - . | ssh "${ssh_opts[@]}" "$PROD_SSH_USER@$PROD_HOST" '
  set -eu
  umask 077
  base="$HOME/product-lens"
  mkdir -p "$base/releases"
  exec 9>"$base/deploy.lock"
  flock -w 120 9
  release=$(mktemp -d "$base/releases/build.XXXXXXXX")
  trap '\''rm -f "$release/registry-token" "$release/registry-user"'\'' EXIT
  tar -C "$release" -xf -
  bash "$release/activate.sh" "$base" "$release"
'
