#!/usr/bin/env node
// Offline triage only: SQL pattern detection is not a migration safety approval.
import {readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMigrationManifest} from './migration-manifest.mjs';

export function migrationRiskInventory(root){
 return buildMigrationManifest(root).map(item=>{
  const sql=readFileSync(join(root,'supabase','migrations',item.name),'utf8');
  const signals={
   extension:/\bcreate\s+extension\b/i.test(sql),
   roles_or_grants:/\b(create|alter)\s+role\b|\b(grant|revoke)\b/i.test(sql),
   security_definer:/\bsecurity\s+definer\b/i.test(sql),
   rls_or_policies:/\b(row\s+level\s+security|create\s+policy|alter\s+policy|drop\s+policy)\b/i.test(sql),
   destructive_sql:/\b(drop|truncate)\s+(table|schema|column|function|type)\b|\btruncate\b/i.test(sql),
   data_mutation:/\b(insert\s+into|update\s+\S+\s+set|delete\s+from)\b/i.test(sql),
   potentially_blocking_ddl:/\b(alter\s+table|create\s+(unique\s+)?index|drop\s+index|lock\s+table)\b/i.test(sql),
   functions_or_triggers:/\b(create|replace|drop)\s+(or\s+replace\s+)?(function|trigger|procedure)\b/i.test(sql)
  };
  return {...item,signals,manual_review_required:true,
   reversibility:'unverified',lock_impact:'unverified',external_dependencies:'unverified'};
 });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{
  if(process.argv.length!==2)throw Error('risk_inventory_arguments_forbidden');
  const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
  process.stdout.write(JSON.stringify({schema:1,classification:'heuristic_not_approval',migrations:migrationRiskInventory(root)},null,2)+'\n');
 }catch(e){process.stderr.write('risk_inventory_failed:'+e.message+'\n');process.exitCode=1;}
}
