import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';

export function buildMigrationManifest(root){
 const dir=resolve(root,'supabase','migrations');
 const names=readdirSync(dir).filter(name=>/^\d{14}_[a-zA-Z0-9_-]+\.sql$/.test(name)).sort();
 const all=readdirSync(dir).filter(name=>name.endsWith('.sql'));
 if(all.length!==names.length)throw Error('migration_manifest_invalid_filename');
 if(names.length===0)throw Error('migration_manifest_empty');
 const versions=new Set();
 return names.map(name=>{
  const version=name.slice(0,14);
  if(versions.has(version))throw Error('migration_manifest_duplicate_version');
  versions.add(version);
  const path=join(dir,name);
  if(!statSync(path).isFile())throw Error('migration_manifest_non_file');
  const sql=readFileSync(path);
  return {name,version,sha256:createHash('sha256').update(sql).digest('hex'),bytes:sql.length};
 });
}

const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 try{
  if(process.argv.length!==2)throw Error('migration_manifest_arguments_forbidden');
  const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
  const manifest=buildMigrationManifest(root);
  process.stdout.write(JSON.stringify({schema:1,migrations:manifest},null,2)+'\n');
 }catch(error){
  process.stderr.write('migration_manifest_failed:'+error.message+'\n');
  process.exitCode=1;
 }
}
