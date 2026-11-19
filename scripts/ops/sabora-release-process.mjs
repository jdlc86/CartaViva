import {spawnSync} from 'node:child_process';
import {CONTROLLER_TOOLS,CONTROLLER_PATHS} from './sabora-release-installation.mjs';
import {releaseStop as stop} from './sabora-release-protected-store.mjs';
// The caller constructs only fixed scoped argv. No shell, credential-bearing
// inherited environment, Docker context/host, COMPOSE_* or user config.
export function releaseProcess(tool,args,{input,timeout=120000,allowMissing=false}={}){
 if(!Object.hasOwn(CONTROLLER_TOOLS,tool)||!Array.isArray(args)||args.some(v=>typeof v!=='string'||v.includes('\0')))
  stop('process_scope');
 const result=spawnSync(CONTROLLER_TOOLS[tool],args,{input,encoding:'utf8',timeout,
  killSignal:'SIGKILL',maxBuffer:4*1024*1024,cwd:CONTROLLER_PATHS.root,
  env:{PATH:'/usr/bin:/bin',HOME:CONTROLLER_PATHS.root,LANG:'C',LC_ALL:'C',
   DOCKER_CONFIG:CONTROLLER_PATHS.root+'/docker-config'}});
 if(result.error||result.signal)stop('process_timeout_or_limit');
 if(result.status!==0){
  // Only narrowly recognized absence is tolerated; daemon/permission failures
  // must never be mistaken for an unoccupied image tag or container name.
  if(allowMissing&&/No such (image|object|container):/i.test(result.stderr)&&
    !/permission|denied|connect/i.test(result.stderr))return {missing:true,stdout:''};
  stop('scoped_'+tool+'_failed');
 }
 return {stdout:result.stdout,status:0};
}
