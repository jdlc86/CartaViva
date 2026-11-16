// A failed or lost HTTP response must not create a different financial intent.
// PostgreSQL remains the authority; this memory ledger only protects the PWA session.
const PREFIX=Object.freeze({
 report:'ui_incident_',resolve:'ui_resolution_'
});
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 Object.getPrototypeOf(value)===Object.prototype;
export function createIncidentOperationAttempts({newId=()=>crypto.randomUUID()}={}){
 if(typeof newId!=='function')throw Error('invalid_incident_attempt_factory');
 const pending=new Map(),inFlight=new Set();
 const key=(kind,subjectId)=>{
  if(!Object.hasOwn(PREFIX,kind)||!UUID.test(subjectId??''))
   throw Error('invalid_incident_attempt_scope');
  return kind+':'+subjectId.toLowerCase();
 };
 return Object.freeze({
  pending(kind,subjectId){return pending.has(key(kind,subjectId));},
  async run({kind,subjectId,payload,invoke,validateResult=()=>true}={}){
   const identity=key(kind,subjectId);
   if(!plain(payload)||typeof invoke!=='function'||typeof validateResult!=='function')
    throw Error('invalid_incident_attempt');
   const fingerprint=JSON.stringify(payload);
   if(typeof fingerprint!=='string'||fingerprint.length>4096)
    throw Error('invalid_incident_attempt_payload');
   if(inFlight.has(identity))throw Error('incident_attempt_in_flight');
   let attempt=pending.get(identity);
   if(attempt&&attempt.fingerprint!==fingerprint)
    throw Error('incident_attempt_requires_reconciliation');
   if(!attempt){
    const nonce=newId();
    if(!UUID.test(nonce??''))throw Error('invalid_incident_attempt_nonce');
    attempt=Object.freeze({fingerprint,
     correlationId:PREFIX[kind]+nonce.replaceAll('-','_').toLowerCase()});
    pending.set(identity,attempt);
   }
   inFlight.add(identity);
   try{
    const result=await invoke(attempt.correlationId);
    if(!validateResult(result))throw Error('incident_attempt_receipt_unverified');
    pending.delete(identity);
    return result;
   }finally{inFlight.delete(identity);}
  }
 });
}
