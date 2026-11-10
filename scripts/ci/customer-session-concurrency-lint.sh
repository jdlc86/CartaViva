#!/usr/bin/env bash
set -euo pipefail
# CI-only static safety check. Never connects to Supabase or VPS.
file="scripts/ci/customer-session-concurrency-smoke.sh"
bash -n "$file"
# Ensure both independent workers are awaited and both SQL results are checked.
grep -Fq 'pids+=("$!")' "$file"
grep -Fq 'wait "$pid"' "$file"
grep -Fq 'Missing or ambiguous UPDATE result' "$file"
grep -Fq 'Expected exactly one successful revocation' "$file"
grep -Fq 'revoked_at IS NOT NULL' "$file"
