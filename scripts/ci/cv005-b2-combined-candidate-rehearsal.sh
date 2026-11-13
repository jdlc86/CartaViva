#!/usr/bin/env bash
# This is an immutable two-parent Git integration candidate, NOT a SQL
# overlay. The real code and migrations in HEAD must already equal CV-005.
# The only test target is a disposable GitHub PR runner, never Supabase/VPS.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != "true" || -z "${GITHUB_RUN_ID:-}" ||
      -z "${RUNNER_TEMP:-}" || "${GITHUB_EVENT_NAME:-}" != "pull_request" ||
      "${GITHUB_HEAD_REF:-}" != "feat/sabora-s38-operational-activation-20261112" ]]; then
 echo 'sabora_integrated_pg17_disposable_runner_required' >&2; exit 1
fi
cv005=.cv005-exact-pin
expected_sha=a60548955d559da7ecc4b686f59c01974298dd46
test -d "$cv005/.git" || { echo 'sabora_cv005_missing_pinned_checkout' >&2; exit 1; }
actual_sha="$(git -C "$cv005" rev-parse HEAD)"
[[ "$actual_sha" == "$expected_sha" ]] || {
 echo 'sabora_cv005_sha_drift_denied' >&2; exit 1
}
git cat-file -e "$expected_sha^{commit}" || {
 echo 'sabora_integrated_parent_not_fetched' >&2; exit 1
}
git merge-base --is-ancestor "$expected_sha" HEAD || {
 echo 'sabora_cv005_not_in_integrated_git_history' >&2; exit 1
}
git rev-parse --verify origin/main >/dev/null || {
 echo 'sabora_integrated_main_ref_missing' >&2; exit 1
}
mapfile -t integrated_files < <(find supabase/migrations -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort)
mapfile -t cv005_files < <(find "$cv005/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -printf '%f\n' | LC_ALL=C sort)
[[ "${#integrated_files[@]}" -eq 99 && "${#cv005_files[@]}" -eq 99 ]] || {
 echo 'sabora_cv005_unexpected_migration_inventory' >&2; exit 1
}
for i in "${!integrated_files[@]}"; do
 filename="${integrated_files[i]}"
 [[ "$filename" == "${cv005_files[i]}" &&
    "$filename" =~ ^[0-9]{14}_[A-Za-z0-9_-]+\.sql$ ]] || {
  echo 'sabora_cv005_migration_inventory_diff_denied' >&2; exit 1
 }
 cmp -s "supabase/migrations/$filename" "$cv005/supabase/migrations/$filename" || {
  echo 'sabora_cv005_integrated_sql_blob_mismatch' >&2; exit 1
 }
done
# All nine non-SQL files are part of CV-005's reviewed installation contract.
for filename in \
 .github/workflows/supabase-nonsuperuser-compatibility.yml \
 docs/reviews/SABORA_CV005_SUPABASE_NONSUPERUSER_MIGRATION_REHEARSAL_2026-11-12.md \
 docs/reviews/SABORA_CV005_SUPABASE_OWNER_SEAL_EXCEPTION_PROPOSAL_2026-11-12.md \
 docs/security/SABORA_CV005_PG17_DBA_OWNER_AUTHORITY_DECISION_2026-11-12.md \
 docs/security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md \
 scripts/ci/postgres-migration-chain-smoke.sh \
 scripts/ci/postgres-migration-harness-contract.test.mjs \
 scripts/ci/sabora-pg17-owner-admission.sql \
 scripts/ci/supabase-nonsuperuser-migration-smoke.sh; do
 test -f "$filename" && test -f "$cv005/$filename" &&
 cmp -s "$filename" "$cv005/$filename" || {
  echo 'sabora_cv005_integrated_contract_blob_mismatch' >&2; exit 1
 }
done
mapfile -t different < <(git diff --name-only origin/main -- supabase/migrations/ | LC_ALL=C sort)
[[ "${#different[@]}" -eq 61 ]] || {
 echo "sabora_cv005_expected_61_sql_delta_found_${#different[@]}" >&2; exit 1
}
rm -rf -- "$cv005"
test ! -e "$cv005"
echo 'sabora_cv005_b2_single_git_tree_integrated_verified:99_sql:61_changed:two_parent_ancestry'
node scripts/ci/migration-audit.mjs
