import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {chmod,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {
 captureEncryptedBackupBundle,decryptBackupComponent,
 inspectEncryptedBackupBundle,replicateEncryptedBackupBundle,
} from '../scripts/ops/sabora-encrypted-backup-bundle.mjs';
import {validateOperationalPlan,validateCaptureSource,verifyPinnedTlsRootCert}
 from '../scripts/ops/sabora-encrypted-backup-cli.mjs';

const releaseSha='d'.repeat(40),migrationTreeSha256='e'.repeat(64);
function meta(){
 return {schema:'sabora-logical-backup/v1',backupId:'SABORA-BACKUP-UNIT-0001',
  repository:'jdlc86/CartaViva',releaseSha,sourceProjectRef:'byhvmumqivmunkmomhup',
  postgresMajor:17,postgresVersion:'17.11.0.003',migrationTreeSha256,
  includedSchemas:['sabora','sabora_migration_meta'],
  excludedManagedSchemas:['auth','extensions','realtime','storage','supabase_functions','vault'],
  createdAt:'2026-11-14T12:00:00.000Z',custody:'key-outside-artifact-git-actions-vps'};
}
const payloads={
 'roles-memberships':'CREATE ROLE sabora_reader NOLOGIN;\n',
 schema:'PGDMP\u0000SABORA-SCHEMA\n'+Buffer.alloc(2048,6).toString('base64'),
 data:'PGDMP\u0000SABORA-DATA\n'+Buffer.alloc(4096,7).toString('base64'),
 inventory:JSON.stringify({roles:1,rls:'force',ledger:99})+'\n',
};
const components=()=>Object.entries(payloads).map(([name,value])=>({
 name,mediaType:['schema','data'].includes(name)?'application/vnd.postgresql.custom':'text/plain',
 command:process.execPath,args:['-e','process.stdout.write(Buffer.from(process.argv[1],"base64"))',
  Buffer.from(value).toString('base64')],
}));

test('streamed Sabora capture persists ciphertext only and verifies two independent replicas',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sabora-backup-bundle-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const keyPath=join(root,'custodian.key'),capture=join(root,'capture');
 const offsite=join(root,'external-store'),vps=join(root,'vps-encrypted-cache');
 await writeFile(keyPath,randomBytes(32).toString('hex')+'\n',{mode:0o600});
 await chmod(keyPath,0o600);
 const result=await captureEncryptedBackupBundle({directory:capture,keyPath,
  metadata:meta(),components:components()});
 assert.match(result.manifestSha256,/^[0-9a-f]{64}$/);
 assert.equal((await inspectEncryptedBackupBundle(capture)).containsPlaintext,false);
 const files=await Promise.all(Object.keys(payloads).map(name=>readFile(join(capture,name+'.aesgcm'))));
 for(const [index,value] of Object.values(payloads).entries())
  assert.equal(files[index].includes(Buffer.from(value)),false);
 const externalReceipt=await replicateEncryptedBackupBundle({sourceDirectory:capture,
  destinationDirectory:offsite,destinationClass:'offsite'});
 const localReceipt=await replicateEncryptedBackupBundle({sourceDirectory:capture,
  destinationDirectory:vps,destinationClass:'vps-encrypted-cache'});
 assert.equal(externalReceipt.backupId,localReceipt.backupId);
 assert.equal(externalReceipt.manifestSha256,localReceipt.manifestSha256);
 assert.equal(externalReceipt.containsKey,false);
 assert.equal(localReceipt.containsPlaintext,false);
 for(const [name,expected] of Object.entries(payloads)){
  const output=join(root,'restore-'+name);
  await decryptBackupComponent({bundleDirectory:offsite,name,keyPath,outputPath:output});
  assert.deepEqual(await readFile(output),Buffer.from(expected));
 }
});

test('corrupt external ciphertext and wrong custody keys fail without plaintext output',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sabora-backup-negative-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const keyPath=join(root,'custodian.key'),wrongKey=join(root,'wrong.key');
 const capture=join(root,'capture'),offsite=join(root,'offsite');
 await writeFile(keyPath,randomBytes(32).toString('hex'),{mode:0o600});
 await writeFile(wrongKey,randomBytes(32).toString('hex'),{mode:0o600});
 await chmod(keyPath,0o600);await chmod(wrongKey,0o600);
 await captureEncryptedBackupBundle({directory:capture,keyPath,metadata:meta(),components:components()});
 await replicateEncryptedBackupBundle({sourceDirectory:capture,destinationDirectory:offsite,
  destinationClass:'offsite'});
 const corrupt=Buffer.from(await readFile(join(offsite,'data.aesgcm')));
 corrupt[Math.floor(corrupt.length/2)]^=0xff;
 await writeFile(join(offsite,'data.aesgcm'),corrupt);
 const output=join(root,'must-not-exist.dump');
 await assert.rejects(decryptBackupComponent({bundleDirectory:offsite,name:'data',
  keyPath,outputPath:output}),/sabora_backup_stop/);
 await assert.rejects(readFile(output));
 const clean=join(root,'clean-copy');
 await replicateEncryptedBackupBundle({sourceDirectory:capture,destinationDirectory:clean,
  destinationClass:'offsite'});
 await assert.rejects(decryptBackupComponent({bundleDirectory:clean,name:'schema-data',
  keyPath:wrongKey,outputPath:output}),/sabora_backup_stop/);
 await assert.rejects(readFile(output));
});

