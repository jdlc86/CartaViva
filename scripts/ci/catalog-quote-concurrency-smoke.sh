#!/usr/bin/env bash
set -euo pipefail
# Invoked only with the disposable, --network none PostgreSQL 17 container.
# This tests a database UNIQUE constraint under two independent connections;
# it does NOT prove the application writer's authorization or consent logic.
container="${1:?isolated PostgreSQL container name required}"
psql_ci() { docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres; }
psql_ci <<'SQL'
INSERT INTO sabora.dining_tables(id,number,capacity,qr_token_hash,session_id)
VALUES ('00000000-0000-4000-8000-000000009101',901003,4,decode(repeat('33',32),'hex'),
        '00000000-0000-4000-8000-000000009102');
INSERT INTO sabora.catalog_items(id,draft)
VALUES ('00000000-0000-4000-8000-000000009103','{}');
INSERT INTO sabora.orders(id,table_id,session_id,company,employee_number,confirmed_at,grouping,items)
VALUES
 ('00000000-0000-4000-8000-000000009104','00000000-0000-4000-8000-000000009101',
  '00000000-0000-4000-8000-000000009102','CI','actor',now(),'first',
  '[{"category":"main","name":"CI","quantity":1}]'),
 ('00000000-0000-4000-8000-000000009105','00000000-0000-4000-8000-000000009101',
  '00000000-0000-4000-8000-000000009102','CI','actor',now(),'grouped',
  '[{"category":"main","name":"CI","quantity":1}]');
INSERT INTO sabora.catalog_displayed_quotes
(id,table_id,session_id,visit_id,basket_id,actor_id,item_id,published_revision,
 subtotal_cents,discount_cents,total_cents,evidence,expires_at)
VALUES
('00000000-0000-4000-8000-000000009106','00000000-0000-4000-8000-000000009101',
 '00000000-0000-4000-8000-000000009102','visit-ci','basket-ci','actor-ci',
 '00000000-0000-4000-8000-000000009103',1,1000,0,1000,'{}',now()+interval '5 minutes');
SQL
first_sql=$(cat <<'SQL'
BEGIN;
INSERT INTO sabora.catalog_confirmation_attempts
(table_id,session_id,visit_id,basket_id,actor_id,item_id,request_key,
 request_fingerprint,quote_id,economic_evidence,order_id)
VALUES
('00000000-0000-4000-8000-000000009101','00000000-0000-4000-8000-000000009102',
 'visit-ci','basket-ci','actor-ci','00000000-0000-4000-8000-000000009103',
 'concurrent-001','first-request','00000000-0000-4000-8000-000000009106',
 '{}','00000000-0000-4000-8000-000000009104');
SELECT pg_sleep(3);
COMMIT;
SQL
)
second_sql=$(cat <<'SQL'
BEGIN;
SET LOCAL lock_timeout='10s';
INSERT INTO sabora.catalog_confirmation_attempts
(table_id,session_id,visit_id,basket_id,actor_id,item_id,request_key,
 request_fingerprint,quote_id,economic_evidence,order_id)
VALUES
('00000000-0000-4000-8000-000000009101','00000000-0000-4000-8000-000000009102',
 'visit-ci','basket-ci','actor-ci','00000000-0000-4000-8000-000000009103',
 'concurrent-001','second-request','00000000-0000-4000-8000-000000009106',
 '{}','00000000-0000-4000-8000-000000009105')
ON CONFLICT ON CONSTRAINT catalog_confirmation_idempotency DO NOTHING;
COMMIT;
SQL
)
# Wait for the first session to enter pg_sleep *after* its uncommitted insert.
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$first_sql" &
first_pid=$!
ready=0
for attempt in $(seq 1 70); do
 if ! kill -0 "$first_pid" 2>/dev/null; then break; fi
 state=$(docker exec "$container" psql -X -A -t -U postgres -d postgres -c \
  "SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%SELECT pg_sleep(3)%' AND state='active' AND pid<>pg_backend_pid();" | tr -d '[:space:]')
 if [[ "$state" == "1" ]]; then ready=1; break; fi
 sleep 0.05
done
if [[ "$ready" != 1 ]]; then
 wait "$first_pid" || true
 echo 'First transaction did not reach the expected uncommitted state' >&2
 exit 1
fi
docker exec -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d postgres <<<"$second_sql" &
second_pid=$!
wait "$first_pid"
wait "$second_pid"
# The competing request cannot create a second order confirmation.
psql_ci <<'SQL'
DO $verify$
DECLARE n integer; fp text;
BEGIN
 SELECT count(*),min(request_fingerprint) INTO n,fp
 FROM sabora.catalog_confirmation_attempts
 WHERE table_id='00000000-0000-4000-8000-000000009101'
  AND session_id='00000000-0000-4000-8000-000000009102'
  AND visit_id='visit-ci' AND basket_id='basket-ci' AND actor_id='actor-ci'
  AND request_key='concurrent-001';
 IF n<>1 OR fp<>'first-request' THEN
  RAISE EXCEPTION 'concurrent idempotency broken: count %, fingerprint %',n,fp;
 END IF;
END $verify$;
SQL
echo 'PASS: concurrent confirmation idempotency (two independent PostgreSQL sessions)'
