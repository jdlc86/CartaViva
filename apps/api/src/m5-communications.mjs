import {randomUUID} from 'node:crypto';
import {M2_RUNTIME_IDENTITY_SQL,M2_RUNTIME_FUNCTIONS_SQL} from './m2-runtime-capabilities.mjs';

export const M5_COMMS_ADMIN_ROLE='sabora_m5_comms_admin_runtime';
export const M5_COMMS_PUBLIC_ROLE='sabora_m5_comms_public_runtime';
export const READ_M5_COMMS_ADMIN_SQL='SELECT sabora.read_admin_communications_m5($1::jsonb) AS result';
export const MANAGE_M5_COMMS_SQL='SELECT sabora.manage_communications_m5($1::jsonb,$2::text,$3::text) AS result';
export const READ_M5_COMMS_PUBLIC_SQL='SELECT sabora.read_public_communications_m5() AS result';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LOGIN=/^[a-z][a-z0-9_]{0,62}$/;
const ROLES=new Set(['admin','root']);
const ACTIONS=new Set(['save','publish','pause','resume','withdraw']);
const isRecord=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const fields=(obj,keys)=>isRecord(obj)&&Object.keys(obj).length===keys.length&&
 keys.every(k=>Object.hasOwn(obj,k));
const bad=code=>Object.assign(Error(code),{code});
const single=answer=>{
 if(!answer||!Array.isArray(answer.rows)||answer.rows.length!==1||
    !isRecord(answer.rows[0])||!isRecord(answer.rows[0].result))
  throw bad('invalid_comms_sql_projection');
 return Object.freeze(answer.rows[0].result);
};

