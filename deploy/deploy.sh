#!/usr/bin/env bash
# Every deploy: build locally, upload a release, switch the symlink, restart. ~20 s.
#   ./deploy/deploy.sh            (DEPLOY_HOST defaults to root@212.43.148.73)
# Rollback: ln -sfn releases/<old> /srv/scam-weather/current && systemctl restart scam-weather
set -euo pipefail
DEPLOY_HOST="${DEPLOY_HOST:-root@212.43.148.73}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
REL="$(date +%Y%m%d-%H%M%S)-$(git rev-parse --short HEAD)"
OUT="$(mktemp -d)"; trap 'rm -r "$OUT"' EXIT

echo "==> web"; (cd web && npm ci --silent && npm run build --silent)
echo "==> server (linux/amd64)"
(cd server && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath -ldflags='-s -w' -o "$OUT/scamweather" ./cmd/scamweather)
cp -R web/dist "$OUT/web"

echo "==> upload $REL"
rsync -az "$OUT/" "$DEPLOY_HOST:/srv/scam-weather/releases/$REL/"
ssh "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
cd /srv/scam-weather
chown -R root:root releases/$REL; chmod -R a+rX releases/$REL
ln -sfn releases/$REL current
systemctl restart scam-weather
ls -1dt releases/* | tail -n +6 | xargs -r rm -r   # keep last 5 releases
for i in \$(seq 1 10); do curl -fsS http://127.0.0.1:8090/healthz >/dev/null && break; sleep 1; done
echo "healthz: \$(curl -fsS http://127.0.0.1:8090/healthz)"
REMOTE
echo "==> deployed $REL"
