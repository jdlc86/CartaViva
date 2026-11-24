// Shared SQL construction, not a database connection. Only the reviewed chain
// is selectable via the CLI. Production admission remains a separate boundary.
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMigrationManifest} from './migration-manifest.mjs';
import {validateMigrationAudit} from './migration-audit.mjs';
const stop=()=>{throw Error('sabora_atomic_migration_invalid');};
const digest=x=>createHash('sha256').update(x).digest('hex');
export const LEDGER_SQL=String.raw`CREATE SCHEMA sabora_migration_meta;
REVOKE ALL ON SCHEMA sabora_migration_meta FROM PUBLIC, anon, authenticated;
CREATE TABLE sabora_migration_meta.applied_migrations(
 version text PRIMARY KEY CHECK(version ~ '^[0-9]{14}$'),
 name text NOT NULL UNIQUE,
 sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 application_count integer NOT NULL DEFAULT 1 CHECK(application_count=1),
 applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
REVOKE ALL ON sabora_migration_meta.applied_migrations FROM PUBLIC, anon, authenticated;
CREATE FUNCTION sabora_migration_meta.reject_ledger_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $guard$
BEGIN RAISE EXCEPTION 'sabora_migration_ledger_append_only'; END
$guard$;
REVOKE ALL ON FUNCTION sabora_migration_meta.reject_ledger_mutation() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER sabora_migration_ledger_immutable
 BEFORE UPDATE OR DELETE OR TRUNCATE ON sabora_migration_meta.applied_migrations
 FOR EACH STATEMENT EXECUTE FUNCTION sabora_migration_meta.reject_ledger_mutation();
`;
export function renderAtomicMigration(entry,bytes,{first=false}={}){
 if(!entry||!Buffer.isBuffer(bytes)||!/^(\d{14})_[A-Za-z0-9_-]+\.sql$/.test(entry.name)||
  entry.version!==entry.name.slice(0,14)||entry.bytes!==bytes.length||
  entry.sha256!==digest(bytes))stop();
 const sql=bytes.toString('utf8');
 if(!Buffer.from(sql,'utf8').equals(bytes)||/^\s*\\/m.test(sql)||/^SET\s+CONSTRAINTS\b/im.test(sql))stop();
 const begins=[...sql.matchAll(/^BEGIN;[ \t]*\r?$/gim)];
 const commits=[...sql.matchAll(/^COMMIT;[ \t]*\r?$/gim)];
 if(begins.length!==1||commits.length!==1||begins[0].index>=commits[0].index)stop();
 const withoutComments=x=>x.replace(/--[^\n]*(?:\n|$)/g,'').trim();
 if(withoutComments(sql.slice(0,begins[0].index))||
    withoutComments(sql.slice(commits[0].index+commits[0][0].length)))stop();
 const endBegin=begins[0].index+begins[0][0].length;
 // Both schema genesis (if first) and ledger insertion are in the migration's
 // own transaction. A deferred constraint failure at COMMIT rolls back both.
 const insert="INSERT INTO sabora_migration_meta.applied_migrations(version,name,sha256) VALUES ('"+
  entry.version+"','"+entry.name+"','"+entry.sha256+"');\n";
 return sql.slice(0,endBegin)+'\n'+(first?LEDGER_SQL:'')+
  sql.slice(endBegin,commits[0].index)+'\n'+insert+sql.slice(commits[0].index)+'\n';
}
export function buildReviewedMigrationSql(root,only){
 const manifest=buildMigrationManifest(root);
 validateMigrationAudit(manifest);
 if(only!==undefined&&!manifest.some(e=>e.name===only))stop();
 return manifest.map((entry,index)=>({entry,index})).filter(x=>only===undefined||x.entry.name===only)
  .map(({entry,index})=>renderAtomicMigration(entry,readFileSync(join(root,'supabase','migrations',entry.name)),{first:index===0})).join('\n');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==3)stop();
  const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
  process.stdout.write(buildReviewedMigrationSql(root,process.argv[2]));
 }catch{process.stderr.write('sabora_atomic_migration_invalid\n');process.exitCode=1;}
}
