// Candidate-only B3 stream: session-scoped snapshot plus committed H6 outbox
// cursor replay. NOTIFY only wakes up a durable read; it never carries business data.
import {readCustomerCookie} from './customer-cookie-session-candidate.mjs';

const states=new Set(['unbound','bound','pending','approved','rejected']);
const decisions=new Set(['sabora.table_change.approved','sabora.table_change.rejected']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const validState=value=>value&&states.has(value.state)&&
 Number.isSafeInteger(value.serverNowMs)&&
 (value.boundTableId===null||typeof value.boundTableId==='string')&&
 (['pending','rejected'].includes(value.state)?
  Number.isSafeInteger(value.expiresAtMs)&&value.expiresAtMs>value.serverNowMs:
  value.expiresAtMs===null);
const validCursor=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,14})$/.test(value)&&
 Number.isSafeInteger(Number(value));
const frame=(event,data,id=null)=>`${id===null?'':`id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const backlogValid=(backlog,cursor)=>backlog&&backlog.version===1&&
 typeof backlog.resyncRequired==='boolean'&&
 Number.isSafeInteger(backlog.nextCursor)&&backlog.nextCursor>=cursor&&
 Array.isArray(backlog.events)&&backlog.events.length<=100&&
 (backlog.minAvailableCursor===null||Number.isSafeInteger(backlog.minAvailableCursor))&&
 (backlog.maxAvailableCursor===null||Number.isSafeInteger(backlog.maxAvailableCursor));

export function registerTableChangeStateStreamCandidate(scope,{tableChange,subscribeCommitted}={}){
 if(typeof scope?.get!=='function'||typeof tableChange?.readState!=='function'||
    typeof tableChange?.readDecisions!=='function'||typeof subscribeCommitted!=='function')
  throw Error('invalid_table_change_stream_configuration');
 scope.get('/table-change/events',async(request,reply)=>{
  if(!request.customerIdentity||!request.query||typeof request.query!=='object'||
     Array.isArray(request.query)||Object.keys(request.query).some(key=>key!=='after'))
   return reply.code(403).send({error:'forbidden'});
  const startValue=request.query.after??'0';
  const headerValue=request.headers['last-event-id']??'0';
  if(!validCursor(startValue)||!validCursor(headerValue))
   return reply.code(400).send({error:'invalid_event_cursor'});
  const token=readCustomerCookie(request.headers.cookie);
  if(!token)return reply.code(401).send({error:'unauthorized'});
  let cursor=Math.max(Number(startValue),Number(headerValue));
  const readState=()=>tableChange.readState({customerSessionToken:token});
  const readDecisions=()=>tableChange.readDecisions({customerSessionToken:token,
   afterCursor:cursor,limit:100});
  let firstState,firstBacklog;
  try{
   firstState=await readState();firstBacklog=await readDecisions();
   if(!validState(firstState)||!backlogValid(firstBacklog,cursor))
    throw Error('invalid_table_change_snapshot');
  }catch{return reply.code(403).send({error:'forbidden'});}
  reply.hijack();
  const response=reply.raw;
  response.statusCode=200;
  response.setHeader('Content-Type','text/event-stream; charset=utf-8');
  response.setHeader('Cache-Control','no-store, no-transform');
  response.setHeader('X-Accel-Buffering','no');
  response.setHeader('Connection','keep-alive');
  response.flushHeaders?.();
  let closed=false,running=false,dirty=false,previous='',expiry=null;
  let unsubscribe=()=>{},heartbeat=null;
  const close=()=>{
   if(closed)return;closed=true;
   clearTimeout(expiry);clearInterval(heartbeat);unsubscribe();
  };
  const emitState=state=>{
   if(!validState(state))throw Error('invalid_table_change_snapshot');
   const signature=[state.state,state.boundTableId,state.expiresAtMs].join(':');
   if(signature!==previous){
    response.write(frame('sabora.table_change.state',state));previous=signature;
   }
   clearTimeout(expiry);
   if(state.expiresAtMs!==null){
    expiry=setTimeout(()=>{void refresh();},
     Math.min(2147483647,Math.max(1,state.expiresAtMs-state.serverNowMs+50)));
    expiry.unref?.();
   }
  };
  const emitBacklog=backlog=>{
   if(!backlogValid(backlog,cursor))throw Error('invalid_table_change_backlog');
   if(backlog.resyncRequired){
    response.write(frame('resync-required',{maxAvailableCursor:backlog.maxAvailableCursor}));
    if(backlog.maxAvailableCursor!==null)
     cursor=Math.max(cursor,backlog.maxAvailableCursor);
    return;
   }
   let current=cursor;
   for(const event of backlog.events){
    if(!event||!Number.isSafeInteger(event.id)||event.id<=current||
       !UUID.test(event.eventKey??'')||!UUID.test(event.requestId??'')||
       !decisions.has(event.type)||!Number.isSafeInteger(event.expiresAtMs)||
       typeof event.createdAt!=='string'||!Number.isFinite(Date.parse(event.createdAt)))
     throw Error('invalid_table_change_backlog');
    response.write(frame(event.type,{
     eventKey:event.eventKey,requestId:event.requestId,
     expiresAtMs:event.expiresAtMs,createdAt:event.createdAt},event.id));
    current=event.id;
   }
   if(current!==backlog.nextCursor)throw Error('invalid_table_change_backlog');
   cursor=current;
  };
  const refresh=async()=>{
   if(closed)return;
   if(running){dirty=true;return;}
   running=true;
   try{
    do{
     dirty=false;
     emitState(await readState());
     const backlog=await readDecisions();
     emitBacklog(backlog);
     // Drain bounded committed pages; never poll when the cursor is caught up.
     if(backlog.events.length===100)dirty=true;
    }while(dirty&&!closed);
   }catch{
    if(!closed){
     response.write(frame('access-revoked',{reason:'scope_unavailable'}));
     response.end();close();
    }
   }finally{running=false;}
  };
  response.once('close',close);
  unsubscribe=subscribeCommitted(()=>{void refresh();});
  heartbeat=setInterval(()=>{if(!closed)response.write(': keepalive\n\n');},15000);
  heartbeat.unref?.();
  try{emitState(firstState);emitBacklog(firstBacklog);void refresh();}
  catch{response.end();close();}
 });
}

