// Discovery for the distributed PWA. Every operation still checks its own
// session, table/visit, role and SQL capability.
export function registerPublishedCustomerFeatures(app,{tableChange,waiterCalls,isAvailable}){
 if(typeof tableChange!=='boolean'||typeof waiterCalls!=='boolean'||typeof isAvailable!=='function')
  throw Error('invalid_published_customer_features');
 app.get('/api/v1/customer/features',async(_request,reply)=>{
  reply.header('Cache-Control','no-store');
  if(!isAvailable())return reply.code(503).send({error:'customer_features_unavailable'});
  return {tableChange,waiterCalls};
 });
}
