import {lstat,readFile,realpath} from 'node:fs/promises';
import {dirname,isAbsolute,join,relative,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {createSaboraObservability} from './operational-observability.mjs';
import {materializeOperationalM3Options} from './operational-activation-manifest.mjs';
import {installOperationalSignalHandlers,startOperationalM3Runtime} from './operational-runtime.mjs';
import {assertPilotActivation} from './pilot-activation-gate.mjs';

const generic=()=>Error('sabora_operational_startup_failed');

async function readBoundedFile(path,maxBytes){
 const info=await lstat(path);
 if(!info.isFile()||info.isSymbolicLink()||info.size<1||info.size>maxBytes)throw generic();
 return readFile(path,'utf8');
}

export function createFileSecretResolver(directory){
 if(typeof directory!=='string'||!isAbsolute(directory))throw generic();
 const root=resolve(directory);
 return async ref=>{
  if(typeof ref!=='string'||!/^[a-z][a-z0-9_-]{2,63}$/.test(ref))throw generic();
  const candidate=join(root,ref);
  const [rootInfo,candidateInfo]=await Promise.all([lstat(root),lstat(candidate)]);
  if(!rootInfo.isDirectory()||rootInfo.isSymbolicLink()||!candidateInfo.isFile()||
     candidateInfo.isSymbolicLink())throw generic();
  const [rootReal,fileReal]=await Promise.all([realpath(root),realpath(candidate)]);
  if(relative(rootReal,fileReal).startsWith('..')||dirname(fileReal)!==rootReal)throw generic();
  return (await readBoundedFile(fileReal,16384)).replace(/\r?\n$/,'');
 };
}

export async function startOperationalServerFromFiles({env=process.env,Pool=pg.Pool,
 fetchImpl,observability=createSaboraObservability()}={}){
 try{
  const manifestPath=env.SABORA_OPERATIONAL_MANIFEST_FILE;
  const secretsDirectory=env.SABORA_OPERATIONAL_SECRETS_DIR;
  if(env.NODE_ENV!=='production'||typeof manifestPath!=='string'||!isAbsolute(manifestPath)||
     typeof secretsDirectory!=='string'||!isAbsolute(secretsDirectory))throw generic();
  const raw=await readBoundedFile(manifestPath,262144);
  let manifest;try{manifest=JSON.parse(raw);}catch{throw generic();}
  if(manifest?.stage!=='production')throw generic();
  assertPilotActivation(manifest.activationEvidence);
  const resources=await materializeOperationalM3Options({manifest,Pool,
   resolveSecret:createFileSecretResolver(secretsDirectory),fetchImpl,observability});
  const runtime=await startOperationalM3Runtime({options:resources.options,
   listener:resources.listener,resources,observability});
  return Object.freeze({...runtime,summary:resources.summary});
 }catch{throw generic();}
}

const main=process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url;
if(main){
 try{
  const runtime=await startOperationalServerFromFiles();
  installOperationalSignalHandlers(runtime);
 }catch{
  process.stderr.write('sabora_operational_startup_failed\n');
  process.exitCode=1;
 }
}
