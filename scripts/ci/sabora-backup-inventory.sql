select 'roles:'||md5(coalesce(string_agg(
 rolname||':'||rolsuper||':'||rolinherit||':'||rolcreaterole||':'||rolcreatedb||':'||
 rolcanlogin||':'||rolreplication||':'||rolbypassrls||':'||rolconnlimit,
 E'\n' order by rolname),''))
from pg_roles where rolname in ('anon','authenticated','cv005_recovery_provider_dba')
 or rolname like 'sabora\_%' escape '\';

select 'memberships:'||md5(coalesce(string_agg(
 parent.rolname||':'||member.rolname||':'||grantor.rolname||':'||membership.admin_option||':'||
 membership.set_option||':'||membership.inherit_option,
 E'\n' order by parent.rolname,member.rolname,grantor.rolname),''))
from pg_auth_members membership
join pg_roles parent on parent.oid=membership.roleid
join pg_roles member on member.oid=membership.member
join pg_roles grantor on grantor.oid=membership.grantor
where (parent.rolname in ('anon','authenticated','cv005_recovery_provider_dba')
       or parent.rolname like 'sabora\_%' escape '\')
   or (member.rolname in ('anon','authenticated','cv005_recovery_provider_dba')
       or member.rolname like 'sabora\_%' escape '\');

select 'extensions:'||md5(coalesce(string_agg(e.extname||':'||e.extversion||':'||n.nspname,
 E'\n' order by e.extname),''))
from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto';

select 'schemas:'||md5(coalesce(string_agg(
 n.nspname||':'||pg_get_userbyid(n.nspowner)||':'||coalesce(n.nspacl::text,'NULL'),
 E'\n' order by n.nspname),''))
from pg_namespace n where n.nspname in ('sabora','sabora_migration_meta');

select 'relations:'||md5(coalesce(string_agg(
 n.nspname||':'||c.relname||':'||c.relkind::text||':'||pg_get_userbyid(c.relowner)||':'||
 c.relrowsecurity||':'||c.relforcerowsecurity||':'||coalesce(c.relacl::text,'NULL'),
 E'\n' order by n.nspname,c.relname,c.relkind),''))
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('sabora','sabora_migration_meta') and c.relkind in ('r','p','v','m','S','f');

select 'columns:'||md5(coalesce(string_agg(
 n.nspname||':'||c.relname||':'||a.attnum||':'||a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||
 a.attnotnull||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),'NULL'),
 E'\n' order by n.nspname,c.relname,a.attnum),''))
from pg_attribute a
join pg_class c on c.oid=a.attrelid
join pg_namespace n on n.oid=c.relnamespace
left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where n.nspname in ('sabora','sabora_migration_meta') and a.attnum>0 and not a.attisdropped;

select 'policies:'||md5(coalesce(string_agg(
 schemaname||':'||tablename||':'||policyname||':'||permissive||':'||roles::text||':'||cmd||':'||
 coalesce(qual,'NULL')||':'||coalesce(with_check,'NULL'),
 E'\n' order by schemaname,tablename,policyname),''))
from pg_policies where schemaname in ('sabora','sabora_migration_meta');

select 'functions:'||md5(coalesce(string_agg(
 n.nspname||':'||p.proname||':'||pg_get_function_identity_arguments(p.oid)||':'||
 pg_get_userbyid(p.proowner)||':'||p.prosecdef||':'||p.provolatile::text||':'||
 coalesce(array_to_string(p.proconfig,','),'NULL')||':'||coalesce(p.proacl::text,'NULL')||':'||
 md5(pg_get_functiondef(p.oid)),
 E'\n' order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),''))
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname in ('sabora','sabora_migration_meta');

select 'constraints:'||md5(coalesce(string_agg(
 n.nspname||':'||c.conname||':'||c.contype::text||':'||c.convalidated||':'||pg_get_constraintdef(c.oid,true),
 E'\n' order by n.nspname,c.conname),''))
from pg_constraint c join pg_namespace n on n.oid=c.connamespace
where n.nspname in ('sabora','sabora_migration_meta');

select 'indexes:'||md5(coalesce(string_agg(
 schemaname||':'||indexname||':'||indexdef,E'\n' order by schemaname,indexname),''))
from pg_indexes where schemaname in ('sabora','sabora_migration_meta');

select 'triggers:'||md5(coalesce(string_agg(
 n.nspname||':'||c.relname||':'||t.tgname||':'||t.tgenabled::text||':'||pg_get_triggerdef(t.oid,true),
 E'\n' order by n.nspname,c.relname,t.tgname),''))
from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname in ('sabora','sabora_migration_meta') and not t.tgisinternal;

select 'default-acls:'||md5(coalesce(string_agg(
 pg_get_userbyid(d.defaclrole)||':'||coalesce(n.nspname,'NULL')||':'||d.defaclobjtype::text||':'||d.defaclacl::text,
 E'\n' order by pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype),''))
from pg_default_acl d left join pg_namespace n on n.oid=d.defaclnamespace
where n.nspname in ('sabora','sabora_migration_meta');

create temporary table sabora_backup_data_fingerprints(
 schema_name text not null,object_name text not null,row_count bigint not null,data_md5 text not null,
 primary key(schema_name,object_name)
);
do $sabora_backup$
declare item record; total bigint; digest text;
begin
 for item in
  select n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('sabora','sabora_migration_meta') and c.relkind in ('r','p')
  order by n.nspname,c.relname
 loop
  execute format('select count(*),md5(coalesce(string_agg(row_to_json(t)::text,E''\n'' order by row_to_json(t)::text),'''')) from %I.%I t',
   item.nspname,item.relname) into total,digest;
  insert into sabora_backup_data_fingerprints values(item.nspname,item.relname,total,digest);
 end loop;
end $sabora_backup$;
select 'data:'||md5(coalesce(string_agg(
 schema_name||':'||object_name||':'||row_count||':'||data_md5,
 E'\n' order by schema_name,object_name),'')) from sabora_backup_data_fingerprints;

select 'sequences:'||md5(coalesce(string_agg(
 schemaname||':'||sequencename||':'||start_value||':'||min_value||':'||max_value||':'||increment_by||':'||
 cycle||':'||cache_size||':'||coalesce(last_value::text,'NULL'),
 E'\n' order by schemaname,sequencename),''))
from pg_sequences where schemaname in ('sabora','sabora_migration_meta');
