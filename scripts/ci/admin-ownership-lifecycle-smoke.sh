#!/usr/bin/env bash
set -euo pipefail
# Full ownership lifecycle against the SAME disposable PostgreSQL 17 container.
# This script never accepts a host, URL or credential and cannot target Supabase/VPS.
container="${1:?disposable container name required}"

docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
insert into sabora.staff_members(user_id,role,state) values
 ('00000000-0000-0000-0000-000000000301','admin','active'),
 ('00000000-0000-0000-0000-000000000302','admin','active'),
 ('00000000-0000-0000-0000-000000000303','admin','active');
update sabora.admin_write_ownership
 set owner_user_id='00000000-0000-0000-0000-000000000301' where singleton;

-- ADMIN 302 requests ownership; ADMIN 301 accepts it atomically.
begin;
select owner_user_id from sabora.admin_write_ownership where singleton for update;
select user_id from sabora.staff_members
 where user_id in ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302')
 order by user_id for update;
insert into sabora.admin_ownership_proposals(id,kind,from_owner_id,to_owner_id,created_by,correlation_id)
 values ('00000000-0000-0000-0000-000000000311','request','00000000-0000-0000-0000-000000000301',
 '00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000302',
 '00000000-0000-0000-0000-000000000401');
insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id,request_payload,result_payload)
 values ('00000000-0000-0000-0000-000000000401','00000000-0000-0000-0000-000000000302','request',
 '00000000-0000-0000-0000-000000000311','00000000-0000-0000-0000-000000000301',
 '00000000-0000-0000-0000-000000000301','{"action":"request","actorUserId":"00000000-0000-0000-0000-000000000302","proposalId":null,"targetUserId":null,"reason":null}',
 '{"proposalId":"00000000-0000-0000-0000-000000000311","nextOwnerId":"00000000-0000-0000-0000-000000000301","status":"pending"}');
commit;

begin;
select owner_user_id from sabora.admin_write_ownership where singleton for update;
select user_id from sabora.staff_members
 where user_id in ('00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302')
 order by user_id for update;
select id from sabora.admin_ownership_proposals where id='00000000-0000-0000-0000-000000000311' for update;
update sabora.admin_write_ownership set owner_user_id='00000000-0000-0000-0000-000000000302',assigned_at=now() where singleton;
update sabora.admin_ownership_proposals set status='accepted',resolved_at=now()
 where id='00000000-0000-0000-0000-000000000311';
insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id,request_payload,result_payload)
 values ('00000000-0000-0000-0000-000000000402','00000000-0000-0000-0000-000000000301','accept',
 '00000000-0000-0000-0000-000000000311','00000000-0000-0000-0000-000000000301',
 '00000000-0000-0000-0000-000000000302','{"action":"accept"}','{"status":"accepted"}');
commit;

-- Owner offers to ADMIN 303; recipient rejects one offer and owner cancels another.
begin;
select owner_user_id from sabora.admin_write_ownership where singleton for update;
insert into sabora.admin_ownership_proposals(id,kind,from_owner_id,to_owner_id,created_by,correlation_id)
 values ('00000000-0000-0000-0000-000000000312','offer','00000000-0000-0000-0000-000000000302',
 '00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000302',
 '00000000-0000-0000-0000-000000000403');
insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id,request_payload,result_payload)
 values ('00000000-0000-0000-0000-000000000403','00000000-0000-0000-0000-000000000302','offer','00000000-0000-0000-0000-000000000312','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000302','{"action":"offer"}','{"status":"pending"}');
commit;
begin;
select owner_user_id from sabora.admin_write_ownership where singleton for update;
select id from sabora.admin_ownership_proposals where id='00000000-0000-0000-0000-000000000312' for update;
update sabora.admin_ownership_proposals set status='rejected',resolved_at=now()
 where id='00000000-0000-0000-0000-000000000312';
insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id,request_payload,result_payload)
 values ('00000000-0000-0000-0000-000000000404','00000000-0000-0000-0000-000000000303','reject','00000000-0000-0000-0000-000000000312','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000302','{"action":"reject"}','{"status":"rejected"}');
commit;
begin;
select owner_user_id from sabora.admin_write_ownership where singleton for update;
insert into sabora.admin_ownership_proposals(id,kind,from_owner_id,to_owner_id,created_by,correlation_id)
 values ('00000000-0000-0000-0000-000000000313','offer','00000000-0000-0000-0000-000000000302',
 '00000000-0000-0000-0000-000000000303','00000000-0000-0000-0000-000000000302',
 '00000000-0000-0000-0000-000000000405');
insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id,request_payload,result_payload)
 values ('00000000-0000-0000-0000-000000000405','00000000-0000-0000-0000-000000000302','offer','00000000-0000-0000-0000-000000000313','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000302','{"action":"offer","sequence":2}','{"status":"pending"}');
commit;
begin;
select owner_user_id from sabora.admin_write_ownership where singleton for update;
select id from sabora.admin_ownership_proposals where id='00000000-0000-0000-0000-000000000313' for update;
update sabora.admin_ownership_proposals set status='cancelled',resolved_at=now()
 where id='00000000-0000-0000-0000-000000000313';
insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id,request_payload,result_payload)
 values ('00000000-0000-0000-0000-000000000406','00000000-0000-0000-0000-000000000302','cancel','00000000-0000-0000-0000-000000000313','00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000302','{"action":"cancel"}','{"status":"cancelled"}');
commit;

-- ROOT uses only the governance control plane to force reassignment.
begin;
select owner_user_id from sabora.admin_write_ownership where singleton for update;
select user_id from sabora.staff_members
 where user_id in ('00000000-0000-0000-0000-000000000201','00000000-0000-0000-0000-000000000301')
 order by user_id for update;
update sabora.admin_write_ownership set owner_user_id='00000000-0000-0000-0000-000000000301',assigned_at=now() where singleton;
insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,previous_owner_id,next_owner_id,reason,request_payload,result_payload)
 values ('00000000-0000-0000-0000-000000000407','00000000-0000-0000-0000-000000000201','force_transfer',
 '00000000-0000-0000-0000-000000000302','00000000-0000-0000-0000-000000000301','Recovery',
 '{"action":"force","actorUserId":"00000000-0000-0000-0000-000000000201","proposalId":null,"targetUserId":"00000000-0000-0000-0000-000000000301","reason":"Recovery"}',
 '{"proposalId":null,"nextOwnerId":"00000000-0000-0000-0000-000000000301","status":"transferred"}');
commit;

do $checks$
begin
 if (select owner_user_id from sabora.admin_write_ownership where singleton)
    <> '00000000-0000-0000-0000-000000000301'::uuid then raise exception 'forced owner mismatch'; end if;
 if not (select request_payload =
   '{"reason":"Recovery","targetUserId":"00000000-0000-0000-0000-000000000301","proposalId":null,"actorUserId":"00000000-0000-0000-0000-000000000201","action":"force"}'::jsonb
   from sabora.admin_ownership_audit where correlation_id='00000000-0000-0000-0000-000000000407') then
  raise exception 'semantic JSONB replay mismatch';
 end if;
 if (select request_payload =
   '{"action":"force","actorUserId":"00000000-0000-0000-0000-000000000201","proposalId":null,"targetUserId":"00000000-0000-0000-0000-000000000301","reason":"changed"}'::jsonb
   from sabora.admin_ownership_audit where correlation_id='00000000-0000-0000-0000-000000000407') then
  raise exception 'altered replay accepted';
 end if;
 if (select count(*) from sabora.admin_ownership_audit where correlation_id between
    '00000000-0000-0000-0000-000000000401'::uuid and '00000000-0000-0000-0000-000000000407'::uuid) <> 7 then
  raise exception 'ownership lifecycle audit incomplete';
 end if;
end;
$checks$;
SQL

# A failure after changing the owner must roll the whole transaction back.
if docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
begin;
update sabora.admin_write_ownership set owner_user_id='00000000-0000-0000-0000-000000000302' where singleton;
insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,previous_owner_id,next_owner_id)
 values ('00000000-0000-0000-0000-000000000408','00000000-0000-0000-0000-000000000301','invalid_action',
 '00000000-0000-0000-0000-000000000301','00000000-0000-0000-0000-000000000302');
commit;
SQL
then
 echo 'mid-transaction failure unexpectedly committed' >&2
 exit 1
fi
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
do $$ begin
 if (select owner_user_id from sabora.admin_write_ownership where singleton)
   <> '00000000-0000-0000-0000-000000000301'::uuid then raise exception 'partial owner change survived rollback'; end if;
 if exists(select 1 from sabora.admin_ownership_audit where correlation_id='00000000-0000-0000-0000-000000000408') then
  raise exception 'partial audit survived rollback';
 end if;
end $$;
SQL

# Two transactions race from the same observed owner. The singleton makes the
# second revalidation stale, so only one new owner can become effective.
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' &
begin;
select owner_user_id from sabora.admin_write_ownership where singleton for update;
update sabora.admin_write_ownership set owner_user_id='00000000-0000-0000-0000-000000000302' where singleton;
select pg_sleep(2);
commit;
SQL
first=$!
sleep 0.3
set +e
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL' &
begin;
set local lock_timeout='8s';
do $$ declare current_owner uuid; begin
 select owner_user_id into current_owner from sabora.admin_write_ownership where singleton for update;
 if current_owner <> '00000000-0000-0000-0000-000000000301'::uuid then
  raise exception 'stale_owner' using errcode='42501';
 end if;
 update sabora.admin_write_ownership set owner_user_id='00000000-0000-0000-0000-000000000303' where singleton;
end $$;
commit;
SQL
second=$!
wait "$first"
first_status=$?
wait "$second"
second_status=$?
set -e
if [[ "$first_status" -ne 0 || "$second_status" -eq 0 ]]; then
 echo "unexpected ownership race results: first=$first_status second=$second_status" >&2
 exit 1
fi
docker exec -i "$container" psql -v ON_ERROR_STOP=1 -U postgres -d postgres -Atqc \
 "select case when owner_user_id='00000000-0000-0000-0000-000000000302'::uuid then 1 else 0 end from sabora.admin_write_ownership where singleton" | grep -Fx 1

echo 'Ownership request/offer/accept/reject/cancel/force, replay, rollback and two-session race passed.'
