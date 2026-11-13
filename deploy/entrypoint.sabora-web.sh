#!/bin/sh
# Fail closed before publishing any TLS listener. This is Sabora-only.
set -eu
fail(){ echo sabora_web_startup_failed >&2; exit 1; }
valid_hostname(){
 printf '%s' "$1" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
}
valid_bind_ip(){
 # The host's IPv4 may be shared with other applications; its TCP/8443 must
 # be Sabora-only. Reject wildcard mappings before running the listener.
 case "$1" in ""|"0.0.0.0"|"255.255.255.255") return 1 ;; esac
 printf '%s' "$1" | grep -Eq '^([0-9]{1,3}\\.){3}[0-9]{1,3}
[ -n "${SABORA_MANAGEMENT_HOST:-}" ] || fail
valid_hostname "$SABORA_CLIENT_HOST" || fail
valid_hostname "$SABORA_MANAGEMENT_HOST" || fail
[ "$SABORA_CLIENT_HOST" != "$SABORA_MANAGEMENT_HOST" ] || fail
for name in client.crt client.key management.crt management.key; do
 [ -f "/run/sabora/tls/$name" ] && [ -r "/run/sabora/tls/$name" ] || fail
done
exec "$@"
 || return 1
 old_ifs="$IFS"; IFS=.; set -- $1; IFS="$old_ifs"
 for octet in "$@"; do
  [ "$octet" -ge 0 ] && [ "$octet" -le 255 ] || return 1
 done
}
valid_bind_ip "${SABORA_INGRESS_BIND_IP:-}" || fail
[ -n "${SABORA_CLIENT_HOST:-}" ] || fail
[ -n "${SABORA_MANAGEMENT_HOST:-}" ] || fail
valid_hostname "$SABORA_CLIENT_HOST" || fail
valid_hostname "$SABORA_MANAGEMENT_HOST" || fail
[ "$SABORA_CLIENT_HOST" != "$SABORA_MANAGEMENT_HOST" ] || fail
for name in client.crt client.key management.crt management.key; do
 [ -f "/run/sabora/tls/$name" ] && [ -r "/run/sabora/tls/$name" ] || fail
done
exec "$@"
