#!/bin/sh
# Fail closed before publishing any TLS listener. This is Sabora-only.
set -eu
fail(){ echo sabora_web_startup_failed >&2; exit 1; }
valid_hostname(){
 printf '%s' "$1" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
}
[ -n "${SABORA_CLIENT_HOST:-}" ] || fail
[ -n "${SABORA_MANAGEMENT_HOST:-}" ] || fail
valid_hostname "$SABORA_CLIENT_HOST" || fail
valid_hostname "$SABORA_MANAGEMENT_HOST" || fail
[ "$SABORA_CLIENT_HOST" != "$SABORA_MANAGEMENT_HOST" ] || fail
for name in client.crt client.key management.crt management.key; do
 [ -f "/run/sabora/tls/$name" ] && [ -r "/run/sabora/tls/$name" ] || fail
done
exec "$@"
