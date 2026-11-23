// Transport authorization for the *only* V2 privileged entry, not a shell.
// The SSH forced-key is the authentication root; the GitHub run record is a
// scoped, expiring declaration, NOT an independently signed authorization.
import {verifyGitHubReleaseAuthorizationV2} from '../ci/sabora-release-authorization-v2.mjs';
const SHA40=/^[0-9a-f]{40}$/,SHA64=/^[0-9a-f]{64}$/;
const ID=/^GH[1-9][0-9]{5,19}-A[1-9][0-9]{0,4}$/;
const RUN=/^[1-9][0-9]{5,19}$/;
const B64=/^[A-Za-z0-9+/]+={0,2}$/;
const stop=why=>{throw Error('sabora_v2_host_stop:'+why);};
const exact=(v,fields)=>v&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).sort().join('|')===fields.slice().sort().join('|');
export function parseForcedReleaseCommandV2(command){
 if(typeof command!=='string'||command.length>280)stop('command_size');
 const words=command.split(' ');
 if(words.length!==6||words[0]!=='sabora-release-v2'||
  !['deploy','rollback'].includes(words[1])||!SHA40.test(words[2])||
  !ID.test(words[3])||!SHA64.test(words[4])||!RUN.test(words[5]))
  stop('command_invalid');
 return Object.freeze({operation:words[1],releaseSha:words[2],
  authorizationId:words[3],authorizationSha256:words[4],githubRunId:words[5]});
}
export function decodeApprovalB64(value){
 if(typeof value!=='string'||!B64.test(value)||value.length>8192)stop('approval_encoding');
 const bytes=Buffer.from(value,'base64');
 if(!bytes.length||bytes.toString('base64')!==value)stop('approval_encoding');
 return bytes.toString('utf8');
}
export function verifyHostRunEnvelopeV2(command,envelope,now=Date.now()){
 const expected=parseForcedReleaseCommandV2(command);
 if(typeof envelope!=='string'||envelope.length>8192)stop('envelope_length');
 let object;try{object=JSON.parse(envelope);}catch{stop('envelope_json');}
 if(!exact(object,['approvalB64']))stop('envelope_shape');
 const raw=decodeApprovalB64(object.approvalB64);
 const receipt=verifyGitHubReleaseAuthorizationV2(raw,{
  operation:expected.operation,sha:expected.releaseSha,runId:expected.githubRunId},now);
 if(receipt.authorizationId!==expected.authorizationId||
    receipt.authorizationSha256!==expected.authorizationSha256)
  stop('command_envelope_mismatch');
 return receipt;
}
