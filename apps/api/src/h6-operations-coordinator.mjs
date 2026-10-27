const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
const context=value=>{
 const actorId=value?.verifiedIdentity?.userId,role=value?.verifiedStaff?.role;
 if(!UUID.test(actorId??'')||value?.verifiedStaff?.userId?.toLowerCase()!==actorId.toLowerCase()||
    !['admin','root','waiter','kitchen'].includes(role))throw Error('h6_operations_forbidden');
 return {actorId,role};
};
export function createH6OperationsCoordinator({repository,issueCapability}={}){
 if(!repository||typeof repository.acknowledgeDispatch!=='function'||
    typeof repository.reportIncident!=='function'||typeof repository.resolveIncident!=='function'||
    typeof repository.settleCash!=='function'||typeof repository.refundCash!=='function'||
    typeof repository.managePickup!=='function'||
    typeof issueCapability!=='function')
  throw Error('invalid_h6_operations_coordinator');
 const capability=(verified,action,targetId,correlationId)=>{
  const {actorId,role}=context(verified);
  if(!UUID.test(targetId??'')||!CORRELATION.test(correlationId??''))
   throw Error('invalid_h6_operation');
  return {actorId,role,capability:issueCapability({actorId,staffRole:role,action,targetId,correlationId})};
 };
 const pickupCapability=(verified,action,lineId,expectedVersion,correlationId)=>{
  const {actorId,role}=context(verified);
  if(!UUID.test(lineId??'')||!Number.isSafeInteger(expectedVersion)||expectedVersion<1||
     !CORRELATION.test(correlationId??''))throw Error('invalid_pickup_operation');
  return {actorId,role,capability:issueCapability({actorId,staffRole:role,action,targetId:lineId,
   expectedVersion,correlationId})};
 };
 return Object.freeze({
  acknowledgeDispatch(verified,{dispatchId,correlationId}={}){
   const bound=capability(verified,'ack_dispatch',dispatchId,correlationId);
   return repository.acknowledgeDispatch({dispatchId,capability:bound.capability});
  },
  reportIncident(verified,{roundId,lineId=null,origin,reason,affectedCents,correlationId}={}){
   const bound=capability(verified,'report_incident',roundId,correlationId);
   return repository.reportIncident({roundId,lineId,origin,reason,affectedCents,capability:bound.capability});
  },
  resolveIncident(verified,{incidentId,resolution,reason,correlationId}={}){
   const bound=capability(verified,'resolve_incident',incidentId,correlationId);
   return repository.resolveIncident({incidentId,resolution,reason,capability:bound.capability});
  },
  settleCash(verified,{accountId,amountCents,correlationId}={}){
   const bound=capability(verified,'settle_cash',accountId,correlationId);
   return repository.settleCash({accountId,amountCents,capability:bound.capability});
  },
  refundCash(verified,{incidentId,correlationId}={}){
   const bound=capability(verified,'refund_cash',incidentId,correlationId);
   return repository.refundCash({incidentId,capability:bound.capability});
  },
  managePickup(verified,{lineId,action,expectedVersion,correlationId}={}){
   const bound=pickupCapability(verified,action,lineId,expectedVersion,correlationId);
   return repository.managePickup({lineId,action,expectedVersion,capability:bound.capability});
  }
 });
}
