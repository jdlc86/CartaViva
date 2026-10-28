const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const exact=(value,allowed)=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Reflect.ownKeys(value).every(key=>typeof key==='string'&&allowed.includes(key));
const verified=request=>({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff});
const integer=(value,fallback)=>{
 if(value===undefined)return fallback;if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,6})$/.test(value))return null;
 const parsed=Number(value);return Number.isSafeInteger(parsed)?parsed:null;
};
function failure(reply,error){
 if(error?.message==='staff_directory_forbidden')return reply.code(403).send({error:'forbidden'});
 if(error?.message==='staff_directory_not_found')return reply.code(404).send({error:'staff_member_not_found'});
 if(error?.message==='invalid_staff_directory_request')
  return reply.code(400).send({error:'invalid_staff_directory_request'});
 return reply.code(503).send({error:'staff_directory_unavailable'});
}
function headers(reply){reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');}

export function registerStaffDirectoryHttpCandidate(app,{forRoles,directory}={}){
 if(!app||typeof app.get!=='function'||typeof forRoles!=='function'||!directory||
    typeof directory.list!=='function'||typeof directory.detail!=='function'||
    typeof directory.self!=='function')throw Error('invalid_staff_directory_http_config');
 const admin=forRoles(['admin']),staff=forRoles(['admin','waiter','kitchen']);
 app.get('/api/v1/staff/directory',{preHandler:admin},async(request,reply)=>{
  headers(reply);if(!exact(request.query,['search','cursor','limit']))
   return reply.code(400).send({error:'invalid_staff_directory_request'});
  const cursor=integer(request.query.cursor,0),limit=integer(request.query.limit,20);
  if(cursor===null||limit===null||limit<1||limit>50||
     (request.query.search!==undefined&&typeof request.query.search!=='string'))
   return reply.code(400).send({error:'invalid_staff_directory_request'});
  try{return reply.code(200).send(await directory.list(verified(request),{
   search:request.query.search??null,cursor,limit}));}catch(error){return failure(reply,error);}
 });
 app.get('/api/v1/staff/directory/:enrollmentId',{preHandler:admin},async(request,reply)=>{
  headers(reply);if(!exact(request.query,[])||!UUID.test(request.params?.enrollmentId??''))
   return reply.code(400).send({error:'invalid_staff_directory_request'});
  try{return reply.code(200).send(await directory.detail(verified(request),{
   enrollmentId:request.params.enrollmentId}));}catch(error){return failure(reply,error);}
 });
 app.get('/api/v1/staff/me',{preHandler:staff},async(request,reply)=>{
  headers(reply);if(!exact(request.query,[]))return reply.code(400).send({error:'invalid_staff_directory_request'});
  try{return reply.code(200).send(await directory.self(verified(request)));}
  catch(error){return failure(reply,error);}
 });
}
