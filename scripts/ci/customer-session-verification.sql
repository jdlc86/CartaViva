-- Read-only verification of private customer sessions. This is intentionally
-- NOT a public RPC and does not grant SQL permissions to browser identities.
-- This disposable-PostgreSQL smoke exercises the exact query used by the API.
begin;
do $customer_session_verification$
declare v_customer uuid; v_hash bytea; v_found uuid; v_session uuid;
begin
 select id into v_customer from sabora.customer_profiles limit 1;
 v_hash := decode(repeat('de',32),'hex');
 insert into sabora.customer_sessions(customer_id,token_hash,expires_at)
 values (v_customer,v_hash,now()+interval '1 day') returning id into v_session;
 select s.customer_id into v_found
 from sabora.customer_sessions s join sabora.customer_profiles p on p.id=s.customer_id
 where s.token_hash=v_hash and s.revoked_at is null and s.expires_at>now() limit 1;
 if v_found is distinct from v_customer then raise exception 'valid session rejected'; end if;
 update sabora.customer_sessions set revoked_at=now() where id=v_session;
 select s.customer_id into v_found
 from sabora.customer_sessions s join sabora.customer_profiles p on p.id=s.customer_id
 where s.token_hash=v_hash and s.revoked_at is null and s.expires_at>now() limit 1;
 if v_found is not null then raise exception 'revoked session accepted'; end if;
 update sabora.customer_sessions set revoked_at=null,created_at=now()-interval '2 days',expires_at=now()-interval '1 day' where id=v_session;
 select s.customer_id into v_found
 from sabora.customer_sessions s join sabora.customer_profiles p on p.id=s.customer_id
 where s.token_hash=v_hash and s.revoked_at is null and s.expires_at>now() limit 1;
 if v_found is not null then raise exception 'expired session accepted'; end if;
 select s.customer_id into v_found
 from sabora.customer_sessions s join sabora.customer_profiles p on p.id=s.customer_id
 where s.token_hash=decode(repeat('ee',32),'hex') and s.revoked_at is null and s.expires_at>now() limit 1;
 if v_found is not null then raise exception 'unknown session accepted'; end if;
end;
$customer_session_verification$;
rollback;
