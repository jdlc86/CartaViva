import {existsSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {protectedBytes,trustedDirectory,durableExclusive,durableReplace,releaseStop as stop} from './sabora-release-protected-store.mjs';

export function createReleaseLedger(directory){
 trustedDirectory(directory,{privateDirectory:true});
 const activePath=join(directory,'history.json'),journalPath=join(directory,'transaction.json');
 const read=path=>JSON.parse(protectedBytes(path,{privateFile:true}).toString('utf8'));
 const history=()=>existsSync(activePath)?read(activePath):{
  schema:'sabora-release-history/v1',project:'sabora',activeReleaseSha:null,versions:[]};
 const journal=()=>existsSync(journalPath)?read(journalPath):null;
 const reconcile=()=>{
  if(readdirSync(directory).some(name=>name.startsWith('.transaction-')))stop('ledger_partial_write');
  const current=journal();
  if(current&&current.state!=='healthy')stop('ledger_requires_reconciliation');
  if(current&&history().activeReleaseSha!==current.releaseSha)stop('ledger_history_disagrees');
  return history();
 };
 return {
  readHistory:history,assertReconciled:reconcile,
  consume(receipt,details){
   reconcile();
   if(!/^[A-Z0-9-]{12,64}$/.test(receipt.authorizationId))stop('ledger_bad_id');
   const record={schema:'sabora-controller-transaction/v1',authorizationId:receipt.authorizationId,
    releaseSha:receipt.releaseSha,operation:receipt.operation,authorizationSha256:receipt.authorizationSha256,
    bundleManifestSha256:receipt.bundleManifestSha256,evidence:receipt.evidence,
    previousReleaseSha:history().activeReleaseSha,phase:'admitted',state:'consumed',
    at:new Date().toISOString(),details};
   try{durableExclusive(join(directory,receipt.authorizationId+'.json'),record);}
   catch(error){if(error.code==='EEXIST')stop('authorization_replay');throw error;}
   // Crash between the immutable consumed record and journal remains a replay
   // rejection. No Docker has run. Never erase a consumed record on failure.
   durableReplace(journalPath,record);
  },
  phase(phase){
   const current=journal();
   if(!current||!['consumed','in-progress'].includes(current.state))stop('ledger_not_consumed');
   durableReplace(journalPath,{...current,state:'in-progress',phase,at:new Date().toISOString()});
  },
  fail(code){
   const current=journal();if(!current||current.state==='healthy')return;
   durableReplace(journalPath,{...current,state:'unknown',phase:'reconciliation-required',
    failure:code,at:new Date().toISOString()});
  },
  commit({receipt,operation,readiness}){
   const current=journal(),prior=history(),at=new Date().toISOString();
   if(!current||current.authorizationId!==receipt.authorizationId||current.state!=='in-progress')stop('ledger_transaction_mismatch');
   const versions=prior.versions.filter(v=>v.releaseSha!==receipt.releaseSha);
   if(versions.length>=100)stop('retention_requires_operator');
   // Previously healthy versions stay healthy and selectable for app rollback.
   versions.push({releaseSha:receipt.releaseSha,bundleManifestSha256:receipt.bundleManifestSha256,status:'healthy',verifiedAt:at});
   durableExclusive(join(directory,receipt.authorizationId+'.result.json'),{
    ...current,state:'healthy',phase:'postchecks-committed',at,readiness});
   durableReplace(activePath,{...prior,activeReleaseSha:receipt.releaseSha,versions});
   durableReplace(journalPath,{...current,state:'healthy',phase:'postchecks-committed',at,readiness});
   return {durablyRecorded:true,releaseSha:receipt.releaseSha,operation};
  }
 };
}
