#!/usr/bin/env bash
# Candidate root-owned forced-command for the one-time Sabora bootstrap account.
# It receives ONE immutable archive into a private quarantine; it cannot install.
set -euo pipefail
umask 077
readonly EXPECTED_CMD='sabora-bootstrap-stage-v1 426960f0c6e645cd21575e0883e8a03638cc9e3a'
readonly EXPECTED_SHA='a94c3d09ca371fe2cf021c9fe38bf4694e0c85af9b3c01092eddc6abda6faf5c'
readonly DEST='/home/sabora-bootstrap/.sabora-original-launchers-426960f0.zip'
[[ "$(id -un)" == 'sabora-bootstrap' ]] || exit 67
[[ "${SSH_ORIGINAL_COMMAND-}" == "$EXPECTED_CMD" ]] || exit 68
[[ -d /home/sabora-bootstrap && ! -L /home/sabora-bootstrap ]] || exit 69
[[ ! -e "$DEST" && ! -L "$DEST" ]] || exit 70
# Fixed destination, no extraction, no shell selected by the remote caller.
# Oversized/partial streams leave a quarantined file: no automatic retry/delete.
set -C
head -c 8793 > "$DEST"
[[ "$(stat -c '%s' -- "$DEST")" == '8792' ]] || exit 71
printf '%s  %s\n' "$EXPECTED_SHA" "$DEST" | sha256sum -c --status || exit 72
printf 'SABORA_BOOTSTRAP_STAGED:%s\n' "$EXPECTED_SHA"
