#!/bin/sh
set -eu

cd "$(dirname "$0")"

test -s .release.next.env

runtime_env_file=$(sed -n 's/^ALOWALOW_ENV_FILE=//p' .release.next.env | tail -n 1)
runtime_env_file=${runtime_env_file:-.env.production}
case "$runtime_env_file" in
  /*|*..*)
    echo "ALOWALOW_ENV_FILE must stay inside the deployment directory" >&2
    exit 1
    ;;
esac
test -s "$runtime_env_file"

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
