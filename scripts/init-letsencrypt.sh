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

cleanup_cert_paths() {
  rm -rf "nginx/certbot/conf/live/$DOMAIN" \
         "nginx/certbot/conf/archive/$DOMAIN" \
         "nginx/certbot/conf/renewal/$DOMAIN.conf"
}

create_dummy_certificate() {
  cleanup_cert_paths
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
}

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
create_dummy_certificate

echo "Starting AntiHlam app and nginx..."
docker compose --profile https up -d --build postgres app nginx

probe_token="anti-hlam-probe-$(date +%s)"
probe_dir="nginx/certbot/www/.well-known/acme-challenge"
mkdir -p "$probe_dir"
printf 'ok\n' > "$probe_dir/$probe_token"

if ! curl -fsS "http://127.0.0.1/.well-known/acme-challenge/$probe_token" | grep -q '^ok$'; then
  echo "nginx is not serving local Let's Encrypt challenge files on port 80." >&2
  rm -f "$probe_dir/$probe_token"
  exit 1
fi

rm -f "$probe_dir/$probe_token"

echo "Removing temporary certificate before requesting the real one..."
cleanup_cert_paths

certbot_args=(
  certonly
  --webroot
  --webroot-path /var/www/certbot
  --email "$LETSENCRYPT_EMAIL"
  --domain "$DOMAIN"
  --rsa-key-size "$RSA_KEY_SIZE"
  --agree-tos
  --no-eff-email
  --force-renewal
)

if [ "$CERTBOT_STAGING" = "1" ]; then
  certbot_args+=(--staging)
fi

echo "Requesting Let's Encrypt certificate for $DOMAIN..."
if ! docker compose --profile https run --rm certbot "${certbot_args[@]}"; then
  echo "Certbot failed. Restoring temporary certificate so nginx can keep starting." >&2
  create_dummy_certificate
  docker compose restart nginx >/dev/null || true
  exit 1
fi

echo "Reloading nginx..."
docker compose exec nginx nginx -s reload

echo "Done. Open https://$DOMAIN:$PUBLIC_HTTPS_PORT"
