// Candidate PWA-facing repricing state machine. No network, storage or automatic acceptance.
// The UI must call accept() only from a deliberate customer interaction.
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
 (Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const safeCents=v=>Number.isSafeInteger(v)&&v>=0;
const safeRevision=v=>Number.isSafeInteger(v)&&v>0;
const tokenPattern=/^v1\.[0-9]{1,16}\.[a-f0-9]{64}\.[a-f0-9]{64}$/;
const fields=['schemaVersion','previousTotalCents','currentTotalCents',
 'differenceCents','previousPublishedRevision','currentPublishedRevision',
 'acceptanceToken','expiresAt'];
export function parseRepricingChallenge(response,{nowMs=Date.now()}={}){
 if(!plain(response)||response.error!=='acceptance_required'||
    !plain(response.repricing)||!Number.isSafeInteger(nowMs)||nowMs<0)
  throw Error('invalid_repricing_challenge');
 const r=response.repricing;
 if(Object.keys(r).length!==fields.length||fields.some(key=>!Object.hasOwn(r,key))||
    r.schemaVersion!==1||!safeCents(r.previousTotalCents)||
    !safeCents(r.currentTotalCents)||!Number.isSafeInteger(r.differenceCents)||
    r.currentTotalCents-r.previousTotalCents!==r.differenceCents||
    !safeRevision(r.previousPublishedRevision)||
    !safeRevision(r.currentPublishedRevision)||
    r.currentPublishedRevision===r.previousPublishedRevision||
    typeof r.acceptanceToken!=='string'||!tokenPattern.test(r.acceptanceToken)||
    !Number.isSafeInteger(r.expiresAt)||r.expiresAt<=nowMs)
  throw Error('invalid_repricing_challenge');
 return Object.freeze({...r});
}
export function createRepricingConsentController({submit,clock=Date.now}={}){
 if(typeof submit!=='function'||typeof clock!=='function')
  throw Error('invalid_repricing_controller');
 let pending=null;
 let inFlight=false;
 let generation=0;
 const status=()=>pending?'awaiting_explicit_acceptance':'idle';
 return Object.freeze({
  get status(){return status();},
  get comparison(){return pending?Object.freeze({
   previousTotalCents:pending.challenge.previousTotalCents,
   currentTotalCents:pending.challenge.currentTotalCents,
   differenceCents:pending.challenge.differenceCents,
   previousPublishedRevision:pending.challenge.previousPublishedRevision,
   currentPublishedRevision:pending.challenge.currentPublishedRevision,
   expiresAt:pending.challenge.expiresAt
  }):null;},
  present(response,originalRequest){
   if(inFlight)throw Error('repricing_request_in_flight');
   if(!plain(originalRequest)||Object.hasOwn(originalRequest,'acceptanceToken'))
    throw Error('invalid_repricing_request');
   const challenge=parseRepricingChallenge(response,{nowMs:clock()});
   generation++;
   pending={challenge,request:structuredClone(originalRequest),generation};
   return this.comparison;
  },
  decline(){generation++;pending=null;},
  async accept(){
   if(inFlight)throw Error('repricing_request_in_flight');
   if(!pending)throw Error('repricing_acceptance_not_pending');
   const current=pending;
   if(clock()>=current.challenge.expiresAt){
    generation++;pending=null;throw Error('repricing_acceptance_expired');
   }
   inFlight=true;
   // Clear before network: an accidental double click cannot re-send consent.
   pending=null;
   try{
    const result=await submit({...structuredClone(current.request),
     acceptanceToken:current.challenge.acceptanceToken});
    // A second repricing must be displayed again, never accepted recursively.
    if(plain(result)&&result.error==='acceptance_required')
     this.present(result,current.request);
    return result;
   }finally{inFlight=false;}
  }
 });
}
