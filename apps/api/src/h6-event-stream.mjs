import {randomUUID} from 'node:crypto';
import {readCustomerCookie} from './customer-cookie-session-candidate.mjs';
import {hashCustomerSessionToken} from './customer-session.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY=/^[A-Za-z0-9_-]{16,128}$/;
const cursor=value=>{
 if(value===undefined||value===null||value==='')return 0;
 if(typeof value!=='string'||!(/^(0|[1-9][0-9]{0,15})$/).test(value))return null;
 const parsed=Number(value);return Number.isSafeInteger(parsed)?parsed:null;
};
const exactQuery=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Reflect.ownKeys(value).every(key=>typeof key==='string'&&keys.includes(key));
const frame=(event,data,id=null)=>`${id===null?'':`id: ${id}\n`}event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function openStream(request,reply,{load,subscribeCommitted,heartbeatMs}){
 reply.hijack();
 const response=reply.raw;
 response.statusCode=200;
 response.setHeader('Content-Type','text/event-stream; charset=utf-8');
 response.setHeader('Cache-Control','no-store, no-transform');
 response.setHeader('Connection','keep-alive');
 response.setHeader('X-Accel-Buffering','no');
 response.flushHeaders?.();
 let closed=false,running=false,dirty=false,lastCursor=cursor(request.headers['last-event-id']);
 if(lastCursor===null){response.end(frame('stream-error',{error:'invalid_event_cursor'}));return;}
 const close=()=>{if(closed)return;closed=true;clearInterval(heartbeat);unsubscribe?.();};
 const refresh=async()=>{
  if(closed)return;
  if(running){dirty=true;return;}
  running=true;
  try{
   do{
    dirty=false;
    const backlog=await load(lastCursor);
    if(!backlog||backlog.version!==1||!Array.isArray(backlog.events)||
       typeof backlog.resyncRequired!=='boolean')throw Error('invalid_h6_event_backlog');
    if(backlog.resyncRequired){
     response.write(frame('resync-required',{minAvailableCursor:backlog.minAvailableCursor,
      maxAvailableCursor:backlog.maxAvailableCursor}));
     response.end();close();return;
    }
    for(const event of backlog.events){
     const id=Number(event?.id);
     if(!Number.isSafeInteger(id)||id<=lastCursor||typeof event?.type!=='string')
      throw Error('invalid_h6_event_backlog');
     response.write(frame(event.type,{eventKey:event.eventKey,aggregateId:event.aggregateId,
      aggregateVersion:event.aggregateVersion,payload:event.payload,createdAt:event.createdAt},id));
     lastCursor=id;
    }
   }while(dirty&&!closed);
  }catch{
   if(!closed){response.write(frame('access-revoked',{reason:'scope_unavailable'}));response.end();close();}
  }finally{running=false;}
 };
 const unsubscribe=subscribeCommitted(()=>{void refresh();});
 // Recheck durable authorization even when no NOTIFY arrives: staff can be
 // revoked while the SSE connection is otherwise idle.
 const heartbeat=setInterval(()=>{
  if(!closed){response.write(': keepalive\\n\\n');void refresh();}
 },heartbeatMs);
 heartbeat.unref?.();
 // Incoming request 'close' can fire after its headers/body finish, while
 // the hijacked SSE response remains active. Track the outgoing stream instead.
 response.once('close',close);
 void refresh();
}

export function registerH6CustomerEventStreamHttp(app,{cookieAuth,events,subscribeCommitted,
 heartbeatMs=15_000}={}){
 if(!app||typeof app.get!=='function'||!cookieAuth||typeof cookieAuth.authenticate!=='function'||
    !events||typeof events.read!=='function'||typeof subscribeCommitted!=='function'||
    !Number.isSafeInteger(heartbeatMs)||heartbeatMs<5_000||heartbeatMs>60_000)
  throw Error('invalid_h6_customer_sse_config');
 app.get('/api/v1/customer/events',{preHandler:cookieAuth.authenticate},async(request,reply)=>{
  const query=request.query;
  if(!exactQuery(query,['tableId','visitId','accountId'])||!UUID.test(query.tableId??'')||
     !KEY.test(query.visitId??'')||!UUID.test(query.accountId??''))
   return reply.code(400).send({error:'invalid_event_scope'});
  const token=readCustomerCookie(request.headers.cookie),sessionHash=hashCustomerSessionToken(token);
  if(!sessionHash)return reply.code(401).send({error:'unauthorized'});
  return openStream(request,reply,{heartbeatMs,subscribeCommitted,
   load:afterCursor=>events.read({sessionHash,tableId:query.tableId,visitId:query.visitId,
    accountId:query.accountId,afterCursor,limit:100})});
 });
}

export function registerH6StaffEventStreamHttp(app,{forRoles,events,issueCapability,
 subscribeCommitted,heartbeatMs=15_000,newCorrelation=randomUUID}={}){
 if(!app||typeof app.get!=='function'||typeof forRoles!=='function'||!events||
    typeof events.readStaffEvents!=='function'||typeof issueCapability!=='function'||
    typeof subscribeCommitted!=='function'||typeof newCorrelation!=='function'||
    !Number.isSafeInteger(heartbeatMs)||heartbeatMs<5_000||heartbeatMs>60_000)
  throw Error('invalid_h6_staff_sse_config');
 const protectedRoles=forRoles(['admin','root','waiter','kitchen']);
 app.get('/api/v1/operations/events',{preHandler:protectedRoles},async(request,reply)=>{
  if(!exactQuery(request.query,[]))return reply.code(400).send({error:'invalid_event_scope'});
  const actorId=request.verifiedIdentity?.userId,staffRole=request.verifiedStaff?.role;
  if(!UUID.test(actorId??''))return reply.code(403).send({error:'forbidden'});
  return openStream(request,reply,{heartbeatMs,subscribeCommitted,
   load:afterCursor=>events.readStaffEvents({afterCursor,limit:100,capability:issueCapability({
    actorId,staffRole,action:'read_events',targetId:actorId,correlationId:newCorrelation()})})});
 });
}

// LISTEN is event-driven and carries only a cursor hint. Every consumer still
// re-reads its authorized durable backlog; no business data trusts NOTIFY.
export async function createPostgresH6OutboxNotifier({pool}={}){
 if(!pool||typeof pool.connect!=='function')throw Error('invalid_h6_outbox_notifier');
 const client=await pool.connect();
 const listeners=new Set();
 const onNotification=message=>{
  if(message?.channel!=='sabora_h6_event_committed')return;
  for(const listener of [...listeners]){try{listener();}catch{}}
 };
 try{client.on('notification',onNotification);await client.query('LISTEN sabora_h6_event_committed');}
 catch(error){try{client.release(true);}catch{}throw error;}
 let closed=false;
 return Object.freeze({
  subscribe(listener){
   if(closed||typeof listener!=='function')throw Error('invalid_h6_outbox_subscription');
   listeners.add(listener);return()=>listeners.delete(listener);
  },
  async close(){
   if(closed)return;closed=true;listeners.clear();
   try{await client.query('UNLISTEN sabora_h6_event_committed');}finally{
    client.off?.('notification',onNotification);client.release();
   }
  }
 });
}
