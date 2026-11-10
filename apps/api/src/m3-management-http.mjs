import {createHmac} from 'node:crypto';
import {createTableQrCredential} from './table-qr-credential.mjs';

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
// Fastify deliberately gives parsed query strings a hardened empty prototype
// object instead of Object.prototype. Accept that exact inert shape while
// continuing to reject arrays, accessors and attacker-controlled prototypes.
const queryRecord=value=>{
 if(value===null||typeof value!=='object'||Array.isArray(value))return false;
 const prototype=Object.getPrototypeOf(value);
 if(prototype!==null&&prototype!==Object.prototype&&
    (Object.getPrototypeOf(prototype)!==null||Reflect.ownKeys(prototype).length!==0))return false;
 return Reflect.ownKeys(value).every(key=>{
  const descriptor=typeof key==='string'?Object.getOwnPropertyDescriptor(value,key):null;
  return descriptor?.enumerable===true&&Object.hasOwn(descriptor,'value');
 });
};
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(value,key));
const verified=request=>({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff});
// SQL mutation receipts keep the field 'tableId'. A paginated read must
// instead honor the established PWA table projection contract ('id'), with
// exact fields and no QR bearer data. Reject drift rather than displaying
// a partial/incompatible administrative list.
const TABLE_PAGE_FIELDS=['tableId','number','capacity','description','readinessState',
 'orderingState','pauseUntil','qrVersion','qrEnabled','revision'];
const projectTablesPage=page=>{
 if(!exact(page,['version','items','nextAfterNumber'])||page.version!==2||
    !Array.isArray(page.items)||page.items.length>100||
    (page.nextAfterNumber!==null&&(!Number.isSafeInteger(page.nextAfterNumber)||
      page.nextAfterNumber<1)))
  throw Error('m3_tables_projection_unavailable');
 const items=page.items.map(value=>{
  if(!exact(value,TABLE_PAGE_FIELDS)||!UUID.test(value.tableId))
   throw Error('m3_tables_projection_unavailable');
  const {tableId,...fields}=value;
  return {id:tableId,...fields};
 });
 return {version:2,items,nextAfterNumber:page.nextAfterNumber};
};
const verifiedTablePermissions=request=>{
 const role=request.verifiedStaff?.role;
 if(!['admin','root','waiter'].includes(role))throw Error('m3_management_forbidden');
 // ROOT can inspect the administrative projection but cannot own routine
 // configuration writes; DB revalidates the unique owner ADMIN.
 const administrative=role==='admin';
 return {configure:administrative,qr:administrative,readiness:true,occupancy:true};
};
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

export function registerM3ManagementHttp(app,{forRoles,tables,catalog,finance=null,qr,observeFailure=()=>{}}={}){
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
  if(!queryRecord(query)||Object.keys(query).some(k=>!['afterNumber','limit'].includes(k))||
     Object.values(query).some(v=>typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v)))
   return reply.code(400).send({error:'invalid_tables_request'});
  try{
   const page=projectTablesPage(await tables.read(verified(request),{
    afterNumber:query.afterNumber===undefined?0:Number(query.afterNumber),
    limit:query.limit===undefined?50:Number(query.limit)}));
   return reply.code(200).send({...page,permissions:verifiedTablePermissions(request)});
  }
  catch(error){return failure(reply,error,'tables',observeFailure);}
 });
 app.post('/api/v1/admin/tables/actions',{preHandler:floor,bodyLimit:16_384},async(request,reply)=>{
  if(!exact(request.body,['requestId','operation','payload'])||!UUID.test(request.body.requestId??'')||
     !['create','update','readiness','qr_rotate','qr_revoke'].includes(request.body.operation)||
     !plain(request.body.payload))return reply.code(400).send({error:'invalid_tables_request'});
  const {requestId,operation}=request.body;
  // Ordinary table-management staff may set readiness but cannot mutate
  // administrative fields or QR credentials (SQL repeats this check).
  if(request.verifiedStaff?.role==='root'||
    (operation!=='readiness'&&request.verifiedStaff?.role!=='admin'))
   return reply.code(403).send({error:'forbidden'});
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
   if(request.verifiedStaff?.role==='root')
    return reply.code(403).send({error:'forbidden'});
   try{return reply.code(200).send(await tables.occupancy(verified(request),{
    tableId:request.params.tableId,...request.body}));}
   catch(error){return failure(reply,error,'tables',observeFailure);}
  });
 app.get('/api/v1/admin/finance/dashboard',{preHandler:admin},async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  reply.header('X-Content-Type-Options','nosniff');
  const q=request.query??{};
  if(!queryRecord(q)||Object.keys(q).some(k=>!['period','month'].includes(k))||
      typeof q.period!=='string'||!['today','last7','thisMonth','previousMonth'].includes(q.period)||
      (q.month!==undefined&&(typeof q.month!=='string'||!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(q.month)||
       q.period!=='thisMonth')))return reply.code(400).send({error:'invalid_finance_request'});
  if(!finance)return reply.code(503).send({error:'finance_unavailable'});
  try{return reply.code(200).send(await finance.read(verified(request),{period:q.period,
   month:q.month??null}));}
  catch(error){return failure(reply,error,'finance',observeFailure);}
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
  if(request.verifiedStaff?.role!=='admin')
   return reply.code(403).send({error:'forbidden'});
  try{return reply.code(200).send(await catalog.manage(verified(request),request.body));}
  catch(error){return failure(reply,error,'catalog',observeFailure);}
 });
}
