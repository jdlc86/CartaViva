// One-time genesis executor. Not a release workflow; no Actions, Docker or shell.
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMigrationManifest} from '../ci/migration-manifest.mjs';
import {buildReviewedMigrationSql,CV005_CHECK_SQL} from '../ci/sabora-s46-atomic-migration.mjs';
import {assertSaboraExecutor,canonical,checkSnapshot,manifestReceipt,validateTransport,loadPrivateFile,writePrivateReceipt,PROJECT_ID} from '../ci/sabora-s46-dba-readonly.mjs';
const stop=reason=>{throw Error('sabora_genesis_stop:'+reason);};
const jsonSql=value=>"pg_catalog.convert_from(pg_catalog.decode('"+Buffer.from(JSON.stringify(value),'utf8').toString('base64')+"','base64'),'UTF8')::jsonb";
export const GENESIS_OK='sabora_s51_genesis_catalog_ledger_verified';
export function buildGenesisSql(root,snapshot){
 const raw=readFileSync(join(root,'scripts/ci/sabora-s46-dba-readonly.sql'),'utf8');
 const select=raw.match(/\n(SELECT row_to_json\(observation\)::text[\s\S]+)\s*;\s*\nROLLBACK;\s*$/);
 if(!select)stop('observation_sql_shape');
 const guard=[
  'DO $s51_genesis$ DECLARE live jsonb; expected jsonb := '+jsonSql(snapshot)+';',
  'BEGIN',
  " IF NOT pg_catalog.pg_try_advisory_lock(513046,1) THEN RAISE EXCEPTION 'sabora_genesis_concurrent'; END IF;",
  " IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=session_user::text AND rolcanlogin AND rolcreaterole AND rolbypassrls AND NOT rolsuper) OR current_user<>session_user THEN RAISE EXCEPTION 'sabora_genesis_dba_denied'; END IF;",
  ' SELECT ('+select[1]+')::jsonb INTO live;',
  " IF live IS NULL OR (live-'observed_at') IS DISTINCT FROM (expected-'observed_at') OR abs(extract(epoch FROM clock_timestamp()-(expected->>'observed_at')::timestamptz))>600 THEN RAISE EXCEPTION 'sabora_genesis_catalog_drift'; END IF;",
  " IF to_regnamespace('sabora') IS NOT NULL OR to_regnamespace('sabora_migration_meta') IS NOT NULL THEN RAISE EXCEPTION 'sabora_genesis_not_empty'; END IF;",
  'END; $s51_genesis$;',''
 ].join('\n');
 const manifest=buildMigrationManifest(root).map(({version,name,sha256})=>({version,name,sha256,application_count:1}));
 const post=[
  CV005_CHECK_SQL,
  'DO $s51_post$ DECLARE actual jsonb; BEGIN',
  " SELECT jsonb_agg(jsonb_build_object('version',version,'name',name,'sha256',sha256,'application_count',application_count) ORDER BY version) INTO actual FROM sabora_migration_meta.applied_migrations;",
  " IF actual IS DISTINCT FROM "+jsonSql(manifest)+" THEN RAISE EXCEPTION 'sabora_genesis_ledger_mismatch'; END IF;",
  " IF EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE left(rolname,7)='sabora_' AND (rolcanlogin OR rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb)) THEN RAISE EXCEPTION 'sabora_genesis_role_escalation'; END IF;",
  " IF (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sabora' AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)<>73 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='sabora' AND c.relkind='r' AND NOT (c.relrowsecurity AND c.relforcerowsecurity)) THEN RAISE EXCEPTION 'sabora_genesis_force_rls'; END IF;",
  " IF has_schema_privilege('anon','sabora','USAGE') OR has_schema_privilege('authenticated','sabora','USAGE') OR has_schema_privilege('anon','sabora_migration_meta','USAGE') OR has_schema_privilege('authenticated','sabora_migration_meta','USAGE') THEN RAISE EXCEPTION 'sabora_genesis_browser_scope'; END IF;",
  'END; $s51_post$;',
  "SELECT '"+GENESIS_OK+"';",''
 ].join('\n');
 return buildReviewedMigrationSql(root,undefined,{firstGuard:guard})+'\n'+post;
}
export function assertSqlApproval(env,manifest,catalogSha256){
 if(env.SABORA_S46_SQL_APPROVAL!=='explicit-first-genesis-migration'||
    env.SABORA_S46_DDL_EXCLUSION!=='verified-by-authorized-operator'||
    env.SABORA_S46_APPROVED_MIGRATION_MANIFEST_SHA256!==manifest.manifestSha256||
    env.SABORA_S46_APPROVED_CATALOG_SHA256!==catalogSha256)stop('separate_sql_approval_required');
 const number=(key,max)=>{
  const value=env[key];if(typeof value!=='string'||!/^[1-9][0-9]{0,8}$/.test(value)||Number(value)>max)stop('approved_timeout_required');
  return Number(value);
 };
 const statement=number('SABORA_S46_STATEMENT_TIMEOUT_MS',300000);
 const lock=number('SABORA_S46_LOCK_TIMEOUT_MS',60000);
 const total=number('SABORA_S46_TOTAL_TIMEOUT_MS',1800000);
 if(lock>statement||statement>total)stop('invalid_timeout_order');
 return {statement,lock,total};
}
function main(){
 if(process.argv.length!==3||process.argv[2]!=='apply')stop('invalid_operation');
 const env=process.env,root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
 assertSaboraExecutor({env,root});
 const sha=env.SABORA_S46_RELEASE_SHA;
 if(!/^[0-9a-f]{40}$/.test(sha||''))stop('wrong_sha');
 const git=(args)=>execFileSync('/usr/bin/git',args,{cwd:root,encoding:'utf8'}).trim();
 if(git(['rev-parse','HEAD'])!==sha||git(['rev-parse','origin/main'])!==sha||
    git(['status','--porcelain','--untracked-files=all']))stop('exact_clean_main_required');
 // Live main/CI and provenance must already have been checked by the authorized
 // operator through the existing GitHub channel; a local ref is not that proof.
 const manifest=manifestReceipt(root,sha),output=env.SABORA_S46_OUTPUT_DIR;
 const path=name=>join(output,'sabora-s46-'+name+'-'+sha+'.json');
 const read=name=>JSON.parse(loadPrivateFile(path(name),{secret:true,maxBytes:128*1024}));
 const snapshot=read('original-catalog'),receipt=read('unsigned-readonly-observation');
 const checked=checkSnapshot(snapshot,{expectedSystemIdSha256:env.SABORA_S46_EXPECTED_SYSTEM_ID_SHA256});
 if(canonical(receipt)!==canonical({...checked,migration:manifest,originalCatalogCustodied:true}))stop('observation_receipt_mismatch');
 const limits=assertSqlApproval(env,manifest,checked.catalogSha256);
 const sql=buildGenesisSql(root,snapshot);
 const password=loadPrivateFile(env.SABORA_S46_DB_PASSWORD_FILE,{secret:true}).replace(/\r?\n$/,'');
 const caPem=loadPrivateFile(env.SABORA_S46_DB_CA_FILE,{secret:false});
 const t=validateTransport({host:env.SABORA_S46_DB_HOST,user:env.SABORA_S46_DB_USER,
  port:env.SABORA_S46_DB_PORT,expectedSystemIdSha256:env.SABORA_S46_EXPECTED_SYSTEM_ID_SHA256,
  caPemB64:Buffer.from(caPem).toString('base64'),password});
 const record={schema:'sabora-genesis-attempt/v1',projectId:PROJECT_ID,sourceSha:sha,
  migration:manifest,catalogSha256:checked.catalogSha256,startedAt:new Date().toISOString(),
  backupPerformed:false,restorePerformed:false,realUsersAllowed:false,operationalGo:false};
 // The exclusive, fsynced intent is never overwritten. Missing result means STOP
 // and reconciliation. It is not a new approval authority.
 writePrivateReceipt(path('genesis-intent'),JSON.stringify(record,null,2)+'\n');
 const dir=mkdtempSync(join(output,'.sabora-genesis-')),ca=join(dir,'approved-root-ca.pem');
 try{
  writeFileSync(ca,t.caPem,{mode:0o600,flag:'wx'});
  const result=spawnSync('/usr/bin/psql',['-X','-w','-q','-t','-A','-v','ON_ERROR_STOP=1','--file=-'],{
   input:sql,env:{PATH:'/usr/bin:/bin',HOME:dir,LANG:'C',PGHOST:t.host,PGPORT:String(t.port),
    PGUSER:t.user,PGDATABASE:'postgres',PGPASSWORD:password,PGSSLMODE:'verify-full',PGSSLROOTCERT:ca,
    PGCONNECT_TIMEOUT:'10',PGOPTIONS:'-c statement_timeout='+limits.statement+' -c lock_timeout='+limits.lock},
   encoding:'utf8',maxBuffer:4*1024*1024,timeout:limits.total});
  const good=!result.error&&result.status===0&&result.stdout.trim().split('\n').at(-1)===GENESIS_OK;
  writePrivateReceipt(path('genesis-result'),JSON.stringify({...record,completedAt:new Date().toISOString(),
   status:good?'catalog-ledger-verified':'unknown-stop-reconcile',ledgerValidated:good,
   runtimeHmacValidated:false},null,2)+'\n');
  if(!good)stop('result_unknown_reconcile_no_retry');
  process.stdout.write(GENESIS_OK+'\n');
 }finally{rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{main();}catch(e){process.stderr.write((String(e.message).startsWith('sabora_genesis_stop:')?e.message:'sabora_genesis_stop:internal_error')+'\n');process.exitCode=1;}
}
