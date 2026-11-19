import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('S40 dual backup encrypts four separate streams and restores only from external-class fixture',()=>{
 const bundle=read('scripts/ops/sabora-encrypted-backup-bundle.mjs');
 const cli=read('scripts/ops/sabora-encrypted-backup-cli.mjs');
 const integration=read('scripts/ci/sabora-dual-backup-postgres17.mjs');
 const roles=read('scripts/ci/sabora-backup-roles.sql');
 const inventory=read('scripts/ci/sabora-backup-inventory.sql');
 assert.match(bundle,/createCipheriv\('aes-256-gcm'/);
 assert.match(bundle,/roles-memberships\|schema\|data\|inventory/);
 assert.match(bundle,/ciphertext-only-replicas; no keys or plaintext dumps/);
 assert.match(bundle,/postgresVersion:meta\.postgresVersion.*createdAt:meta\.createdAt/s);
 assert.doesNotMatch(bundle,/execSync|spawnSync|shell\s*:\s*true/);
 assert.match(cli,/SABORA_BACKUP_PSQL_BIN/);
 assert.match(cli,/SABORA_BACKUP_PG_DUMP_BIN/);
 assert.match(cli,/fsConstants\.O_NOFOLLOW/);
 // Exact allowlisted PostgreSQL argv shapes now supersede the legacy
 // keyword-based output guard. Long/short, attached and alternate flags
 // cannot appear in either expected argument vector.
 assert.match(cli,/exactArgs\(spec\.args,PSQL_ARGS\)/);
 assert.match(cli,/exactArgs\(spec\.args,expected\)/);
 assert.doesNotMatch(cli,/function rejectSharedArgs/);
 assert.match(integration,/destinationClass:'offsite'/);
 assert.match(integration,/destinationClass:'vps-encrypted-cache'/);
 assert.match(integration,/await rm\(capture,\{recursive:true,force:true\}\)/);
 assert.match(integration,/bundleDirectory:offsite,name:'schema'/);
 assert.match(integration,/bundleDirectory:offsite,name:'data'/);
 assert.doesNotMatch(integration,/bundleDirectory:vpsCache,name:'(?:schema|data)'/);
 assert.match(integration,/--network','none'/);
 assert.match(integration,/psql','-X','-h','127\.0\.0\.1'/);
 assert.match(integration,/psql\(target,'postgres','CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;'\)/);
 // The initial-state recovery target now becomes the full recovered source
 // in the same database. This is a real preinstall-to-V2 transition, not
 // an independent second database with a different initial-state identity.
 assert.match(integration,/psql\(target,'postgres',globalRolesSql\)/);
 assert.ok(integration.indexOf("CREATE SCHEMA extensions; CREATE EXTENSION pgcrypto WITH SCHEMA extensions;")<integration.indexOf("psql(target,'postgres',globalRolesSql)"));
 assert.match(integration,/databasePrerequisiteMarker='-- sabora-database-prerequisites-v1\\n'/);
 assert.match(integration,/databaseAclMarker='-- sabora-database-acl-reconciliation-v1\\n'/);
 assert.match(integration,/psql\(target,'postgres',databasePrerequisiteSql\)/);
 assert.match(integration,/psql\(target,'postgres',databaseAclSql\)/);
 assert.match(integration,/psql\(target,'postgres',databasePrerequisiteSql\)[\s\S]*?pg_restore[\s\S]*?psql\(target,'postgres',databaseAclSql\)/);
 assert.match(integration,/sabora_vps_backup_rotation_cycle_ok/);
 assert.match(integration,/sabora_vps_backup_rotation_sigkill_ok/);
 assert.match(integration,/assert\.equal\(recovered,await readFile\(outputs\.inventory,'utf8'\)\)/);
 assert.match(integration,/cv005_recovery_provider_dba_preexists/);
 assert.match(integration,/grant sabora_h6_fn_owner to cv005_recovery_provider_dba\s+with admin true, set false, inherit false/);
 assert.match(roles,/aclexplode\(namespace\.nspacl\)/);
 assert.match(roles,/recipient\.rolname like 'sabora\\_%'/);
 assert.match(roles,/set role %I; revoke all privileges on schema %I from %s cascade; reset role/);
 assert.match(roles,/set role %I; revoke all privileges on %s %I\.%I from %s cascade; reset role/);
 assert.match(roles,/union select namespace\.nspowner/);
 assert.match(roles,/union select relation\.relowner/);
 assert.match(roles,/set role %I; grant %s on schema %I to %s%s; reset role/);
 assert.match(roles,/set role %I; grant %s on %s %I\.%I to %s%s; reset role/);
 assert.match(inventory,/from aclexplode\(n\.nspacl\) acl/);
 assert.match(inventory,/from aclexplode\(c\.relacl\) acl/);
 assert.doesNotMatch(inventory,/(?:nspacl|relacl)::text/);
 assert.match(integration,/--exit-on-error','--disable-triggers','\/tmp\/sabora-data\.dump'/);
 assert.match(integration,/buildMigrationAudit\(root\)/);
 assert.match(integration,/historical_migration_baseline_missing/);
 assert.match(integration,/assert\.equal\(ledgerCount,String\(migrations\.count\)\)/);
 assert.match(integration,/migrations:migrations\.count/);
 assert.doesNotMatch(integration,/expected_99_migrations|assert\.equal\(ledgerCount,'99'\)|migrations:99/);
 assert.match(integration,/vpsReplicaUsedForRestore:false/);
});

test('S40 home-computer profile records both destinations without claiming operational evidence',()=>{
 const profile=JSON.parse(read('deploy/sabora-home-offsite-backup.profile.example.json'));
 const ignored=read('.gitignore');
 assert.equal(profile.schema,'sabora-home-offsite-backup-profile/v1');
 assert.equal(profile.scope.externalDestinationClass,'offsite');
 assert.equal(profile.scope.externalLocationType,'independent-home-computer');
 assert.equal(profile.scope.vpsDestinationClass,'vps-encrypted-cache');
 assert.equal(profile.scope.vpsStorageScope,'sabora-exclusive');
 assert.equal(profile.state.configurationComplete,false);
 assert.equal(profile.state.copiesExist,false);
 assert.equal(profile.state.restoreValidated,false);
 assert.equal(profile.state.operationalAuthorizationGranted,false);
 assert.equal(profile.state.schedulerEnabled,false);
 assert.equal(profile.homeComputer.inboundServiceEnabled,false);
 assert.equal(profile.homeComputer.inboundWriteFromVpsAllowed,false);
 assert.equal(profile.keyCustody.storedInOffsiteCiphertextRoot,false);
 assert.equal(profile.keyCustody.storedOnVps,false);
 assert.equal(profile.vpsReplica.requiredByOwnerDecision,true);
 assert.equal(profile.vpsReplica.authorizationGranted,false);
 assert.equal(profile.vpsReplica.fleetiaDependency,false);
 assert.match(JSON.stringify(profile),/PENDING_WINDOWS_MACOS_OR_LINUX/);
 assert.match(JSON.stringify(profile),/PENDING_ABSOLUTE_PATH_ON_HOME_COMPUTER/);
 assert.match(ignored,/deploy\/sabora-home-offsite-backup\.profile\.json/);
});

test('S40 nftables gate applies, proves denials and rolls back only inside disposable lab',()=>{
 const lab=read('scripts/ci/sabora-nftables-enforcement-lab.sh');
 assert.match(lab,/root_disposable_actions_context_required/);
 assert.match(lab,/ip netns exec "\$rtr" nft --file "\$policy"/);
 assert.match(lab,/must_reach ingress_cloudflare_exact/);
 assert.match(lab,/must_block ingress_direct_origin/);
 assert.match(lab,/must_block egress_wrong_ipv4/);
 assert.match(lab,/must_block egress_ipv6_default_deny/);
 assert.match(lab,/nft delete table inet sabora_ingress_guard/);
 assert.match(lab,/nft delete table inet sabora_egress_guard/);
 assert.match(lab,/host_tables_before.*host_tables_after/s);
 assert.match(lab,/created_namespaces=.*ip netns delete "\$namespace"/s);
 assert.match(lab,/policy_created=true/);
 assert.doesNotMatch(lab,/nft\s+flush ruleset|docker\s+(?:prune|stop|rm)/);
});

test('S40/S43 real controller remains disposable and performs only the exact three-service release',()=>{
 const entry=read('scripts/ci/sabora-release-real-docker-lab.mjs');
 const lab=read('scripts/ci/sabora-release-controller-lab.mjs');
 const driver=read('scripts/ops/sabora-release-driver.mjs');
 const policy=read('scripts/ops/sabora-release-compose-policy.mjs');
 const workflow=read('.github/workflows/ci.yml');
 // The historical lab is now a guarded entrypoint for the same real root
 // controller used by the SSH integration, not a second fixture driver.
 for(const source of [entry,lab]){
  assert.match(source,/SABORA_DISPOSABLE_RELEASE_LAB!=='explicitly-authorized-ci'/);
  assert.match(source,/process\.getuid\(\)!==0/);
  assert.match(source,/GITHUB_ACTIONS!=='true'/);
  assert.match(source,/CI!=='true'/);
 }
 assert.match(entry,/await import\('\.\/sabora-release-controller-lab\.mjs'\)/);
 assert.match(lab,/runReleaseController\(\{source:process\.stdin,installation\}\)/);
 assert.match(lab,/environment:'disposable-lab'/);
 assert.match(lab,/lab-authorities-rejected-by-production-entry/);
 assert.match(driver,/composeArgs=\['compose','--project-name','sabora'/);
 assert.match(driver,/validateClosedCompose/);
 assert.match(policy,/exactKeys\(config.services,\['api','sabora-egress','web'\]\)/);
 assert.match(driver,/'up','--detach','--no-deps','--no-build','--pull','never','--wait','--wait-timeout','100',\.\.\.SABORA_RELEASE_SCOPE.services/);
 assert.match(lab,/deploy-A-through-real-ssh/);
 assert.match(lab,/deploy-B-through-real-ssh/);
 assert.match(lab,/rollback-A-through-real-ssh/);
 assert.match(lab,/sentinelUnchanged:true/);
 assert.match(lab,/operationalAcceptance:false,sqlExecuted:false/);
 assert.match(lab,/externalAuthorities:'synthetic-lab-only; never operational evidence'/);
 assert.match(lab,/createdNetworks\.reverse\(\)/);
 assert.match(lab,/if\(nftOwned\)/);
 assert.match(lab,/if\(namesVerifiedEmpty\)for\(const service of SABORA_RELEASE_SCOPE.services\)/);
 assert.match(lab,/===\s*'release-controller-v1'\)docker\(\['rm','-f',name\]/);
 for(const source of [entry,lab,driver])assert.doesNotMatch(source,/compose','down|system','prune|container','prune/);
 assert.match(workflow,/bash scripts\/ci\/sabora-nftables-enforcement-lab\.sh/);
 assert.match(workflow,/"\$node_bin" scripts\/ci\/sabora-release-real-docker-lab\.mjs/);
 assert.match(workflow,/sabora-real-docker-release-driver-lab/);
});
