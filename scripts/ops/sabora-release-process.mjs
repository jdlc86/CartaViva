import {spawnSync} from 'node:child_process';
import {CONTROLLER_TOOLS,CONTROLLER_PATHS} from './sabora-release-installation.mjs';
import {releaseStop as stop} from './sabora-release-protected-store.mjs';
// Diagnostic output is an enum, never command arguments, stdout, stderr,
// environment, file paths, image labels, exception messages or credentials.
// It narrows an incident without widening process authority.
export function releaseProcessStage(tool,args){
 if(tool==='docker'){
  if(args[0]==='compose'){
   if(args.includes('config'))return 'docker_compose_config';
   if(args.includes('up'))return 'docker_compose_up';
   return 'docker_compose_other';
  }
  for(const [subject,action,label] of [
   ['container','inspect','docker_container_inspect'],['image','inspect','docker_image_inspect'],
   ['image','load','docker_image_load'],['network','inspect','docker_network_inspect']])
   if(args[0]===subject&&args[1]===action)return label;
  if(args[0]==='exec'){
   if(args[1]==='sabora-api-1')return 'docker_exec_ready';
   if(args[1]==='sabora-sabora-egress-1')return 'docker_exec_alert';
  }
  return 'docker_other';
 }
 return ['nft','ip','ss','compose','getfacl'].includes(tool)?tool:'unknown_tool';
}
export function releaseProcessFailureKind(stderr){
 const value=typeof stderr==='string'?stderr.slice(0,4*1024*1024):'';
 for(const [pattern,reason] of [
  [/cannot connect to the docker daemon|is the docker daemon running|error during connect|connection refused.*docker/i,'daemon_unavailable'],
  [/address already in use|port is already allocated|failed to bind host port/i,'port_conflict'],
  [/network .*?(?:not found|does not exist)|external network .*?could not be found/i,'network_not_found'],
  [/no such image|image .*?not found|unable to find image|pull access denied/i,'image_not_found'],
  [/no such container|container .*?not found/i,'container_not_found'],
  [/invalid reference format|invalid image reference/i,'image_reference_invalid'],
  [/unhealthy|health.?check.*(?:fail|timed out)|failed to become healthy/i,'healthcheck_failed'],
  [/container .*?exited|container .*?is not running|container .*?is restarting/i,'container_not_running'],
  [/invalid mount config|failed to mount|mount source path does not exist|not a directory/i,'mount_invalid'],
  [/failed to create shim task|oci runtime create failed|failed to create task/i,'container_create_failed'],
  [/permission denied|operation not permitted|access denied/i,'permission_denied'],
  [/no space left on device|disk quota exceeded/i,'storage_exhausted'],
  [/unknown flag|unknown shorthand flag|unknown command|not a docker command/i,'unsupported_command'],
  [/failed to solve|build.*not allowed/i,'unexpected_build'],
  [/invalid compose|validating .*?additional propert|failed to parse|yaml:|invalid interpolation/i,'compose_invalid'],
  [/context deadline exceeded|timed out|timeout/i,'deadline'],
  [/unexpected eof|unexpected end of file|archive\/tar|invalid tar|failed to extract/i,'archive_load_failed']
 ])if(pattern.test(value))return reason;
 return 'exit_nonzero';
}
// The caller constructs only fixed scoped argv. No shell, credential-bearing
// inherited environment, Docker context/host, COMPOSE_* or user config.
export function releaseProcess(tool,args,{input,timeout=120000,allowMissing=false}={}){
 if(!Object.hasOwn(CONTROLLER_TOOLS,tool)||!Array.isArray(args)||args.some(v=>typeof v!=='string'||v.includes('\0')))
  stop('process_scope');
 const result=spawnSync(CONTROLLER_TOOLS[tool],args,{input,encoding:'utf8',timeout,
  killSignal:'SIGKILL',maxBuffer:4*1024*1024,cwd:CONTROLLER_PATHS.root,
  env:{PATH:'/usr/bin:/bin',HOME:CONTROLLER_PATHS.root,LANG:'C',LC_ALL:'C',
   DOCKER_CONFIG:CONTROLLER_PATHS.root+'/docker-config'}});
 const stage=releaseProcessStage(tool,args);
 if(result.error||result.signal)stop(stage+'_timeout_or_limit');
 if(result.status!==0){
  // Only narrowly recognized absence is tolerated; daemon/permission failures
  // must never be mistaken for an unoccupied image tag or container name.
  if(allowMissing&&/No such (image|object|container):/i.test(result.stderr)&&
    !/permission|denied|connect/i.test(result.stderr))return {missing:true,stdout:''};
  stop(stage+'_failed_'+releaseProcessFailureKind(result.stderr));
 }
 return {stdout:result.stdout,status:0};
}