// One physical NOTIFY listener under the verified operations SQL login.
// It has no business-data privileges; every wake-up re-reads per-session SQL.
export async function createTableChangeCommitNotifier({pool,expectedLogin}={}){
 if(typeof pool?.connect!=='function'||typeof expectedLogin!=='string'||!expectedLogin)
  throw Error('invalid_table_change_notifier');
 const connection=await pool.connect();
 let ready=false;
 try{
  if(typeof connection?.on!=='function'||typeof connection?.release!=='function')
   throw Error('invalid_table_change_notifier_connection');
  const identity=await connection.query('SELECT current_user AS actor,session_user AS login');
  if(identity?.rows?.length!==1||identity.rows[0].actor!==expectedLogin||
   identity.rows[0].login!==expectedLogin)
   throw Error('invalid_table_change_notifier_login');
  const listeners=new Set();
  const receive=notification=>{
   if(notification?.channel!=='sabora_h6_table_change_changed')return;
   for(const listener of [...listeners]){try{listener();}catch{}}
  };
  connection.on('notification',receive);
  try{await connection.query('LISTEN sabora_h6_table_change_changed');}
  catch(error){connection.off?.('notification',receive);throw error;}
  let closed=false;
  ready=true;
  return Object.freeze({
   subscribe(listener){
    if(closed||typeof listener!=='function')throw Error('invalid_table_change_subscription');
    listeners.add(listener);
    return()=>listeners.delete(listener);
   },
   async close(){
    if(closed)return;
    closed=true;listeners.clear();
    try{await connection.query('UNLISTEN sabora_h6_table_change_changed');}
    finally{connection.off?.('notification',receive);connection.release();}
   }
  });
 }finally{if(!ready)connection.release(true);}
}