test('AES-GCM authenticates backup freshness and PostgreSQL version metadata',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sabora-backup-aad-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const keyPath=join(root,'custodian.key'),capture=join(root,'capture');
 await writeFile(keyPath,randomBytes(32).toString('hex'),{mode:0o600});await chmod(keyPath,0o600);
 await captureEncryptedBackupBundle({directory:capture,keyPath,metadata:meta(),components:components()});
 const manifestPath=join(capture,'manifest.json');
 const original=JSON.parse(await readFile(manifestPath,'utf8'));
 for(const [field,value] of [['createdAt','2026-11-13T12:00:00.000Z'],
  ['postgresVersion','17.12.0.001']]){
  const changed=structuredClone(original);changed[field]=value;
  await writeFile(manifestPath,JSON.stringify(changed,null,2)+'\n');
  const output=join(root,'must-not-exist-'+field);
  await assert.rejects(decryptBackupComponent({bundleDirectory:capture,name:'data',keyPath,
   outputPath:output}),/sabora_backup_stop:authentication_failed/);
  await assert.rejects(readFile(output));
 }
 const extended=structuredClone(original);extended.untrustedOperationalReceipt=true;
 await writeFile(manifestPath,JSON.stringify(extended,null,2)+'\n');
 await assert.rejects(inspectEncryptedBackupBundle(capture),/sabora_backup_stop:invalid_manifest/);
});

test('operational capture plan permits only scoped psql and pg_dump streams',()=>{
 const binRoot='/usr/bin';
 const psql=join(binRoot,'psql');
 const pgDump=join(binRoot,'pg_dump');
 const sql=join(binRoot,'protected.sql');
 const psqlSpec=name=>({name,mediaType:name==='roles-memberships'?'application/sql':'text/plain',
  command:psql,args:['-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres','-f','-'],
  stdinPath:sql});
 const dumpSpec=(name,mode)=>({name,mediaType:'application/vnd.postgresql.custom',command:pgDump,
  args:['-U','postgres','-d','postgres','-Fc','--schema=sabora',
   '--schema=sabora_migration_meta','--'+mode+'-only']});
 const plan={metadata:meta(),components:[psqlSpec('roles-memberships'),dumpSpec('schema','schema'),
  dumpSpec('data','data'),psqlSpec('inventory')]};
 assert.equal(validateOperationalPlan(structuredClone(plan),{psql,pgDump}).components.length,4);
 for(const mutate of [
  value=>{value.components[0].command='psql';},
  value=>{value.components[1].args.push('--file=/tmp/plain.dump');},
  value=>{value.components[2].args.push('--dbname=postgresql://attacker:secret@example/db');},
  value=>{value.components[1].args.push('--schema=auth');},
  value=>{value.components[1].args.push('-nauth');},
  value=>{value.components[2].args.push('--format=plain');},
  value=>{value.components[2].args.push('--snapshot=00000001-00000001-1');},
  value=>{value.components[2].args.push('--host=attacker.example.com');},
  value=>{value.components[3].args.push('-h','attacker.example.com');},
  value=>{value.components[0].args.push('-Uforeign');},
  value=>{value.components[0].args.push('-dother');},
  value=>{value.components[0].args.push('-cSELECT 1');},
  value=>{value.components[0].args.push('-f/tmp/other.sql');},
  value=>{value.components[2].args.push('-Uevil');},
  value=>{value.components[2].args.push('-dforeign');},
 ]){
  const changed=structuredClone(plan);mutate(changed);
  assert.throws(()=>validateOperationalPlan(changed,{psql,pgDump}),/sabora_backup_cli_stop/);
 }
});

