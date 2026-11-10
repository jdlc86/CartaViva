#!/usr/bin/env node
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildMigrationManifest} from './migration-manifest.mjs';

function escapeRegExp(value){
 return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
}

export function assertDisposableMigrationTarget({env,container}){
 if(env.GITHUB_ACTIONS!=='true'||!env.RUNNER_TEMP||!env.GITHUB_RUN_ID)
  throw Error('migration_preflight_github_harness_required');
 if(typeof container!=='string'||!new RegExp(`^sabora-pg-single-ci-${escapeRegExp(env.GITHUB_RUN_ID)}-[0-9]+$`).test(container))
  throw Error('migration_preflight_foreign_container_denied');
 return {kind:'docker-container',network:'none',name:container};
}

export function buildMigrationPreflight({root,env,container,repositorySha}){
 if(!/^[a-f0-9]{40}$/i.test(repositorySha||''))throw Error('migration_preflight_invalid_repository_sha');
 const target=assertDisposableMigrationTarget({env,container});
 const migrations=buildMigrationManifest(root);
 return {schema:1,repositorySha:repositorySha.toLowerCase(),target,migrations};
}

const self=process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(self){
 try{
  if(process.argv.length!==4||process.argv[2]!=='--container')
   throw Error('migration_preflight_arguments_forbidden');
  const root=resolve(fileURLToPath(new URL('../..',import.meta.url)));
  const repositorySha=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const result=buildMigrationPreflight({root,env:process.env,container:process.argv[3],repositorySha});
  process.stdout.write(JSON.stringify(result,null,2)+'\n');
 }catch(error){
  process.stderr.write('migration_preflight_failed:'+error.message+'\n');
  process.exitCode=1;
 }
}
