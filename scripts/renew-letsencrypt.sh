#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env
  set +a
fi

docker compose --profile https run --rm certbot renew \
  --webroot \
  --webroot-path /var/www/certbot

docker compose exec nginx nginx -s reload
