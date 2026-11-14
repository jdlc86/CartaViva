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

select format('grant %I to %I with admin %s, set %s, inherit %s granted by %I;',
 parent.rolname,member.rolname,
 case when membership.admin_option then 'true' else 'false' end,
 case when membership.set_option then 'true' else 'false' end,
 case when membership.inherit_option then 'true' else 'false' end,
 grantor.rolname)
from pg_auth_members membership
join pg_roles parent on parent.oid=membership.roleid
join pg_roles member on member.oid=membership.member
join pg_roles grantor on grantor.oid=membership.grantor
where (parent.rolname in ('anon','authenticated') or parent.rolname like 'sabora\_%' escape '\')
  and (member.rolname in ('anon','authenticated','cv005_recovery_provider_dba')
       or member.rolname like 'sabora\_%' escape '\')
order by parent.rolname,member.rolname,grantor.rolname;
