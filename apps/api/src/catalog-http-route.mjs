import {readPublishedCatalog} from './catalog-reader-query.mjs';
// Explicitly registered only after provisioning a dedicated catalog reader pool.
// No credentials, cookies, staff privileges or draft access.
export function registerCatalogHttpRoute(app,{query}={}){
 if(!app||typeof app.get!=='function'||typeof query!=='function')
  throw Error('invalid_catalog_route_configuration');
 app.get('/api/v1/catalog',async(request,reply)=>{
  reply.header('Cache-Control','no-store');
  reply.header('X-Content-Type-Options','nosniff');
  try{
   const items=await readPublishedCatalog(query);
   return reply.code(200).send(items);
  }catch{
   return reply.code(503).send({error:'catalog_unavailable'});
  }
 });
}
