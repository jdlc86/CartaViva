-- A single MVCC snapshot, transaction READ ONLY. No temporary objects, DDL, DML, or COPY.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT row_to_json(observation)::text
FROM (
  SELECT
    current_database()::text AS database,
    session_user::text AS session_user,
    current_user::text AS effective_user,
    current_setting('server_version_num')::integer / 10000 AS postgres_major,
    (SELECT system_identifier::text FROM pg_catalog.pg_control_system()) AS system_identifier,
    (SELECT s.ssl FROM pg_catalog.pg_stat_ssl s WHERE s.pid=pg_backend_pid()) AS ssl_active,
    (SELECT s.version FROM pg_catalog.pg_stat_ssl s WHERE s.pid=pg_backend_pid()) AS ssl_version,
    (SELECT e.extversion::text FROM pg_catalog.pg_extension e
      JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace
      WHERE e.extname='pgcrypto' AND n.nspname='extensions') AS pgcrypto_version,
    (SELECT COALESCE(jsonb_agg(n.nspname ORDER BY n.nspname),'[]'::jsonb)
      FROM pg_catalog.pg_namespace n WHERE n.nspname ~* '(sabora|cartaviva)') AS project_schemas,
    (SELECT COALESCE(jsonb_agg(r.rolname ORDER BY r.rolname),'[]'::jsonb)
      FROM pg_catalog.pg_roles r WHERE r.rolname ~* '(sabora|cartaviva)') AS project_roles,
    (SELECT COALESCE(jsonb_agg(parent.rolname||':'||member.rolname ORDER BY parent.rolname,member.rolname),'[]'::jsonb)
      FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles parent ON parent.oid=m.roleid
      JOIN pg_catalog.pg_roles member ON member.oid=m.member
      WHERE parent.rolname ~* '(sabora|cartaviva)' OR member.rolname ~* '(sabora|cartaviva)') AS project_memberships,
    (SELECT COALESCE(jsonb_agg(n.nspname||'.'||c.relname ORDER BY n.nspname,c.relname),'[]'::jsonb)
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname ~* '(sabora|cartaviva)' OR c.relname ~* '(sabora|cartaviva)') AS project_relations,
    (SELECT COALESCE(jsonb_agg(n.nspname||'.'||p.proname ORDER BY n.nspname,p.proname),'[]'::jsonb)
      FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname ~* '(sabora|cartaviva)' OR p.proname ~* '(sabora|cartaviva)') AS project_routines,
    (SELECT COALESCE(jsonb_agg(n.nspname||'.'||t.typname ORDER BY n.nspname,t.typname),'[]'::jsonb)
      FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname ~* '(sabora|cartaviva)' OR t.typname ~* '(sabora|cartaviva)') AS project_types,
    (SELECT COALESCE(jsonb_agg(t.tgname ORDER BY t.tgname),'[]'::jsonb)
      FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE t.tgname ~* '(sabora|cartaviva)' OR n.nspname ~* '(sabora|cartaviva)' OR c.relname ~* '(sabora|cartaviva)') AS project_triggers,
    (SELECT COALESCE(jsonb_agg(p.polname ORDER BY p.polname),'[]'::jsonb)
      FROM pg_catalog.pg_policy p JOIN pg_catalog.pg_class c ON c.oid=p.polrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE p.polname ~* '(sabora|cartaviva)' OR n.nspname ~* '(sabora|cartaviva)' OR c.relname ~* '(sabora|cartaviva)') AS project_policies,
    (SELECT COALESCE(jsonb_agg(e.evtname ORDER BY e.evtname),'[]'::jsonb)
      FROM pg_catalog.pg_event_trigger e WHERE e.evtname ~* '(sabora|cartaviva)') AS project_event_triggers,
    (SELECT COALESCE(jsonb_agg(d.defaclobjtype::text||':'||r.rolname ORDER BY d.defaclobjtype::text,r.rolname),'[]'::jsonb)
      FROM pg_catalog.pg_default_acl d JOIN pg_catalog.pg_roles r ON r.oid=d.defaclrole
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid=d.defaclnamespace
      WHERE r.rolname ~* '(sabora|cartaviva)' OR n.nspname ~* '(sabora|cartaviva)') AS project_default_acls,
    (to_regclass('sabora_migration_meta.applied_migrations') IS NOT NULL) AS ledger_exists,
    (to_regclass('sabora.restaurant_settings') IS NOT NULL) AS core_exists,
    to_char(transaction_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS observed_at
) observation;
ROLLBACK;
