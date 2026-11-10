import {createVerifiedAdminTableReader} from './verified-admin-table-reader.mjs';

// Opt-in read-only endpoint candidate. The server bootstrap MUST inject
// hooks created from current durable membership and a least-privileged reader.
// No route is registered in server.mjs; never accept a role from query/body.
export function registerAdminTablesReadRoute(app,{forRoles,query}={}){
 if(!app||typeof app.get!=='function'||typeof forRoles!=='function'||
    typeof query!=='function')throw Error('invalid_admin_tables_route_config');
 const reader=createVerifiedAdminTableReader({query});
 app.get('/api/v1/admin/tables',{preHandler:forRoles(['admin','waiter'])},
  async(request,reply)=>{
   reply.header('Cache-Control','no-store');
   reply.header('X-Content-Type-Options','nosniff');
   const input=request.query;
   if(!input||typeof input!=='object'||Array.isArray(input)||
      Object.keys(input).some(k=>!['limit','afterNumber'].includes(k))||
      Object.values(input).some(v=>typeof v!=='string'||!/^(0|[1-9][0-9]*)$/.test(v)))
    return reply.code(400).send({error:'invalid_admin_projection_page'});
   const limit=input.limit===undefined?50:Number(input.limit);
   const afterNumber=input.afterNumber===undefined?0:Number(input.afterNumber);
   if(!Number.isSafeInteger(limit)||limit<1||limit>100||
      !Number.isSafeInteger(afterNumber)||afterNumber<0)
    return reply.code(400).send({error:'invalid_admin_projection_page'});
   try{
    return reply.code(200).send(await reader.listTables(request,{limit,afterNumber}));
   }catch(error){
    if(error?.message==='admin_projection_forbidden')
     return reply.code(403).send({error:'forbidden'});
    return reply.code(503).send({error:'admin_projection_unavailable'});
   }
  });
}
