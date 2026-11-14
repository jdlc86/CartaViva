select format(
 'create role %I with %s %s %s %s %s %s %s connection limit %s;',
 rolname,
 case when rolsuper then 'superuser' else 'nosuperuser' end,
 case when rolinherit then 'inherit' else 'noinherit' end,
 case when rolcreaterole then 'createrole' else 'nocreaterole' end,
 case when rolcreatedb then 'createdb' else 'nocreatedb' end,
 case when rolcanlogin then 'login' else 'nologin' end,
 case when rolreplication then 'replication' else 'noreplication' end,
 case when rolbypassrls then 'bypassrls' else 'nobypassrls' end,
 rolconnlimit)
from pg_roles
where rolname in ('anon','authenticated','cv005_recovery_provider_dba')
   or rolname like 'sabora\_%' escape '\'
order by rolname;

select format('set role %I; grant %I to %I with admin %s, set %s, inherit %s; reset role;',
 grantor.rolname,parent.rolname,member.rolname,
 case when membership.admin_option then 'true' else 'false' end,
 case when membership.set_option then 'true' else 'false' end,
 case when membership.inherit_option then 'true' else 'false' end)
from pg_auth_members membership
join pg_roles parent on parent.oid=membership.roleid
join pg_roles member on member.oid=membership.member
join pg_roles grantor on grantor.oid=membership.grantor
where (parent.rolname in ('anon','authenticated') or parent.rolname like 'sabora\_%' escape '\')
  and (member.rolname in ('anon','authenticated','cv005_recovery_provider_dba')
       or member.rolname like 'sabora\_%' escape '\')
order by parent.rolname,member.rolname,grantor.rolname;

-- Keep database-scoped privileges that Sabora granted on provider-managed
-- dependencies in the same encrypted component, but behind an explicit
-- boundary. Recovery applies this section only after creating the target
-- database and its provider prerequisite; it never recreates managed objects.
select '-- sabora-database-prerequisites-v1';

select format(
 'set role %I; grant %s on schema %I to %I%s; reset role;',
 grantor.rolname,
 acl.privilege_type,
 namespace.nspname,
 recipient.rolname,
 case when acl.is_grantable then ' with grant option' else '' end)
from pg_namespace namespace
cross join lateral aclexplode(namespace.nspacl) acl
join pg_roles grantor on grantor.oid=acl.grantor
join pg_roles recipient on recipient.oid=acl.grantee
where namespace.nspname='extensions'
  and recipient.rolname like 'sabora\_%' escape '\'
order by recipient.rolname,acl.privilege_type,grantor.rolname,acl.is_grantable;

-- Reconcile the restored ACL catalog explicitly. The recovery contract audits
-- grantor as well as grantee and effective privilege, so an equivalent but
-- differently materialized ACL is not accepted.
select '-- sabora-database-acl-reconciliation-v1';

select format(
 'set role %I; revoke all privileges on schema %I from %s cascade; reset role;',
 pg_get_userbyid(namespace.nspowner),
 namespace.nspname,
 case when recipient.grantee=0 then 'public'
  else format('%I',pg_get_userbyid(recipient.grantee)) end)
from pg_namespace namespace
cross join lateral (
 select acl.grantee from aclexplode(namespace.nspacl) acl
 union select namespace.nspowner
 union select 0::oid
) recipient
where namespace.nspname in ('sabora','sabora_migration_meta')
order by namespace.nspname,
 case when recipient.grantee=0 then 'PUBLIC' else pg_get_userbyid(recipient.grantee) end;

select format(
 'set role %I; grant %s on schema %I to %s%s; reset role;',
 pg_get_userbyid(acl.grantor),
 acl.privilege_type,
 namespace.nspname,
 case when acl.grantee=0 then 'public' else format('%I',pg_get_userbyid(acl.grantee)) end,
 case when acl.is_grantable then ' with grant option' else '' end)
from pg_namespace namespace
cross join lateral aclexplode(namespace.nspacl) acl
where namespace.nspname in ('sabora','sabora_migration_meta')
order by namespace.nspname,
 case when acl.grantor=namespace.nspowner then 0 else 1 end,
 case when acl.is_grantable then 0 else 1 end,
 pg_get_userbyid(acl.grantor),
 case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end,
 acl.privilege_type,acl.is_grantable;

select format(
 'set role %I; revoke all privileges on %s %I.%I from %s cascade; reset role;',
 pg_get_userbyid(relation.relowner),
 case when relation.relkind='S' then 'sequence' else 'table' end,
 namespace.nspname,
 relation.relname,
 case when recipient.grantee=0 then 'public'
  else format('%I',pg_get_userbyid(recipient.grantee)) end)
from pg_class relation
join pg_namespace namespace on namespace.oid=relation.relnamespace
cross join lateral (
 select acl.grantee from aclexplode(relation.relacl) acl
 union select relation.relowner
 union select 0::oid
) recipient
where namespace.nspname in ('sabora','sabora_migration_meta')
  and relation.relkind in ('r','p','v','m','S','f')
order by namespace.nspname,relation.relname,relation.relkind,
 case when recipient.grantee=0 then 'PUBLIC' else pg_get_userbyid(recipient.grantee) end;

select format(
 'set role %I; grant %s on %s %I.%I to %s%s; reset role;',
 pg_get_userbyid(acl.grantor),
 acl.privilege_type,
 case when relation.relkind='S' then 'sequence' else 'table' end,
 namespace.nspname,
 relation.relname,
 case when acl.grantee=0 then 'public' else format('%I',pg_get_userbyid(acl.grantee)) end,
 case when acl.is_grantable then ' with grant option' else '' end)
from pg_class relation
join pg_namespace namespace on namespace.oid=relation.relnamespace
cross join lateral aclexplode(relation.relacl) acl
where namespace.nspname in ('sabora','sabora_migration_meta')
  and relation.relkind in ('r','p','v','m','S','f')
order by namespace.nspname,relation.relname,relation.relkind,
 case when acl.grantor=relation.relowner then 0 else 1 end,
 case when acl.is_grantable then 0 else 1 end,
 pg_get_userbyid(acl.grantor),
 case when acl.grantee=0 then 'PUBLIC' else pg_get_userbyid(acl.grantee) end,
 acl.privilege_type,acl.is_grantable;
