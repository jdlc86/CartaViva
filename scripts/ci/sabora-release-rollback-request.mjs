// Small signed rollback request. No image transfer or GitHub artifact needed.
// The host must use a previously verified, retained Sabora-only release.
import {fileURLToPath} from 'node:url';
import {parseForcedReleaseCommand,verifyHostEnvelope} from '../ops/sabora-release-host-agent.mjs';
import {planSaboraRollback} from '../ops/sabora-release-rollback-plan.mjs';
function stop(code){throw Error('sabora_rollback_wire_stop:'+code);}
export function renderRollbackEnvelope({approvalB64,signatureB64}){
 if(![approvalB64,signatureB64].every(v=>typeof v==='string'&&
   v.length>10&&v.length<16384&&/^[A-Za-z0-9+/]+={0,2}$/.test(v)))
  stop('invalid_signed_request');
 return JSON.stringify({protocol:'sabora-rollback-wire/v1',approvalB64,signatureB64})+'\n';
}
export async function verifyRollbackEnvelope(source,{command,publicKey,history,observed,
  readProtectedHistory,observeExclusiveRuntime,now=Date.now()}){
 if(parseForcedReleaseCommand(command).operation!=='rollback')stop('not_rollback_operation');
 let text='';
 for await(const chunk of source){
  text+=chunk.toString('utf8');
  if(text.length>32768)stop('excessive_or_unexpected_input');
 }
 if(!text.endsWith('\n')||text.indexOf('\n')!==text.length-1)stop('unexpected_rollback_frame');
 let h;
 try{h=JSON.parse(text.slice(0,-1));}catch{stop('invalid_rollback_json');}
 if(!h||typeof h!=='object'||Array.isArray(h)||
  Object.keys(h).sort().join('|')!=='approvalB64|protocol|signatureB64'||
  h.protocol!=='sabora-rollback-wire/v1')stop('invalid_rollback_protocol');
 const receipt=verifyHostEnvelope(command,JSON.stringify({approvalB64:h.approvalB64,
  signatureB64:h.signatureB64}),publicKey,now);
 // Fetch host state only after signature/command validity is established.
 if(!history){
  if(typeof readProtectedHistory!=='function')stop('trusted_history_unavailable');
  history=await readProtectedHistory();
 }
 if(!observed){
  if(typeof observeExclusiveRuntime!=='function')stop('trusted_observer_unavailable');
  observed=await observeExclusiveRuntime();
 }
 const plan=planSaboraRollback({authorization:receipt,history,observed});
 return {receipt,plan};
}
const self=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(self){
 try{
  if(process.argv.length!==2)stop('no_cli_args_allowed');
  process.stdout.write(renderRollbackEnvelope({
   approvalB64:process.env.SABORA_APPROVAL_JSON_B64,
   signatureB64:process.env.SABORA_APPROVAL_SIG_B64
  }));
 }catch(error){
  process.stderr.write(String(error?.message||error).replace(/[^a-zA-Z0-9:_-]/g,'_')+'\n');
  process.exitCode=1;
 }
}
