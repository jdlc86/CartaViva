// Postgres 17 synchronized snapshot exporter. The transaction stays open
// until both pg_dump streams and the inventory have imported its exact ID.
// No credentials, SQL output, server connection strings or plaintext dumps are logged.
import {spawn} from 'node:child_process';

const stop=code=>Error('sabora_snapshot_stop:'+code);
const SYSTEM=/^[0-9]{10,20}$/;
const ID=/^[0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9A-Fa-f]+$/;
const DB=/^[a-z][a-z0-9_]{0,62}$/;
const HASH=/^[0-9a-f]{64}$/;
const ALLOWED_PG_ENV=new Set(['PGHOST','PGPORT','PGSSLMODE','PGSSLROOTCERT',
 'PGUSER','PGPASSWORD','PGCONNECT_TIMEOUT','PGAPPNAME','PGCLIENTENCODING']);

// This is also used by encrypted bundle capture; do not inherit PGOPTIONS,
// PGSERVICE or mixed-case environment aliases into child processes.
export function safePostgresChildEnv(source=process.env){
 const env={...source};
 for(const key of Object.keys(env)){
  if(/^pg/i.test(key) && (key!==key.toUpperCase()||!ALLOWED_PG_ENV.has(key)))
   throw stop('unapproved_libpq_environment');
 }
 delete env.SABORA_BACKUP_KEY_FILE;delete env.SABORA_BACKUP_COMPONENT;
 return env;
}

// Byte-for-byte equivalent to Node migrationInventory(): filename, NUL,
// committed SQL SHA256, LF; ordered by the real SQL ledger version.
const AUDITED_LEDGER_SQL=`(SELECT encode(pg_catalog.sha256(
 coalesce(pg_catalog.string_agg(
 convert_to(version||'_'||name||'.sql','UTF8')||
 decode('00','hex')||convert_to(sha256||chr(10),'UTF8'),
 ''::bytea ORDER BY version),''::bytea)),'hex')
 FROM sabora_migration_meta.applied_migrations)`;
export async function openPostgresBackupSnapshot({command,args,expectedSystemIdentifier,
 expectedDatabase='postgres',expectedMigrationTreeSha256=null,timeoutMs=30000}={}){
 if(typeof command!=='string'||!command||!Array.isArray(args)||
    args.some(x=>typeof x!=='string')||!SYSTEM.test(expectedSystemIdentifier??'')||
    !DB.test(expectedDatabase??'')||
    (expectedMigrationTreeSha256!==null&&!HASH.test(expectedMigrationTreeSha256))||
    !Number.isSafeInteger(timeoutMs)||
    timeoutMs<1000||timeoutMs>60000)throw stop('invalid_snapshot_request');
 const env=safePostgresChildEnv();
 const child=spawn(command,args,{env,stdio:['pipe','pipe','pipe']});
 let finished=false,stderrCount=0;
 child.stderr.on('data',chunk=>{stderrCount+=chunk.length;});
 const close=new Promise((resolve,reject)=>{
  child.once('error',()=>reject(stop('exporter_spawn_failed')));
  child.once('close',(code,signal)=>{finished=true;
   if(code===0&&signal===null)resolve();else reject(stop('exporter_exited'));
  });
 });
 // Observe close early even if the exporter fails before providing the ID.
 close.catch(()=>{});
 let buffer='',readinessTimer;
 let response;
 try{
  response=await Promise.race([
   new Promise((resolve,reject)=>{
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',chunk=>{
     buffer+=chunk;
     if(buffer.length>4096){reject(stop('exporter_output_invalid'));return;}
     const line=buffer.indexOf('\n');
     if(line<0)return;
     const match=/^SABORA_SNAPSHOT\|([0-9]{10,20})\|([a-z][a-z0-9_]{0,62})\|([0-9A-Fa-f]+-[0-9A-Fa-f]+-[0-9A-Fa-f]+)(?:\|([0-9a-f]{64}))?$/
      .exec(buffer.slice(0,line).trim());
     if(!match){reject(stop('exporter_identity_invalid'));return;}
     resolve({systemIdentifier:match[1],database:match[2],snapshotId:match[3],
      migrationTreeSha256:match[4]??null});
    });
    child.stdin.on('error',()=>reject(stop('exporter_input_closed')));
    child.stdin.write(
     "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"+
     "SELECT 'SABORA_SNAPSHOT|' || (pg_control_system()).system_identifier::text || '|' || current_database() || '|' || pg_export_snapshot()"+
     (expectedMigrationTreeSha256===null?'':" || '|' || "+AUDITED_LEDGER_SQL)+
     ";\n"
    );
   }),
   close.then(()=>{throw stop('exporter_closed_before_snapshot');}),
   new Promise((_resolve,reject)=>{readinessTimer=setTimeout(
    ()=>reject(stop('exporter_timeout')),timeoutMs);}),
  ]);
  if(finished||response.systemIdentifier!==expectedSystemIdentifier||
     response.database!==expectedDatabase||!ID.test(response.snapshotId))
   throw stop('source_identity_mismatch');
  if(expectedMigrationTreeSha256!==null&&
     response.migrationTreeSha256!==expectedMigrationTreeSha256)
   throw stop('source_migration_ledger_mismatch');
 }catch(error){child.kill('SIGKILL');throw error;}
 finally{clearTimeout(readinessTimer);}
 return Object.freeze({...response,
  async close(){
   if(finished)throw stop('exporter_lost_before_capture');
   child.stdin.end('COMMIT;\n');
   let timer;
   try{await Promise.race([close,new Promise((_resolve,reject)=>{
    timer=setTimeout(()=>{
     child.kill('SIGKILL');reject(stop('exporter_close_timeout'));
    },timeoutMs);
   })]);}finally{clearTimeout(timer);}
  },
  abort(){if(!finished)child.kill('SIGKILL');}
 });
}

