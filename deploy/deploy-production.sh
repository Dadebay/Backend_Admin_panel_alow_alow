#!/bin/sh
set -eu

cd "$(dirname "$0")"

test -s .env.production
test -s .release.next.env

docker compose \
  --env-file .release.next.env \
  --file docker-compose.production.yml \
  pull

if [ -s .release.env ]; then
  cp .release.env .release.previous.env
fi
mv .release.next.env .release.env

if docker compose \
  --env-file .release.env \
  --file docker-compose.production.yml \
  up -d --wait; then
  exit 0
fi

if [ -s .release.previous.env ]; then
  cp .release.previous.env .release.env
  docker compose \
    --env-file .release.env \
    --file docker-compose.production.yml \
    up -d --wait
fi

exit 1