test('bundle rejects keys with group or world permissions',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sabora-backup-key-mode-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const keyPath=join(root,'open.key');
 await writeFile(keyPath,randomBytes(32).toString('hex'),{mode:0o644});
 await chmod(keyPath,0o644);
 await assert.rejects(captureEncryptedBackupBundle({directory:join(root,'capture'),keyPath,
  metadata:meta(),components:components()}),/sabora_backup_stop:key_permissions/);
 const unsafe=join(root,'shared');await mkdir(unsafe,{mode:0o700});
 const sharedKey=join(unsafe,'private.key');await writeFile(sharedKey,randomBytes(32).toString('hex'),{mode:0o600});
 await chmod(unsafe,0o777);
 try{await assert.rejects(captureEncryptedBackupBundle({directory:join(root,'capture'),keyPath:sharedKey,
  metadata:meta(),components:components()}),/sabora_backup_stop:key_permissions/);}
 finally{await chmod(unsafe,0o700);}
 await assert.rejects(readFile(join(root,'capture','manifest.json')),{code:'ENOENT'});
});

test('backup v2 binds live TLS endpoint and independently pinned cluster identity',()=>{
 const candidate={...meta(),schema:'sabora-logical-backup/v2'};
 const env={PGHOST:'db.byhvmumqivmunkmomhup.supabase.co',PGSSLMODE:'verify-full',
  PGSSLROOTCERT:join(tmpdir(),'postgres-ca.pem'),PGPORT:'5432',
  SABORA_BACKUP_APPROVED_SYSTEM_IDENTIFIER:'7123456789012345678',
  SABORA_BACKUP_APPROVED_CA_SHA256:'f'.repeat(64)};
 assert.equal(validateCaptureSource(candidate,env),'7123456789012345678');
 for(const [key,value] of [
  ['PGHOST','db.otherproject.supabase.co'],['PGSSLMODE','require'],
  ['PGSSLROOTCERT','relative.pem'],['PGHOSTADDR','127.0.0.1'],
  ['PGSERVICE','untrusted'],['PGOPTIONS','-c search_path=public'],
  ['pgoptions','-c search_path=public'],['PgPassFile',join(tmpdir(),'foreign.pass')],
  ['PGPASSFILE',join(tmpdir(),'untrusted.pass')],['PGSSLCERT',join(tmpdir(),'client.crt')],
  ['PGPORT','5433'],
  ['SABORA_BACKUP_APPROVED_SYSTEM_IDENTIFIER','']
 ]){
  assert.throws(()=>validateCaptureSource(candidate,{...env,[key]:value}),/sabora_backup_cli_stop:/);
 }
 assert.throws(()=>validateCaptureSource(meta(),env),/sabora_backup_cli_stop:v2_snapshot_required/);
 assert.throws(()=>validateCaptureSource(candidate,{...env,SABORA_BACKUP_APPROVED_CA_SHA256:''}),
  /independent_tls_ca_pin_required/);
});

test('operational TLS CA bytes must be pinned and cannot be replaced by a symlink',async t=>{
 const root=await mkdtemp(join(tmpdir(),'sabora-ca-pin-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 const cert=join(root,'approved-ca.pem');
 const contents='-----BEGIN CERTIFICATE-----\nTUVBSw==\n-----END CERTIFICATE-----\n';
 await writeFile(cert,contents,{mode:0o600});
 const env={PGSSLROOTCERT:cert,
  SABORA_BACKUP_APPROVED_CA_SHA256:createHash('sha256').update(contents).digest('hex')};
 assert.equal(await verifyPinnedTlsRootCert(env),true);
 const shared=join(root,'shared');await mkdir(shared,{mode:0o700});
 const sharedCa=join(shared,'approved-ca.pem');await writeFile(sharedCa,contents,{mode:0o600});
 await chmod(shared,0o777);
 try{await assert.rejects(verifyPinnedTlsRootCert({...env,PGSSLROOTCERT:sharedCa}),/unsafe_tls_ca_file/);}
 finally{await chmod(shared,0o700);}
 await assert.rejects(verifyPinnedTlsRootCert({...env,SABORA_BACKUP_APPROVED_CA_SHA256:'0'.repeat(64)}),
  /tls_ca_pin_mismatch/);
 const link=join(root,'alias-ca.pem');
 try{const {symlink}=await import('node:fs/promises');await symlink(cert,link);
  await assert.rejects(verifyPinnedTlsRootCert({...env,PGSSLROOTCERT:link}),
   /unsafe_tls_ca_file/);
 }catch(error){if(error?.code!=='EPERM')throw error;}
});
test('backup v2 cannot fall back to four inconsistent independent commands',async()=>{
 await assert.rejects(captureEncryptedBackupBundle({directory:join(tmpdir(),'unused-unique-v2-capture'),
  keyPath:join(tmpdir(),'not-used.key'),metadata:{...meta(),schema:'sabora-logical-backup/v2'},
  components:components()}),/sabora_backup_stop:snapshot_required_for_v2/);
});
