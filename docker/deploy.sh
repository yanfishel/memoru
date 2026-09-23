#!/usr/bin/env bash
# Code deploys on the server (README, "Deployment"); run by .github/workflows/release.yml.
# Copied by hand to /srv/memoru/deploy.sh and bound to the CI deploy key in authorized_keys:
#   command="/srv/memoru/deploy.sh",restrict ssh-ed25519 AAAA... memoru-github-deploy
# Its only input is the release tag: SSH_ORIGINAL_COMMAND under that key, or $1 when run by hand.
# Exit: 0 deployed; 1 unhealthy, previous image restored; 2 tag refused; 3 pull failed, nothing changed.
set -euo pipefail

DIR=${DEPLOY_DIR:-/srv/memoru}
REPO=${DEPLOY_IMAGE_REPO:-ghcr.io/yanfishel/memoru}
HEALTH_TIMEOUT=${DEPLOY_HEALTH_TIMEOUT:-120}
HEALTH_INTERVAL=${DEPLOY_HEALTH_INTERVAL:-3}

tag=${SSH_ORIGINAL_COMMAND:-${1:-}}
if [[ ! $tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "deploy: refusing tag '$tag': expected vMAJOR.MINOR.PATCH" >&2
  exit 2
fi

image="$REPO:$tag"
cd "$DIR"
compose() { docker compose -f docker-compose.prod.yml "$@"; }
# .env was written on Windows: strip the carriage return, or the fallback would write it back inside the value.
previous=$(grep '^MEMORU_IMAGE=' .env | tail -n 1 | cut -d= -f2- | tr -d '\r' || true)

set_image() {
  if grep -q '^MEMORU_IMAGE=' .env; then
    # -b: keep the other lines' CRLF under Git Bash too (a no-op on Linux), so the tests see what the server does.
    sed -i -b "s|^MEMORU_IMAGE=.*|MEMORU_IMAGE=$1|" .env
  else
    printf 'MEMORU_IMAGE=%s\n' "$1" >> .env
  fi
}

# 200 only: the compose healthcheck also accepts 503 (no serving data), which is not a working site.
healthy() {
  local deadline=$((SECONDS + HEALTH_TIMEOUT)) code
  while (( SECONDS < deadline )); do
    code=$(compose exec -T web curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/api/health 2>/dev/null || true)
    [[ $code == 200 ]] && return 0
    sleep "$HEALTH_INTERVAL"
  done
  return 1
}

echo "deploy: pulling $image (current: ${previous:-none})"
docker pull "$image" || { echo "deploy: cannot pull $image; nothing changed" >&2; exit 3; }

set_image "$image"
if ! compose up -d web || ! healthy; then
  echo "deploy: $image did not answer 200 on /api/health within ${HEALTH_TIMEOUT}s; restoring ${previous:-nothing}" >&2
  if [[ -n $previous ]]; then
    set_image "$previous"
    compose up -d web || true
  fi
  exit 1
fi
echo "deploy: $image is live"

# Disk is the binding constraint: keep only the running image and the one to fall back to. A redeploy
# of the running tag knows no other fallback, so it keeps everything rather than delete the only one.
[[ $image == "$previous" ]] && exit 0
docker images "$REPO" --format '{{.Repository}}:{{.Tag}}' | while read -r ref; do
  [[ $ref == "$image" || $ref == "$previous" ]] && continue
  docker rmi "$ref" >/dev/null 2>&1 && echo "deploy: removed $ref" || true
done
