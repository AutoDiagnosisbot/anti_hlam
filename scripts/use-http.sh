#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

# Build before releasing the public port so a build failure leaves the app available.
docker compose build app

if [ -f .env ]; then
  backup=".env.before-http.$(date +%Y%m%d_%H%M%S)"
  cp -p .env "$backup"
  echo "Saved settings to $backup"
  if grep -q '^APP_HTTP_BIND=' .env; then
    sed -i 's/^APP_HTTP_BIND=.*/APP_HTTP_BIND=8083/' .env
  else
    printf '\nAPP_HTTP_BIND=8083\n' >> .env
  fi
else
  printf 'APP_HTTP_BIND=8083\n' > .env
fi

export APP_HTTP_BIND=8083
export COMPOSE_PROFILES=
docker compose config --quiet
docker compose --profile https stop nginx
docker compose up -d postgres app

for attempt in {1..30}; do
  if curl -fsS http://127.0.0.1:8083/api/health; then
    printf '\nHTTP is running on port 8083. Open http://<host-ip>:8083/\n'
    exit 0
  fi
  sleep 1
done

echo "HTTP health check failed. Check docker compose logs app." >&2
exit 1
