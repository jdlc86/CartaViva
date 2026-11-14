import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('S40 dual backup encrypts four separate streams and restores only from external-class fixture',()=>{
 const bundle=read('scripts/ops/sabora-encrypted-backup-bundle.mjs');
 const cli=read('scripts/ops/sabora-encrypted-backup-cli.mjs');
 const integration=read('scripts/ci/sabora-dual-backup-postgres17.mjs');
 assert.match(bundle,/createCipheriv\('aes-256-gcm'/);
 assert.match(bundle,/roles-memberships\|schema\|data\|inventory/);
 assert.match(bundle,/ciphertext-only-replicas; no keys or plaintext dumps/);
 assert.match(bundle,/postgresVersion:meta\.postgresVersion.*createdAt:meta\.createdAt/s);
 assert.doesNotMatch(bundle,/execSync|spawnSync|shell\s*:\s*true/);
 assert.match(cli,/SABORA_BACKUP_PSQL_BIN/);
 assert.match(cli,/SABORA_BACKUP_PG_DUMP_BIN/);
 assert.match(cli,/fsConstants\.O_NOFOLLOW/);
 assert.match(cli,/plaintext_output_argument/);
 assert.match(integration,/destinationClass:'offsite'/);
 assert.match(integration,/destinationClass:'vps-encrypted-cache'/);
 assert.match(integration,/await rm\(capture,\{recursive:true,force:true\}\)/);
 assert.match(integration,/bundleDirectory:offsite,name:'schema'/);
 assert.match(integration,/bundleDirectory:offsite,name:'data'/);
 assert.doesNotMatch(integration,/bundleDirectory:vpsCache,name:'(?:schema|data)'/);
 assert.match(integration,/--network','none'/);
 assert.match(integration,/--exit-on-error','--disable-triggers','\/tmp\/sabora-data\.dump'/);
 assert.match(integration,/assert\.equal\(ledgerCount,'99'\)/);
 assert.match(integration,/vpsReplicaUsedForRestore:false/);
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

test('S40 real driver remains disposable and performs only the exact three-service release',()=>{
 const driver=read('scripts/ci/sabora-release-real-docker-lab.mjs');
 const workflow=read('.github/workflows/ci.yml');
 assert.match(driver,/SABORA_DISPOSABLE_RELEASE_LAB!=='explicitly-authorized-ci'/);
 assert.match(driver,/process\.getuid\(\)!==0/);
 assert.match(driver,/scopedDockerCommands/);
 assert.match(driver,/actualComposeUpNoBuildNoPullNoDeps:true/);
 assert.match(driver,/exactServices:\[\.\.\.SABORA_RELEASE_SCOPE\.services\]/);
 assert.match(driver,/externalAuthorizationConsumed:false/);
 assert.match(driver,/ownedNetworks\.slice\(\)\.reverse\(\)/);
 assert.match(driver,/if\(nftOwned\)/);
 assert.match(driver,/projectOwned=true;docker/);
 assert.doesNotMatch(driver,/compose','down|system','prune|container','prune/);
 assert.match(workflow,/bash scripts\/ci\/sabora-nftables-enforcement-lab\.sh/);
 assert.match(workflow,/"\$node_bin" scripts\/ci\/sabora-release-real-docker-lab\.mjs/);
 assert.match(workflow,/sabora-real-docker-release-driver-lab/);
});