// Fixed catalog-only initial state probe. All reads use a read-only
// transaction. Exclude concurrent DDL/role changes by operator procedure.
const initialName=column=>"("+column+"='sabora' OR pg_catalog.left("+column+",7)='sabora_')";
const lower=column=>'pg_catalog.lower('+column+'::text)';
const INITIAL_COUNTS={
 schemas:"SELECT count(*) FROM pg_catalog.pg_namespace WHERE "+initialName(lower('nspname')),
 roles:"SELECT count(*) FROM pg_catalog.pg_roles WHERE "+initialName(lower('rolname')),
 memberships:"SELECT count(*) FROM pg_catalog.pg_auth_members m JOIN pg_catalog.pg_roles r ON r.oid=m.roleid JOIN pg_catalog.pg_roles u ON u.oid=m.member WHERE "+initialName(lower('r.rolname'))+" OR "+initialName(lower('u.rolname')),
 relations:"SELECT count(*) FROM pg_catalog.pg_class WHERE "+initialName(lower('relname')),
 routines:"SELECT count(*) FROM pg_catalog.pg_proc WHERE "+initialName(lower('proname')),
 types:"SELECT count(*) FROM pg_catalog.pg_type WHERE "+initialName(lower('typname')),
 constraints:"SELECT count(*) FROM pg_catalog.pg_constraint WHERE "+initialName(lower('conname')),
 triggers:"SELECT count(*) FROM pg_catalog.pg_trigger WHERE "+initialName(lower('tgname')),
 policies:"SELECT count(*) FROM pg_catalog.pg_policy WHERE "+initialName(lower('polname'))
};
const INITIAL_SQL="SELECT pg_catalog.json_build_object("+
 "'database',current_database(),'actor',current_user,'systemIdentifier',(pg_catalog.pg_control_system()).system_identifier::text,"+
 "'postgresVersion',current_setting('server_version'),'postgresMajor',current_setting('server_version_num')::int/10000,"+
 "'readOnly',current_setting('transaction_read_only')='on',"+
 "'pgcryptoVersion',(SELECT e.extversion FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace WHERE e.extname='pgcrypto' AND n.nspname='extensions'),"+
 Object.entries(INITIAL_COUNTS).map(([name,sql])=>"'"+name+"',("+sql+")").join(",")+");\n";
const INITIAL_KEYS=['actor','database','systemIdentifier','postgresVersion','postgresMajor','readOnly','pgcryptoVersion',...Object.keys(INITIAL_COUNTS)].sort();
export function validatePreinstallState(value,expectedSystemIdentifier){
 if(!value||typeof value!=='object'||Array.isArray(value)||
  Object.keys(value).sort().join('|')!==INITIAL_KEYS.join('|')||
  !SYSTEM.test(expectedSystemIdentifier??'')||
  value.systemIdentifier!==expectedSystemIdentifier||value.database!=='postgres'||
  value.actor!=='postgres'||value.postgresMajor!==17||!/^17\./.test(value.postgresVersion??'')||
  value.readOnly!==true||typeof value.pgcryptoVersion!=='string'||
  !/^[0-9]+(?:\.[0-9]+)+$/.test(value.pgcryptoVersion))
  throw stop('preinstall_source_identity_or_prerequisite');
 if(Object.keys(INITIAL_COUNTS).some(k=>value[k]!==0))
  throw stop('preinstall_sabora_objects_present');
 return Object.freeze({...value});
}
export async function readPreinstallState({command,args,expectedSystemIdentifier,snapshotId=null,timeoutMs=30000}={}){
 if(typeof command!=='string'||!command||!Array.isArray(args)||args.some(x=>typeof x!=='string')||
  !SYSTEM.test(expectedSystemIdentifier??'')||(snapshotId!==null&&!ID.test(snapshotId))||
  !Number.isSafeInteger(timeoutMs)||timeoutMs<1000||timeoutMs>60000)
  throw stop('invalid_preinstall_request');
 const env=safePostgresChildEnv();
 const sql="BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;\n"+
  (snapshotId===null?'':"SET TRANSACTION SNAPSHOT '"+snapshotId+"';\n")+
  INITIAL_SQL+"COMMIT;\n";
 const child=spawn(command,args,{env,stdio:['pipe','pipe','pipe']});
 let output='',overflow=false,timedOut=false;
 child.stdout.setEncoding('utf8');
 child.stdout.on('data',chunk=>{
  if(output.length+chunk.length>8192){overflow=true;child.kill('SIGKILL');}
  else output+=chunk;
 });
 child.stderr.resume();
 const result=new Promise((resolve,reject)=>{
  child.once('error',()=>reject(stop('preinstall_probe_spawn_failed')));
  child.once('close',(code,signal)=>{
   if(timedOut||overflow||code!==0||signal!==null)reject(stop('preinstall_probe_failed'));
   else resolve();
  });
 });
 child.stdin.on('error',()=>{});child.stdin.end(sql);
 const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
 try{
  await result;
  let value;try{value=JSON.parse(output.trim());}catch{throw stop('preinstall_probe_output_invalid');}
  return validatePreinstallState(value,expectedSystemIdentifier);
 }finally{clearTimeout(timer);}
}
