// Candidate-only: read SQL-verified state after a committed notification.
// No business data is trusted from NOTIFY. No route is mounted by default.
import {readCustomerCookie} from './customer-cookie-session-candidate.mjs';

const stateNames=new Set(['unbound','bound','pending','approved','rejected']);
const valid=value=>value&&stateNames.has(value.state)&&
 Number.isSafeInteger(value.serverNowMs)&&
 (value.boundTableId===null||typeof value.boundTableId==='string')&&
 (['pending','rejected'].includes(value.state)?
  Number.isSafeInteger(value.expiresAtMs)&&value.expiresAtMs>value.serverNowMs:
  value.expiresAtMs===null);
const frame=(event,data)=>'event: '+event+'\ndata: '+JSON.stringify(data)+'\n\n';

export function registerTableChangeStateStreamCandidate(scope,{tableChange,subscribeCommitted}={}){
 if(typeof scope?.get!=='function'||typeof tableChange?.readState!=='function'||
    typeof subscribeCommitted!=='function')throw Error('invalid_table_change_stream_configuration');
 scope.get('/table-change/events',async(request,reply)=>{
  if(!request.customerIdentity||Object.keys(request.query??{}).length)
   return reply.code(403).send({error:'forbidden'});
  const token=readCustomerCookie(request.headers.cookie);
  if(!token)return reply.code(401).send({error:'unauthorized'});
  const read=()=>tableChange.readState({customerSessionToken:token});
  let initial;
  try{initial=await read();if(!valid(initial))throw Error('invalid_state');}
  catch{return reply.code(403).send({error:'forbidden'});}
  reply.hijack();
  const response=reply.raw;
  response.statusCode=200;
  response.setHeader('Content-Type','text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control','no-store, no-transform');
  response.setHeader('X-Accel-Buffering','no');
  response.flushHeaders?.();
  let closed=false,running=false,dirty=false,previous='',expiry=null;
  let unsubscribe=()=>{};
  const close=()=>{if(closed)return;closed=true;clearTimeout(expiry);unsubscribe();};
  const deliver=state=>{
   if(!valid(state))throw Error('invalid_state');
   const signature=[state.state,state.boundTableId,state.expiresAtMs].join(':');
   if(signature!==previous){response.write(frame('sabora.table_change.state',state));previous=signature;}
   clearTimeout(expiry);
   if(state.expiresAtMs!==null){
    expiry=setTimeout(()=>{void refresh();},
     Math.min(2147483647,Math.max(1,state.expiresAtMs-state.serverNowMs+50)));
    expiry.unref?.();
   }
  };
  const refresh=async()=>{
   if(closed)return;
   if(running){dirty=true;return;}
   running=true;
   try{do{dirty=false;deliver(await read());}while(dirty&&!closed);}
   catch{response.write(frame('access-revoked',{}));response.end();close();}
   finally{running=false;}
  };
  response.once('close',close);
  unsubscribe=subscribeCommitted(()=>{void refresh();});
  try{deliver(initial);void refresh();}catch{response.end();close();}
 });
}
