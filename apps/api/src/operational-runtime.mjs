import {createM3RestaurantCandidate} from './m3-restaurant-candidate.mjs';

const invalid=()=>Error('operational_runtime_startup_failed');

export async function startOperationalM3Runtime({options,listener,resources,
 createCandidate=createM3RestaurantCandidate,observability=null}={}){
 if(!options||typeof options!=='object'||!listener||typeof listener!=='object'||
    !['127.0.0.1','0.0.0.0'].includes(listener.host)||
    !Number.isSafeInteger(listener.port)||listener.port<0||listener.port>65535||
    typeof createCandidate!=='function'||(resources!==undefined&&typeof resources?.close!=='function'))
  throw invalid();
 let candidate=null,closePromise=null;
 const close=()=>{
  if(!closePromise)closePromise=(async()=>{
   const results=await Promise.allSettled([candidate?.close(),resources?.close()]);
   try{observability?.lifecycle('stopped_operational_candidate');}catch{}
   if(results.some(result=>result.status==='rejected'))throw Error('operational_runtime_close_failed');
  })();
  return closePromise;
 };
 try{
  // Force trust-source availability before the factory opens any listener.
  const keys=await options.staff?.getTrustedKeys?.();
  if(!Array.isArray(keys)||keys.length<1)throw invalid();
  candidate=await createCandidate(options);
  if(candidate?.mode!=='opt-in-h3-h6-m3-candidate'||typeof candidate.app?.listen!=='function')
   throw invalid();
  const origin=await candidate.app.listen({host:listener.host,port:listener.port});
  const ready=await candidate.app.inject({method:'GET',url:'/ready'});
  if(ready.statusCode!==200)throw invalid();
  try{observability?.lifecycle('started_operational_candidate');}catch{}
  return Object.freeze({app:candidate.app,origin,mode:'operational-h3-h6-m3-candidate',close});
 }catch{
  try{await close();}catch{}
  throw invalid();
 }
}

export function installOperationalSignalHandlers(runtime,{processRef=process}={}){
 if(!runtime||typeof runtime.close!=='function'||!processRef||
    typeof processRef.once!=='function'||typeof processRef.removeListener!=='function')throw invalid();
 let stopping=false;
 const stop=()=>{
  if(stopping)return;stopping=true;
  Promise.resolve(runtime.close()).then(()=>{processRef.exitCode=0;},()=>{processRef.exitCode=1;});
 };
 processRef.once('SIGINT',stop);processRef.once('SIGTERM',stop);
 return Object.freeze({remove(){
  processRef.removeListener('SIGINT',stop);processRef.removeListener('SIGTERM',stop);
 }});
}
