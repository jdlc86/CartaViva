#!/usr/bin/env bash
set -euo pipefail
# Local, network-isolated CI container; use PostgreSQL peer-free TCP inside container.
container="${1:?isolated PostgreSQL CI container required}"
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres < scripts/ci/customer-session-login-fixture.sql
# Authenticate as a genuine LOGIN, not postgres with SET ROLE. No network port exposed.
run_login() {
 docker exec -i -e PGPASSWORD=ci_disposable_only "$container" psql -X -v ON_ERROR_STOP=1 -U sabora_customer_session_login -h 127.0.0.1 -d postgres -Atq "$@"
}
# Default login must not have schema USAGE/CREATE or direct table privileges.
# has_function_privilege() on schema-qualified names itself requires USAGE
# and would abort before returning false; check schema first.
run_login <<'SQL' | grep -qx 'f|f'
SELECT has_schema_privilege(current_user,'sabora','USAGE'),
has_schema_privilege(current_user,'sabora','CREATE');
SQL
# Explicit SET ROLE grants only scoped RPCs, never direct SELECT/UPDATE.
run_login <<'SQL' | grep -qx 't|t|f|f'
SET ROLE sabora_customer_session_runtime;
SELECT has_function_privilege(current_user,'sabora.verify_customer_session_hash(bytea)','EXECUTE'),
has_function_privilege(current_user,'sabora.revoke_customer_session_hash(bytea)','EXECUTE'),
has_table_privilege(current_user,'sabora.customer_sessions','SELECT'),
has_table_privilege(current_user,'sabora.customer_sessions','UPDATE');
SQL
# Negative query must fail; no direct table read even after SET ROLE.
if run_login <<'SQL' >/dev/null 2>&1
SET ROLE sabora_customer_session_runtime;
SELECT count(*) FROM sabora.customer_sessions;
SQL
then
 echo 'ERROR: session login read protected table' >&2
 exit 1
fi
# A different role cannot be selected by the login.
if run_login <<'SQL' >/dev/null 2>&1
SET ROLE sabora_customer_session_fn_owner;
SELECT current_user;
SQL
then
 echo 'ERROR: session login assumed function owner' >&2
 exit 1
fi

# Seed fixture through PostgreSQL admin in disposable container only.
docker exec -i "$container" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
INSERT INTO sabora.customer_profiles(public_id,alias)
VALUES ('SB-WWWWWWWWWWWW','Login RPC CI');
INSERT INTO sabora.customer_sessions(customer_id,token_hash,expires_at)
SELECT id,decode(repeat('e7',32),'hex'),now()+interval '1 day'
FROM sabora.customer_profiles WHERE public_id='SB-WWWWWWWWWWWW';
SQL
# Execute actual verify + revoke through authenticated LOGIN with scoped SET ROLE.
run_login < scripts/ci/customer-session-login-rpc-smoke.sql
# The token was revoked; another invocation cannot re-authenticate it.
run_login <<'SQL' | grep -qx '0|f'
SET ROLE sabora_customer_session_runtime;
SELECT (SELECT count(*) FROM sabora.verify_customer_session_hash(decode(repeat('e7',32),'hex'))),
sabora.revoke_customer_session_hash(decode(repeat('e7',32),'hex'));
SQL
