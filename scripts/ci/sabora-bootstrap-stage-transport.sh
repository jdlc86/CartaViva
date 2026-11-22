#!/usr/bin/env bash
# Sabora-only one-time ZIP quarantine. Same script for manual and owner Issue.
# Never installs or executes ZIP contents, deploys, changes SQL or Fleetia.
set -euo pipefail
umask 077
[[ "${REVIEWED_MAIN_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || exit 1
[[ "${GITHUB_SHA:-}" == "$REVIEWED_MAIN_SHA" ]] || exit 1
set -euo pipefail
git fetch --no-tags origin main
test "$GITHUB_SHA" = "$REVIEWED_MAIN_SHA"
test "$(git rev-parse origin/main)" = "$GITHUB_SHA"
node scripts/ci/sabora-release-governor.mjs check-ci plan "$GITHUB_SHA"
set -euo pipefail
umask 077
if [[ -z "$SABORA_BOOTSTRAP_SSH_KEY_B64" || -z "$SABORA_BOOTSTRAP_KNOWN_HOSTS_B64" ]]; then
  echo 'SABORA_BOOTSTRAP_STAGE_SECRETS_UNAVAILABLE' >&2
  exit 1
fi
file="$RUNNER_TEMP/sabora-incoming/sabora-ci-launchers.zip"
node scripts/ci/sabora-cloud-bootstrap-verify.mjs archive "$file"
key="$RUNNER_TEMP/sabora-bootstrap-key"
known="$RUNNER_TEMP/sabora-bootstrap-known-hosts"
trap 'rm -f "$key" "$known"' EXIT
printf '%s' "$SABORA_BOOTSTRAP_SSH_KEY_B64" | base64 --decode > "$key"
printf '%s' "$SABORA_BOOTSTRAP_KNOWN_HOSTS_B64" | base64 --decode > "$known"
chmod 600 "$key" "$known"
# Require an unencrypted, short-lived Ed25519 transport key matching
# a separately approved client fingerprint; never prompt for passphrases.
pub="$(timeout 5s ssh-keygen -y -P '' -f "$key")"
[[ "$pub" == ssh-ed25519\ * ]]
[[ "$SABORA_BOOTSTRAP_CLIENT_ED25519_FINGERPRINT" =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]]
test "$(ssh-keygen -lf "$key" -E sha256 | awk '{print $2}')" = "$SABORA_BOOTSTRAP_CLIENT_ED25519_FINGERPRINT"
ssh-keygen -F 146.59.145.64 -f "$known" > /dev/null
test "$(wc -l < "$known")" -eq 1
test "$(awk '{print $1" "$2}' "$known")" = '146.59.145.64 ssh-ed25519'
[[ "$SABORA_BOOTSTRAP_HOST_ED25519_FINGERPRINT" =~ ^SHA256:[A-Za-z0-9+/]{43}$ ]]
test "$(ssh-keygen -lf "$known" -E sha256 | awk '{print $2}')" = "$SABORA_BOOTSTRAP_HOST_ED25519_FINGERPRINT"
# The host MUST force a preinstalled Sabora-only receiver. No shell,
# privileged command, SSH agent, SFTP, SCP, or runtime deployment.
receipt="$(cat "$file" | ssh -F /dev/null -T \
  -o BatchMode=yes -o NumberOfPasswordPrompts=0 \
  -o PasswordAuthentication=no -o KbdInteractiveAuthentication=no \
  -o IdentitiesOnly=yes -o IdentityAgent=none -o ForwardAgent=no \
  -o ClearAllForwardings=yes -o StrictHostKeyChecking=yes \
  -o HostKeyAlgorithms=ssh-ed25519 \
  -o UserKnownHostsFile="$known" -o ConnectTimeout=10 \
  -i "$key" -p 22 sabora-bootstrap@146.59.145.64 \
  'sabora-bootstrap-stage-v1 426960f0c6e645cd21575e0883e8a03638cc9e3a')"
test "$receipt" = 'SABORA_BOOTSTRAP_STAGED:a94c3d09ca371fe2cf021c9fe38bf4694e0c85af9b3c01092eddc6abda6faf5c'
echo 'SABORA_STAGE_ONLY_CONFIRMED: remote quarantine archive; no installation or deployment'
