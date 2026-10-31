#!/usr/bin/env bash
# One-entry H6 acceptance: deterministic fail-closed, disposable PG17 only.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != true || -z "${RUNNER_TEMP:-}" || -z "${GITHUB_RUN_ID:-}" ]]; then
  echo 'H6 acceptance requires an isolated GitHub Actions runner' >&2
  exit 1
fi
report_dir="${RUNNER_TEMP}/sabora-h6-acceptance"
mkdir -p "$report_dir"
summary="$report_dir/summary.md"
printf '# H6 acceptance — run %s\n\n' "$GITHUB_RUN_ID" > "$summary"
overall=0
run_block() {
  local name="$1" label="$2"
  shift 2
  local log="$report_dir/${name}.log"
  printf '## %s\n\n' "$label" >> "$summary"
  printf '[H6] START %s\n' "$label"
  local code=0
  "$@" > "$log" 2>&1 || code=$?
  if [[ "$code" -eq 0 ]]; then
    printf -- '- PASS (exit 0)\n\n' >> "$summary"
    printf '[H6] PASS %s\n' "$label"
  else
    printf -- '- FAIL (exit %s). See artifact %s.log\n\n' "$code" "$name" >> "$summary"
    printf '[H6] FAIL %s (exit %s)\n' "$label" "$code" >&2
    # Node TAP may report failures far before the final summary.
    if grep -q '^not ok ' "$log"; then
      grep -n -A 25 -B 3 '^not ok ' "$log" >&2 || true
    fi
    tail -n 35 "$log" >&2 || true
    overall=1
  fi
}
# Fast tests are a hard prerequisite: no expensive database startup on failure.
run_block contracts 'Block 1: normative, contract and service tests' pnpm test
if [[ "$overall" -eq 0 ]]; then
  run_block migrations 'Block 2A: isolated PostgreSQL 17 migration and privilege gates' bash scripts/ci/postgres-migration-smoke.sh
fi
if [[ "$overall" -eq 0 ]]; then
  run_block integrated 'Block 2B: real PostgreSQL 17, HMAC, concurrency and Chromium E2E' bash scripts/ci/catalog-postgres17-node-driver-smoke.sh
fi
if [[ "$overall" -ne 0 ]]; then
  printf '\n**NO-GO**: stop on first failing block. No automatic edits, deployment or privilege escalation.\n' >> "$summary"
else
  printf '\n**CI gate PASS**. Activation still requires independently approved API wiring, security preflight and review.\n' >> "$summary"
fi
if [[ -n "${GITHUB_STEP_SUMMARY:-}" ]]; then cat "$summary" >> "$GITHUB_STEP_SUMMARY"; fi
exit "$overall"
