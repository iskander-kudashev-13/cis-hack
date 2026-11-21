#!/usr/bin/env bash
# One-time server setup. Touches only Scam Weather's own user, folder, unit and nginx site.
#   DEPLOY_HOST=root@212.43.148.73 DOMAINS="scam-weather.212-43-148-73.sslip.io" ./deploy/setup.sh
set -euo pipefail
: "${DEPLOY_HOST:?}"; : "${DOMAINS:?space-separated server names}"
cd "$(dirname "$0")"
scp -q scam-weather.service "$DEPLOY_HOST:/etc/systemd/system/scam-weather.service"
sed "s/SERVER_NAMES/$DOMAINS/" nginx-scam-weather.conf | ssh "$DEPLOY_HOST" 'cat > /etc/nginx/sites-available/scam-weather'
CERT_ARGS=""; for d in $DOMAINS; do CERT_ARGS="$CERT_ARGS -d $d"; done
ssh "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
id -u scamweather >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin scamweather
mkdir -p /srv/scam-weather/releases
[ -f /srv/scam-weather/.env ] || echo 'DEVIN_API_KEY=' > /srv/scam-weather/.env
chown root:scamweather /srv/scam-weather/.env; chmod 640 /srv/scam-weather/.env
ln -sf /etc/nginx/sites-available/scam-weather /etc/nginx/sites-enabled/scam-weather
nginx -t && systemctl reload nginx
systemctl daemon-reload; systemctl enable scam-weather >/dev/null
certbot --nginx --non-interactive --agree-tos --register-unsafely-without-email --redirect \
  --cert-name scam-weather $CERT_ARGS || echo "certbot failed: site stays on http"
REMOTE