function actorOf(verified){
 const actorId=verified?.verifiedIdentity?.userId;
 const staffRole=verified?.verifiedStaff?.role;
 if(!UUID.test(actorId??'')||!ROLES.has(staffRole)||verified?.verifiedStaff?.userId!==actorId)
  throw bad('m3_management_forbidden');
 return {actorId:actorId.toLowerCase(),staffRole};
}
function signed(issueCapability,actor,action,requestId,body){
 const capability=issueCapability({...actor,action,requestId,body});
 if(!isRecord(capability)||capability.action!==action||
    capability.actorId!==actor.actorId||capability.staffRole!==actor.staffRole||
    capability.requestId!==requestId.toLowerCase()||
    !/^[a-f0-9]{64}$/.test(capability.bodyHashHex??'')||
    !/^[a-f0-9]{64}$/.test(capability.signatureHex??''))
  throw bad('invalid_m3_management_capability');
 return JSON.stringify(capability);
}
const MAX_IMAGE_BYTES=131_072;
export function validateM5AnnouncementDraft(draft){
 if(!fields(draft,['title','body','emoji','image','imageLicense','priority','schedule'])||
  typeof draft.title!=='string'||draft.title.trim().length<1||draft.title.trim().length>120||
  /[\u0000-\u001f\u007f]/u.test(draft.title)||
  typeof draft.body!=='string'||draft.body.trim().length<1||draft.body.length>1200||
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(draft.body)||
  typeof draft.emoji!=='string'||draft.emoji.length>12||
  !['ALTA','BAJA'].includes(draft.priority))throw bad('invalid_comms_content');
 if(draft.image===null){
  if(draft.imageLicense!==null)throw bad('invalid_comms_image_license');
 }else{
  if(typeof draft.image!=='string'||draft.image.length>175_000||
   !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/u.test(draft.image)||
   typeof draft.imageLicense!=='string'||
   draft.imageLicense.trim().length<5||draft.imageLicense.length>240||
   Buffer.from(draft.image.split(',')[1],'base64').length>MAX_IMAGE_BYTES)
    throw bad('invalid_comms_image');
  const raw=Buffer.from(draft.image.split(',')[1],'base64');
  const kind=draft.image.slice(5,draft.image.indexOf(';'));
  const png=kind==='image/png'&&raw.subarray(0,8).equals(
   Buffer.from('89504e470d0a1a0a','hex'));
  const jpeg=kind==='image/jpeg'&&raw.subarray(0,3).equals(Buffer.from('ffd8ff','hex'));
  const webp=kind==='image/webp'&&raw.subarray(0,4).toString('ascii')==='RIFF'&&
    raw.subarray(8,12).toString('ascii')==='WEBP';
  if(!png&&!jpeg&&!webp)throw bad('invalid_comms_image_signature');
 }
 const schedule=draft.schedule;
 if(!fields(schedule,['mode','startDate','endDate','weekdays','startTime','endTime','timeZone'])||
  !['once','daily','weekly'].includes(schedule.mode)||!
  /^20\d{2}-\d{2}-\d{2}$/.test(schedule.startDate)||
  (schedule.endDate!==null&&(!/^20\d{2}-\d{2}-\d{2}$/.test(schedule.endDate)||
   schedule.endDate<schedule.startDate))||
  !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(schedule.startTime)||
  !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(schedule.endTime)||
  schedule.startTime>=schedule.endTime||
  typeof schedule.timeZone!=='string'||schedule.timeZone.length<1||schedule.timeZone.length>80||
  !Array.isArray(schedule.weekdays)||schedule.weekdays.some(x=>!Number.isInteger(x)||x<1||x>7)||
  new Set(schedule.weekdays).size!==schedule.weekdays.length||
  (schedule.mode==='weekly'&&schedule.weekdays.length===0)||
  (schedule.mode!=='weekly'&&schedule.weekdays.length!==0)||
  (schedule.mode==='once'&&schedule.endDate!==schedule.startDate))
   throw bad('invalid_comms_schedule');
 try{new Intl.DateTimeFormat('en-GB',{timeZone:schedule.timeZone});}
 catch{throw bad('invalid_comms_schedule');}
 if(!Number.isFinite(Date.parse(schedule.startDate+'T12:00:00Z'))||
  new Date(schedule.startDate+'T12:00:00Z').toISOString().slice(0,10)!==schedule.startDate)
   throw bad('invalid_comms_schedule');
 if(schedule.endDate!==null&&
  new Date(schedule.endDate+'T12:00:00Z').toISOString().slice(0,10)!==schedule.endDate)
   throw bad('invalid_comms_schedule');
 return Object.freeze(draft);
}
export async function assertM5CommunicationsCapability({pool,expectedLogin,kind}){
 const role=kind==='admin'?M5_COMMS_ADMIN_ROLE:kind==='public'?M5_COMMS_PUBLIC_ROLE:null;
 const expected=kind==='admin'?
  ['sabora.manage_communications_m5(jsonb,text,text)','sabora.read_admin_communications_m5(jsonb)']:
  kind==='public'?['sabora.read_public_communications_m5()']:null;
 if(!role||!pool||typeof pool.connect!=='function'||!LOGIN.test(expectedLogin??''))
  throw bad('invalid_m5_comms_preflight');
 let client;
 try{
  client=await pool.connect();
  const row=(await client.query(M2_RUNTIME_IDENTITY_SQL))?.rows?.[0];
  if(!row||row.login_role!==expectedLogin||row.effective_role!==expectedLogin||
   row.can_login!==true||row.inherit_role!==false||row.superuser!==false||
   row.bypass_rls!==false||row.create_db!==false||row.create_role!==false||
   row.replication!==false||row.database_create!==false||row.schema_create!==false||
   row.direct_relations!==false||row.direct_sequences!==false||
   !Array.isArray(row.set_roles)||row.set_roles.length!==1||row.set_roles[0]!==role)
    throw bad('m5_comms_preflight_identity');
  const functions=(await client.query(M2_RUNTIME_FUNCTIONS_SQL,[role]))?.rows?.[0]?.names;
  if(!Array.isArray(functions)||JSON.stringify(functions)!==JSON.stringify([...expected].sort()))
   throw bad('m5_comms_preflight_rpc_surface');
  const direct=(await client.query(M2_RUNTIME_FUNCTIONS_SQL,[expectedLogin]))?.rows?.[0]?.names;
  if(!Array.isArray(direct)||direct.length)throw bad('m5_comms_preflight_login_surface');
  return true;
 }finally{client?.release();}
}

export function createM5CommunicationsRepositories({adminTx,publicTx,issueCapability,newId=randomUUID}={}){
 if(typeof adminTx!=='function'||typeof publicTx!=='function'||typeof issueCapability!=='function')
  throw bad('invalid_m5_comms_repositories');
 return Object.freeze({
  readAdmin(verified){
   const actor=actorOf(verified),requestId=newId(),body='comms.read';
   if(!UUID.test(requestId))throw bad('invalid_m5_request_id');
   const cap=signed(issueCapability,actor,'comms.read',requestId,body);
   return adminTx(query=>query(READ_M5_COMMS_ADMIN_SQL,[cap]).then(single));
  },
  manage(verified,{requestId,operation,payload}){
   const actor=actorOf(verified);
   if(!UUID.test(requestId??'')||!ACTIONS.has(operation)||
     !fields(payload,['id','revision','draft'])||
     (payload.id!==null&&!UUID.test(payload.id))||
     (payload.revision!==null&&(!Number.isSafeInteger(payload.revision)||payload.revision<1))||
     (operation==='save'&&payload.draft===null)||
     (operation!=='save'&&payload.draft!==null))throw bad('invalid_comms_request');
   if(operation==='save')validateM5AnnouncementDraft(payload.draft);
   const body=JSON.stringify(payload);
   const cap=signed(issueCapability,actor,'comms.manage',requestId,body);
   return adminTx(query=>query(MANAGE_M5_COMMS_SQL,[cap,operation,body]).then(single));
  },
  readPublic(){
   return publicTx(query=>query(READ_M5_COMMS_PUBLIC_SQL,[]).then(single));
  }
 });
}

