#!/usr/bin/env bash
# CI-only, SHA-locked cross-candidate rehearsal. This is NOT a merge or an
# operational migration: every SQL and app process lives on GitHub's ephemeral
# runner, never on Supabase, the VPS or a developer's working tree.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != "true" || -z "${GITHUB_RUN_ID:-}" ||
      -z "${RUNNER_TEMP:-}" || "${GITHUB_EVENT_NAME:-}" != "pull_request" ||
      "${GITHUB_HEAD_REF:-}" != "feat/sabora-s38-operational-activation-20261112" ]]; then
 echo 'sabora_cv005_b2_disposable_runner_required' >&2; exit 1
fi
cv005=.cv005-exact-pin
expected_sha=a60548955d559da7ecc4b686f59c01974298dd46
test -d "$cv005/.git" || { echo 'sabora_cv005_missing_pinned_checkout' >&2; exit 1; }
actual_sha="$(git -C "$cv005" rev-parse HEAD)"
[[ "$actual_sha" == "$expected_sha" ]] || {
 echo 'sabora_cv005_sha_drift_denied' >&2; exit 1
}
# Only previously enumerated Sabora SQL migration paths may be overlaid.
# Compare strict 99/99 inventories, count the reviewed 61 modifications. The
# correction adds transaction boundaries to two previously exceptional files.
mapfile -t main_files < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort)
mapfile -t candidate_files < <(find "$cv005/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort)
[[ "${#main_files[@]}" -eq 99 && "${#candidate_files[@]}" -eq 99 ]] || {
 echo 'sabora_cv005_unexpected_migration_inventory' >&2; exit 1
}
for i in "${!main_files[@]}"; do
 [[ "${main_files[i]}" == "${candidate_files[i]}" ]] || {
  echo 'sabora_cv005_migration_inventory_diff_denied' >&2; exit 1
 }
done
changed=0
for filename in "${main_files[@]}"; do
 [[ "$filename" =~ ^[0-9]{14}_[A-Za-z0-9_-]+\.sql$ ]] || {
  echo 'sabora_cv005_sql_path_denied' >&2; exit 1
 }
 if ! cmp -s "supabase/migrations/$filename" "$cv005/supabase/migrations/$filename"; then
  changed=$((changed+1))
 fi
done
[[ "$changed" -eq 61 ]] || {
 echo "sabora_cv005_expected_61_sql_changes_found_$changed" >&2; exit 1
}
# Provenance: the source is the exact SHA checkout. GitHub's runner is
# destroyed; no SQL is written back to either PR or main.
for filename in "${main_files[@]}"; do
 cp -- "$cv005/supabase/migrations/$filename" "supabase/migrations/$filename"
done
# Bring in the matching NO-SUPERUSER fixture code and contractual assertions
# from the same pinned SHA; do not use the older main smoke implementation.
for filename in \
 scripts/ci/supabase-nonsuperuser-migration-smoke.sh \
 scripts/ci/postgres-migration-harness-contract.test.mjs \
 .github/workflows/supabase-nonsuperuser-compatibility.yml; do
 test -f "$cv005/$filename" || { echo 'sabora_cv005_missing_rehearsal_file' >&2; exit 1; }
 cp -- "$cv005/$filename" "$filename"
done
rm -rf -- "$cv005"
test ! -e "$cv005"
echo 'sabora_cv005_b2_cross_candidate_sha_locked:99_sql:61_changed'
node scripts/ci/migration-audit.mjs
