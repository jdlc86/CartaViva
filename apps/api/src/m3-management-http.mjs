import {createHmac} from 'node:crypto';
import {createTableQrCredential} from './table-qr-credential.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(value,key));
const verified=request=>({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff});
const failure=(reply,error,kind,observeFailure)=>{
 const code=typeof error?.message==='string'?error.message:'';
 if(['m3_management_forbidden','staff_not_authorized'].includes(code))
  return reply.code(403).send({error:'forbidden'});
 if(code.endsWith('_not_found'))return reply.code(404).send({error:`${kind}_not_found`});
 if(code.includes('conflict')||code.includes('not_publishable')||code.includes('not_withdrawable')||
    code.includes('not_available'))return reply.code(409).send({error:`${kind}_conflict`});
 if(code.startsWith('invalid_'))return reply.code(400).send({error:`invalid_${kind}_request`});
 try{observeFailure(error);}catch{}
 return reply.code(503).send({error:`${kind}_unavailable`});
};
const deriveEntropy=(secret,operation,requestId)=>createHmac('sha256',secret)
 .update(`sabora-qr-v1\0${operation}\0${requestId}`,'utf8').digest();

export function registerM3ManagementHttp(app,{forRoles,tables,catalog,qr,observeFailure=()=>{}}={}){
 if(!app||typeof app.get!=='function'||typeof app.post!=='function'||
    typeof forRoles!=='function'||!tables||!catalog||!qr||typeof observeFailure!=='function'||
    typeof qr.secret!=='string'||Buffer.byteLength(qr.secret,'utf8')<32||
    typeof qr.origin!=='string'||typeof qr.restaurantCode!=='string')
  throw Error('invalid_m3_management_http');
 // Validate the complete public QR contract before any route can commit a
 // table mutation. A bad origin/code must fail startup, never after SQL has
 // stored a new hash whose one-time delivery could no longer be recovered.
 createTableQrCredential({origin:qr.origin,restaurantCode:qr.restaurantCode,
  tableId:'00000000-0000-4000-8000-000000000001',randomBytesImpl:()=>Buffer.alloc(32,1),
  allowInsecureLoopback:qr.allowInsecureLoopback===true});
 const floor=forRoles(['admin','root','waiter']);
 const admin=forRoles(['admin','root']);
 app.get('/api/v1/admin/tables',{preHandler:floor},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  const query=request.query??{};
  if(!plain(query)||Object.keys(query).some(k=>!['afterNumber','limit'].includes(k))||
     Object.values(query).some(v=>typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v)))
   return reply.code(400).send({error:'invalid_tables_request'});
  try{return reply.code(200).send(await tables.read(verified(request),{
   afterNumber:query.afterNumber===undefined?0:Number(query.afterNumber),
   limit:query.limit===undefined?50:Number(query.limit)}));}
  catch(error){return failure(reply,error,'tables',observeFailure);}
 });
 app.post('/api/v1/admin/tables/actions',{preHandler:admin,bodyLimit:16_384},async(request,reply)=>{
  if(!exact(request.body,['requestId','operation','payload'])||!UUID.test(request.body.requestId??'')||
     !['create','update','readiness','qr_rotate','qr_revoke'].includes(request.body.operation)||
     !plain(request.body.payload))return reply.code(400).send({error:'invalid_tables_request'});
  const {requestId,operation}=request.body;
  let payload={...request.body.payload},entropy,token;
  if(operation==='create'||operation==='qr_rotate'){
   entropy=deriveEntropy(qr.secret,operation,requestId);
   token=entropy.toString('base64url');payload={...payload,qrToken:token};
  }
  try{
   const result=await tables.manage(verified(request),{requestId,operation,payload});
   if(operation!=='create'&&operation!=='qr_rotate')return reply.code(200).send(result);
   const credential=createTableQrCredential({origin:qr.origin,restaurantCode:qr.restaurantCode,
    tableId:result.tableId,randomBytesImpl:()=>entropy,
    allowInsecureLoopback:qr.allowInsecureLoopback===true});
   if(credential.token!==token)throw Error('invalid_table_qr_credential');
   return reply.code(operation==='create'&&result.replayed!==true?201:200)
    .send({...result,qrPayload:credential.payload});
  }catch(error){return failure(reply,error,'tables',observeFailure);}
 });
 app.post('/api/v1/admin/tables/:tableId/occupancy',
  {preHandler:floor,bodyLimit:2048},async(request,reply)=>{
   if(!UUID.test(request.params?.tableId??'')||
      !exact(request.body,['requestId','target','pauseUntil'])||
      !UUID.test(request.body.requestId??'')||
      !['open','paused','closed'].includes(request.body.target)||
      (request.body.pauseUntil!==null&&typeof request.body.pauseUntil!=='string'))
    return reply.code(400).send({error:'invalid_tables_request'});
   try{return reply.code(200).send(await tables.occupancy(verified(request),{
    tableId:request.params.tableId,...request.body}));}
   catch(error){return failure(reply,error,'tables',observeFailure);}
  });
 app.get('/api/v1/admin/catalog',{preHandler:admin},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  try{return reply.code(200).send(await catalog.read(verified(request)));}
  catch(error){return failure(reply,error,'catalog',observeFailure);}
 });
 app.post('/api/v1/admin/catalog/actions',{preHandler:admin,bodyLimit:65_536},async(request,reply)=>{
  if(!exact(request.body,['requestId','operation','payload'])||!UUID.test(request.body.requestId??'')||
     typeof request.body.operation!=='string'||!plain(request.body.payload))
   return reply.code(400).send({error:'invalid_catalog_request'});
  try{return reply.code(200).send(await catalog.manage(verified(request),request.body));}
  catch(error){return failure(reply,error,'catalog',observeFailure);}
 });
}
