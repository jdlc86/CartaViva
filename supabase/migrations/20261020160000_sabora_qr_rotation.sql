-- Draft only. QR rotation is restricted to a future authenticated backend role.
-- The caller must first verify restaurant membership and authorization.
begin;

create or replace function sabora.rotate_table_qr(
  p_restaurant_id uuid,
  p_table_id uuid,
  p_new_token text
)
returns table (new_qr_version integer, new_session_id uuid)
language plpgsql
security invoker
set search_path = pg_catalog, sabora
as $$
declare
  v_version integer;
  v_session uuid;
begin
  if p_restaurant_id is null or p_table_id is null or p_new_token is null
    or length(p_new_token) < 32 or length(p_new_token) > 512 then
    raise exception 'invalid_qr_rotation_input' using errcode = '22023';
  end if;

  -- Row-level update serializes against confirm_order's FOR UPDATE lock.
  -- Previous tokens become invalid immediately on commit; prior orders remain.
  update sabora.dining_tables t
    set qr_token_hash = sha256(convert_to(p_new_token, 'UTF8')),
        qr_version = t.qr_version + 1,
        session_id = gen_random_uuid(),
        first_confirmed_at = null
    where t.restaurant_id = p_restaurant_id and t.id = p_table_id
    returning t.qr_version, t.session_id into v_version, v_session;

  if not found then
    raise exception 'table_not_found' using errcode = 'P0002';
  end if;

  return query select v_version, v_session;
end;
$$;

revoke all on function sabora.rotate_table_qr(uuid,uuid,text) from public, anon, authenticated;
commit;
