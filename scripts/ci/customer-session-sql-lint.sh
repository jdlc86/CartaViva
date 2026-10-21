#!/usr/bin/env bash
set -euo pipefail
# Static gate for SQL fixture integrity, before disposable PostgreSQL CI.
files=(
 scripts/ci/customer-session-privileges-positive.sql
 scripts/ci/customer-session-privileges-hardening.sql
 scripts/ci/customer-session-rpc-concurrency-fixture.sql
)
for file in "${files[@]}"; do
 test -s "$file"
 if grep -Eq '^DO \$$' "$file"; then
  echo "Malformed PL/pgSQL delimiter in $file" >&2
  exit 1
 fi
done
# The named delimiter protects the registration fixture against prior corruption.
grep -Fq 'DO $fixture$' scripts/ci/customer-session-privileges-positive.sql
grep -Fq 'END $fixture$;' scripts/ci/customer-session-privileges-positive.sql
# SECURITY DEFINER functions must have an explicit search_path and no PUBLIC execution.
for file in scripts/ci/customer-session-privileges-positive.sql scripts/ci/customer-session-rpc-concurrency-fixture.sql; do
 grep -Fq 'SECURITY DEFINER SET search_path' "$file"
 grep -Fq 'REVOKE ALL ON FUNCTION' "$file"
done
