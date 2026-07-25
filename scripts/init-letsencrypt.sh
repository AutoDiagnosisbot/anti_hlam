#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

DOMAIN="${DOMAIN:-}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"
APP_HTTP_BIND="${APP_HTTP_BIND:-8083}"
HTTPS_BIND="${HTTPS_BIND:-8443}"
PUBLIC_HTTPS_PORT="${PUBLIC_HTTPS_PORT:-8443}"
CERTBOT_STAGING="${CERTBOT_STAGING:-0}"
RSA_KEY_SIZE="${RSA_KEY_SIZE:-4096}"

if [ -z "$DOMAIN" ] || [ -z "$LETSENCRYPT_EMAIL" ]; then
  echo "Set DOMAIN and LETSENCRYPT_EMAIL in .env before running this script." >&2
  exit 1
fi

case "$DOMAIN" in
  *[!A-Za-z0-9.-]*)
    echo "DOMAIN must contain only letters, numbers, dots and hyphens." >&2
    exit 1
    ;;
esac

case "$HTTPS_BIND" in
  8083|*:8083)
    case "$APP_HTTP_BIND" in
      8083|*:8083)
        echo "HTTPS_BIND uses host port 8083, but APP_HTTP_BIND also publishes the app on 8083." >&2
        echo "Set APP_HTTP_BIND=127.0.0.1:18083 in .env, then run this script again." >&2
        exit 1
        ;;
    esac
    ;;
esac

mkdir -p nginx/certbot/conf nginx/certbot/www nginx/certbot/logs

echo "Creating temporary self-signed certificate for $DOMAIN..."
rm -rf "nginx/certbot/conf/live/$DOMAIN" \
       "nginx/certbot/conf/archive/$DOMAIN" \
       "nginx/certbot/conf/renewal/$DOMAIN.conf"
mkdir -p "nginx/certbot/conf/live/$DOMAIN"

docker run --rm \
  -e DOMAIN="$DOMAIN" \
  -v "$PWD/nginx/certbot/conf:/etc/letsencrypt" \
  alpine:3.20 sh -c '
    apk add --no-cache openssl >/dev/null
    openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
      -keyout "/etc/letsencrypt/live/$DOMAIN/privkey.pem" \
      -out "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" \
      -subj "/CN=$DOMAIN"
  '

echo "Starting AntiHlam app and nginx..."
docker compose --profile https up -d --build postgres app nginx

echo "Removing temporary certificate before requesting the real one..."
rm -rf "nginx/certbot/conf/live/$DOMAIN" \
       "nginx/certbot/conf/archive/$DOMAIN" \
       "nginx/certbot/conf/renewal/$DOMAIN.conf"

staging_arg=""
if [ "$CERTBOT_STAGING" = "1" ]; then
  staging_arg="--staging"
fi

echo "Requesting Let's Encrypt certificate for $DOMAIN..."
docker compose --profile https run --rm certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "$LETSENCRYPT_EMAIL" \
  --domain "$DOMAIN" \
  --rsa-key-size "$RSA_KEY_SIZE" \
  --agree-tos \
  --no-eff-email \
  --force-renewal \
  $staging_arg

echo "Reloading nginx..."
docker compose exec nginx nginx -s reload

echo "Done. Open https://$DOMAIN:$PUBLIC_HTTPS_PORT"