function sendError(reply,error){
 const s=String(error?.message??'');
 const status=s.includes('forbidden')?403:s.includes('not_found')?404:
  s.includes('conflict')?409:s.startsWith('invalid_')?400:503;
 reply.header('Cache-Control','no-store');
 return reply.code(status).send({error:status===403?'forbidden':
  status===404?'comms_not_found':status===409?'comms_conflict':
  status===400?'invalid_comms_request':'comms_unavailable'});
}
export function registerM5CommunicationsHttp(app,{forRoles,repositories,stream,observeFailure=()=>{}}={}){
 if(typeof app?.get!=='function'||typeof app?.post!=='function'||
  typeof forRoles!=='function'||typeof repositories?.readPublic!=='function'||
  typeof repositories?.readAdmin!=='function'||typeof repositories?.manage!=='function'||
  typeof stream?.subscribe!=='function')throw bad('invalid_m5_comms_http');
 const staff=forRoles(['root','admin']);
 app.get('/api/v1/public/communications',async(_req,reply)=>{
  reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');
  try{return reply.code(200).send(await repositories.readPublic());}
  catch(e){try{observeFailure(e);}catch{}return sendError(reply,e);}
 });
 app.get('/api/v1/public/communications/events',(_request,reply)=>{
  reply.hijack();
  reply.raw.writeHead(200,{
   'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform',
   Connection:'keep-alive','X-Content-Type-Options':'nosniff',
   'X-Accel-Buffering':'no'
  });
  reply.raw.write('retry: 5000\nevent: changed\ndata: {}\n\n');
  const dispose=stream.subscribe(()=>{if(!reply.raw.destroyed)reply.raw.write('event: changed\ndata: {}\n\n');});
  reply.raw.on('close',dispose);
 });
 app.get('/api/v1/admin/communications',{preHandler:staff},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  try{return reply.code(200).send(await repositories.readAdmin({
   verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff}));}
  catch(e){try{observeFailure(e);}catch{}return sendError(reply,e);}
 });
 app.post('/api/v1/admin/communications/actions',{preHandler:staff,bodyLimit:200_000},
  async(request,reply)=>{
   const b=request.body;
   if(!fields(b,['requestId','operation','payload'])||!UUID.test(b.requestId??'')||
     !ACTIONS.has(b.operation)||!isRecord(b.payload))
    return reply.code(400).send({error:'invalid_comms_request'});
   try{return reply.code(200).send(await repositories.manage({
    verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff},b));}
   catch(e){try{observeFailure(e);}catch{}return sendError(reply,e);}
  });
}

// Persistent PG LISTEN + one-shot timers from next exact schedule boundary.
// Neither PWA nor server polls the database to check for changes.
export async function createM5CommunicationsStream({pool,readPublic,onFailure=()=>{},setTimer=setTimeout,clearTimer=clearTimeout}={}){
 if(typeof pool?.connect!=='function'||typeof readPublic!=='function')
  throw bad('invalid_m5_comms_stream');
 const client=await pool.connect(),listeners=new Set();
 let clock=null,closed=false,refreshing=false,pending=false;
 const publish=()=>{for(const callback of listeners){try{callback();}catch{}}};
 const refresh=async()=>{
  if(closed)return;
  if(refreshing){pending=true;return;}
  refreshing=true;
  try{
   do{
    pending=false;
    if(clock!==null){clearTimer(clock);clock=null;}
    const snapshot=await readPublic();
    publish();
    const date=snapshot?.nextTransitionAt?Date.parse(snapshot.nextTransitionAt):NaN;
    if(Number.isFinite(date)){
     const delay=Math.max(1,Math.min(2_147_000_000,date-Date.now()+25));
     clock=setTimer(()=>{clock=null;void refresh();},delay);
    }
   }while(pending&&!closed);
  }catch(e){try{onFailure(e);}catch{}publish();}
  finally{refreshing=false;}
 };
 const notify=()=>{void refresh();};
 const disconnected=e=>{if(!closed){try{onFailure(e);}catch{}publish();}};
 try{
  client.on('notification',notify);client.on('error',disconnected);
  await client.query('LISTEN sabora_comms_changed');
  await refresh();
 }catch(e){
  client.removeListener('notification',notify);client.removeListener('error',disconnected);
  client.release();throw e;
 }
 return Object.freeze({
  subscribe(callback){if(typeof callback!=='function'||closed)throw bad('invalid_m5_comms_listener');
   listeners.add(callback);return()=>listeners.delete(callback);},
  async close(){
   if(closed)return;closed=true;if(clock!==null)clearTimer(clock);
   listeners.clear();client.removeListener('notification',notify);
   client.removeListener('error',disconnected);
   try{await client.query('UNLISTEN sabora_comms_changed');}finally{client.release();}
  }
 });
}
