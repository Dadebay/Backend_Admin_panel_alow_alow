#!/bin/sh
set -eu

: "${DEPLOY_SSH_HOST:?Set DEPLOY_SSH_HOST}"
: "${DEPLOY_SSH_USER:?Set DEPLOY_SSH_USER}"
: "${DEPLOY_SSH_KEY_FILE:?Set DEPLOY_SSH_KEY_FILE}"
: "${CERTBOT_TOKEN:?Certbot did not provide CERTBOT_TOKEN}"
: "${CERTBOT_VALIDATION:?Certbot did not provide CERTBOT_VALIDATION}"

case "$DEPLOY_SSH_HOST" in
  *[!A-Za-z0-9.:-]*) echo "Unsafe SSH host" >&2; exit 1 ;;
esac
case "$DEPLOY_SSH_USER" in
  ""|*[!A-Za-z0-9_-]*) echo "Unsafe SSH user" >&2; exit 1 ;;
esac
case "$CERTBOT_TOKEN" in
  ""|*[!A-Za-z0-9_-]*) echo "Unsafe ACME token" >&2; exit 1 ;;
esac
test -r "$DEPLOY_SSH_KEY_FILE"

printf '%s' "$CERTBOT_VALIDATION" \
  | ssh \
      -i "$DEPLOY_SSH_KEY_FILE" \
      -o IdentitiesOnly=yes \
      "$DEPLOY_SSH_USER@$DEPLOY_SSH_HOST" \
      "sudo tee '/var/lib/alowalow-acme/.well-known/acme-challenge/$CERTBOT_TOKEN' >/dev/null"
