// S46: immutable, read-only PostgreSQL 17 scope observation. Not a signer or migrator.
// No operational SQL credentials ever enter GitHub Actions. Observe is off-host custodial only.
import {createHash} from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,chmodSync,lstatSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {buildMigrationManifest} from './migration-manifest.mjs';

export const PROJECT_ID='byhvmumqivmunkmomhup';
export const DIRECT_HOST=`db.${PROJECT_ID}.supabase.co`;
export const REPO='jdlc86/CartaViva';
const sha256=x=>createHash('sha256').update(x).digest('hex');
const sha40=v=>typeof v==='string'&&/^[0-9a-f]{40}$/.test(v);
const hash64=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)&&!/^0+$/.test(v);
const stop=reason=>{throw Error('sabora_s46_stop:'+reason);};
const keys=['project_schemas','project_roles','project_memberships','project_relations',
 'project_routines','project_types','project_triggers','project_policies',
 'project_event_triggers','project_default_acls'];
function canonical(value){
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
 return JSON.stringify(value);
}
export function validateTransport({host,user,port,expectedSystemIdSha256,caPemB64,password}){
 // Deliberately DIRECT only. Pooler DNS or project alias requires its own approved contract.
 if(host!==DIRECT_HOST||user!=='postgres'||String(port)!=='5432')stop('unapproved_database_endpoint');
 if(!hash64(expectedSystemIdSha256))stop('expected_cluster_identity_missing');
 if(typeof password!=='string'||password.length<8)stop('password_missing');
 let pem;
 try{pem=Buffer.from(caPemB64||'','base64').toString('utf8');}
 catch{stop('ca_missing');}
 if(!/^-----BEGIN CERTIFICATE-----\r?\n[\s\S]+-----END CERTIFICATE-----\s*$/.test(pem)||pem.length>32*1024)
  stop('approved_ca_missing');
 return {host,user,port:5432,caPem:pem};
}
export function checkSnapshot(s,{expectedSystemIdSha256,expectedDatabase='postgres',now=Date.now()}={}){
 if(!s||typeof s!=='object'||Array.isArray(s))stop('invalid_snapshot');
 if(s.database!==expectedDatabase||s.session_user!=='postgres'||s.postgres_major!==17)stop('wrong_database_or_version');
 if(s.ssl_active!==true||!/^TLSv1\.[23]$/.test(s.ssl_version||''))stop('tls_session_not_valid');
 if(typeof s.pgcrypto_version!=='string'||!/^\d+(?:\.\d+)*$/.test(s.pgcrypto_version))stop('pgcrypto_in_extensions_required');
 if(typeof s.system_identifier!=='string'||!/^\d{8,25}$/.test(s.system_identifier)||
  sha256(s.system_identifier)!==expectedSystemIdSha256)stop('cluster_identity_mismatch');
 const ts=Date.parse(s.observed_at);
 if(!Number.isFinite(ts)||Math.abs(now-ts)>10*60*1000)stop('observation_stale_or_future');
 for(const field of keys){if(!Array.isArray(s[field])||!s[field].every(v=>typeof v==='string'))stop('catalog_shape_invalid');
  if(s[field].length!==0)stop('preexisting_sabora_scope:'+field);}
 if(s.ledger_exists!==false||s.core_exists!==false)stop('previous_sabora_installation');
 return {schema:'sabora-s46-readonly-observation/v1',repository:REPO,projectId:PROJECT_ID,
  database:s.database,postgresMajor:17,observedAt:s.observed_at,
  sourceSystemIdSha256:sha256(s.system_identifier),
  catalogSha256:sha256(canonical(s)),sslMode:'verify-full',tlsProtocol:s.ssl_version,
  migrationExecutionAuthorized:false,dbaSigned:false,originalCatalogCustodied:false,
  ddlConcurrencyExcluded:false,operationalGo:false,
  checks:['sabora-schemas-absent','sabora-roles-and-memberships-absent',
   'sabora-prefixed-objects-absent','sabora-ledger-absent','pgcrypto-in-extensions','tls-verify-full']};
}
export function assertRunner({githubActions,repository,ref,sha,expectedSha,runnerTemp}){
 if(githubActions!=='true'||repository!==REPO||ref!=='refs/heads/main'||!sha40(sha)||sha!==expectedSha||
  !runnerTemp||!runnerTemp.startsWith('/'))stop('wrong_ci_context');
 return sha;
}
export function manifestReceipt(root,sha){
 if(!sha40(sha))stop('wrong_sha');
 const migrations=buildMigrationManifest(root);
 if(migrations.length<1)stop('empty_migration_tree');
 return {schema:'sabora-s46-migration-inventory/v1',sourceSha:sha,
  count:migrations.length,manifestSha256:sha256(canonical(migrations))};
}
export function assertCustodian({env,root}){
 if(env.GITHUB_ACTIONS==='true'||env.SABORA_S46_OPERATOR_APPROVAL!=='explicit-one-time-readonly')
  stop('offhost_custodian_required');
 const dir=env.SABORA_S46_OUTPUT_DIR;
 if(typeof dir!=='string'||!dir.startsWith('/')||dir===root||dir.startsWith(root+'/'))
  stop('private_output_outside_repo_required');
 const st=lstatSync(dir);
 if(!st.isDirectory()||st.uid!==process.getuid()||(st.mode&0o777)!==0o700)
  stop('private_output_permissions_required');
 return dir;
}
function loadPrivateFile(path,{secret}){
 if(typeof path!=='string'||!path.startsWith('/'))stop('approved_absolute_file_required');
 const st=lstatSync(path);
 if(!st.isFile()||st.uid!==process.getuid()||st.size<1||st.size>32768||
  (secret&&(st.mode&0o777)!==0o600))stop('custodian_file_permissions_required');
 return readFileSync(path,'utf8');
}
function main(){
 const mode=process.argv[2];if(!['plan','observe'].includes(mode)||process.argv.length!==3)stop('invalid_operation');
 const env=process.env;
 const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
 let sha;
 if(mode==='plan'){
  sha=assertRunner({githubActions:env.GITHUB_ACTIONS,repository:env.GITHUB_REPOSITORY,
   ref:env.GITHUB_REF,sha:env.GITHUB_SHA,expectedSha:env.SABORA_S46_RELEASE_SHA,runnerTemp:env.RUNNER_TEMP});
 }else{
  assertCustodian({env,root});
  sha=env.SABORA_S46_RELEASE_SHA;
  if(!sha40(sha))stop('wrong_sha');
 }
 const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
 const mainHead=execFileSync('git',['rev-parse','origin/main'],{cwd:root,encoding:'utf8'}).trim();
 if(head!==sha||mainHead!==sha)stop('sha_not_exact_main');
 const manifest=manifestReceipt(root,sha);
 if(mode==='plan'){
  process.stdout.write('sabora_s46_plan_only:'+JSON.stringify(manifest)+'\n');return;
 }
 const password=loadPrivateFile(env.SABORA_S46_DB_PASSWORD_FILE,{secret:true}).replace(/\r?\n$/,'');
 const caPem=loadPrivateFile(env.SABORA_S46_DB_CA_FILE,{secret:false});
 const t=validateTransport({host:env.SABORA_S46_DB_HOST,user:env.SABORA_S46_DB_USER,
  port:env.SABORA_S46_DB_PORT,expectedSystemIdSha256:env.SABORA_S46_EXPECTED_SYSTEM_ID_SHA256,
  caPemB64:Buffer.from(caPem).toString('base64'),password});
 const outputDir=env.SABORA_S46_OUTPUT_DIR;
 const dir=mkdtempSync(join(outputDir,'.sabora-s46-'));
 const ca=join(dir,'approved-root-ca.pem');
 try{
  chmodSync(dir,0o700);writeFileSync(ca,t.caPem,{mode:0o600});
  const result=spawnSync('psql',['-X','-w','-q','-t','-A','-v','ON_ERROR_STOP=1','--file',join(root,'scripts/ci/sabora-s46-dba-readonly.sql')],{
   env:{PATH:env.PATH||'/usr/bin:/bin',HOME:dir,LANG:'C',PGHOST:t.host,PGPORT:String(t.port),
    PGUSER:t.user,PGDATABASE:'postgres',PGPASSWORD:password,
    PGSSLMODE:'verify-full',PGSSLROOTCERT:ca,PGCONNECT_TIMEOUT:'10',
    PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=15000'},
   encoding:'utf8',maxBuffer:512*1024,timeout:45000});
  if(result.error||result.status!==0)stop('connection_or_readonly_query_failed');
  const out=result.stdout.trim();
  if(out.length>128*1024||out.split('\n').length!==1)stop('unexpected_psql_output');
  let snapshot;try{snapshot=JSON.parse(out);}catch{stop('invalid_psql_json');}
  const observation=checkSnapshot(snapshot,{expectedSystemIdSha256:env.SABORA_S46_EXPECTED_SYSTEM_ID_SHA256});
  const receipt={...observation,migration:manifest};
  const output=join(outputDir,'sabora-s46-unsigned-readonly-observation-'+sha+'.json');
  writeFileSync(output,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
  process.stdout.write('sabora_s46_readonly_observed:no_sql_writes:no_dba_signature:no_migration_authorization\n');
 }finally{rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main()}catch(e){
  const code=String(e.message).startsWith('sabora_s46_stop:')?e.message:'sabora_s46_stop:internal_error';
  process.stderr.write(code+'\n');process.exitCode=1;
 }
}
