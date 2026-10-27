const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&
 (Object.getPrototypeOf(value)===Object.prototype||Object.getPrototypeOf(value)===null);
const exact=(value,keys)=>plain(value)&&Reflect.ownKeys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(value,key));
const verified=request=>({verifiedIdentity:request.verifiedIdentity,verifiedStaff:request.verifiedStaff});
const FORBIDDEN=new Set(['h6_operations_forbidden','invalid_h6_staff_capability','h6_staff_action_forbidden',
 'incident_line_scope_forbidden','expired_h6_staff_capability','cash_refund_forbidden',
 'invalid_pickup_capability','expired_pickup_capability','pickup_action_forbidden','pickup_scope_forbidden']);
const NOT_FOUND=new Set(['dispatch_not_found','round_not_found','incident_not_found','payment_attempt_not_found',
 'pickup_task_not_found']);
const CONFLICT=new Set(['dispatch_not_acknowledgeable','cash_settlement_conflict',
 'customer_cancellation_limits_not_configured','h6_idempotency_conflict','incident_already_resolved',
 'incident_exceeds_captured_amount','incident_exceeds_cash_paid','incident_payment_not_reconcilable',
 'kitchen_refund_cannot_be_denied','payment_outcome_unknown','cash_refund_not_due']);
const INPUT=new Set(['invalid_h6_operation','invalid_h6_dispatch_request','invalid_h6_incident_request',
 'invalid_h6_incident_resolution','invalid_h6_cash_settlement','invalid_h6_cash_refund',
 'invalid_incident_request','invalid_incident_resolution','invalid_cash_settlement','invalid_pickup_operation']);
const failure=(reply,error)=>{
 const code=typeof error?.message==='string'?error.message:'';
 if(FORBIDDEN.has(code))return reply.code(403).send({error:'forbidden'});
 if(NOT_FOUND.has(code))return reply.code(404).send({error:'h6_operation_not_found'});
 if(CONFLICT.has(code))return reply.code(409).send({error:'h6_operation_conflict'});
 if(INPUT.has(code))return reply.code(400).send({error:'invalid_h6_operation'});
 return reply.code(503).send({error:'h6_operations_unavailable'});
};
export function registerH6OperationsHttp(app,{forRoles,operations}={}){
 if(!app||typeof app.post!=='function'||typeof forRoles!=='function'||!operations)
  throw Error('invalid_h6_operations_http');
 const any=forRoles(['admin','root','waiter','kitchen']);
 app.post('/api/v1/operations/dispatches/:dispatchId/ack',{preHandler:any,bodyLimit:2048},async(request,reply)=>{
  if(!UUID.test(request.params?.dispatchId??'')||!exact(request.body,['correlationId'])||
     !CORRELATION.test(request.body.correlationId))return reply.code(400).send({error:'invalid_h6_operation'});
  try{return reply.code(200).send(await operations.acknowledgeDispatch(verified(request),{
   dispatchId:request.params.dispatchId,correlationId:request.body.correlationId}));}
  catch(error){return failure(reply,error);}
 });
 app.post('/api/v1/operations/rounds/:roundId/incidents',{preHandler:any,bodyLimit:4096},async(request,reply)=>{
  const body=request.body;
  if(!UUID.test(request.params?.roundId??'')||!exact(body,['lineId','origin','reason','affectedCents','correlationId'])||
     (body.lineId!==null&&!UUID.test(body.lineId))||!['kitchen','waiter_customer','waiter_restaurant'].includes(body.origin)||
     typeof body.reason!=='string'||!Number.isSafeInteger(body.affectedCents)||!CORRELATION.test(body.correlationId))
   return reply.code(400).send({error:'invalid_h6_operation'});
  try{return reply.code(201).send(await operations.reportIncident(verified(request),{
   roundId:request.params.roundId,...body}));}catch(error){return failure(reply,error);}
 });
 const admin=forRoles(['admin','root']);
 app.post('/api/v1/operations/incidents/:incidentId/resolution',{preHandler:admin,bodyLimit:2048},async(request,reply)=>{
  const body=request.body;
  if(!UUID.test(request.params?.incidentId??'')||!exact(body,['resolution','reason','correlationId'])||
     !['approve','reject'].includes(body.resolution)||typeof body.reason!=='string'||!CORRELATION.test(body.correlationId))
   return reply.code(400).send({error:'invalid_h6_operation'});
  try{return reply.code(200).send(await operations.resolveIncident(verified(request),{
   incidentId:request.params.incidentId,...body}));}catch(error){return failure(reply,error);}
 });
 const floor=forRoles(['admin','root','waiter']);
 const pickupReply=(reply,result)=>{
  if(result?.outcome==='conflict')return reply.code(409).send({error:'pickup_claim_conflict',pickup:result});
  return reply.code(200).send(result);
 };
 const pickupRoute=(path,roles,action)=>app.post(path,{preHandler:roles,bodyLimit:2048},async(request,reply)=>{
  const body=request.body,lineId=request.params?.lineId;
  if(!UUID.test(lineId??'')||!exact(body,['expectedVersion','correlationId'])||
     !Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1||
     !CORRELATION.test(body.correlationId))return reply.code(400).send({error:'invalid_h6_operation'});
  try{return pickupReply(reply,await operations.managePickup(verified(request),{
   lineId,action,expectedVersion:body.expectedVersion,correlationId:body.correlationId}));}
  catch(error){return failure(reply,error);}
 });
 pickupRoute('/api/v1/operations/order-lines/:lineId/pickup-claim',floor,'claim_pickup');
 pickupRoute('/api/v1/operations/order-lines/:lineId/pickup-claim/cancel',floor,'cancel_pickup');
 pickupRoute('/api/v1/operations/order-lines/:lineId/ready-correction',
  forRoles(['admin','root','kitchen']),'correct_ready');
 app.post('/api/v1/operations/accounts/:accountId/cash-settlements',{preHandler:floor,bodyLimit:2048},async(request,reply)=>{
  const body=request.body;
  if(!UUID.test(request.params?.accountId??'')||!exact(body,['amountCents','correlationId'])||
     !Number.isSafeInteger(body.amountCents)||body.amountCents<1||!CORRELATION.test(body.correlationId))
   return reply.code(400).send({error:'invalid_h6_operation'});
  try{return reply.code(201).send(await operations.settleCash(verified(request),{
   accountId:request.params.accountId,...body}));}catch(error){return failure(reply,error);}
 });
 app.post('/api/v1/operations/incidents/:incidentId/cash-refund',{preHandler:floor,bodyLimit:2048},async(request,reply)=>{
  const body=request.body;
  if(!UUID.test(request.params?.incidentId??'')||!exact(body,['correlationId'])||
     !CORRELATION.test(body.correlationId))return reply.code(400).send({error:'invalid_h6_operation'});
  try{return reply.code(201).send(await operations.refundCash(verified(request),{
   incidentId:request.params.incidentId,correlationId:body.correlationId}));}
  catch(error){return failure(reply,error);}
 });
}
