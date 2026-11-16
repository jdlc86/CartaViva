const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORRELATION=/^[A-Za-z0-9_-]{8,128}$/;
const context=value=>{
 const actorId=value?.verifiedIdentity?.userId,role=value?.verifiedStaff?.role;
 if(!UUID.test(actorId??'')||value?.verifiedStaff?.userId?.toLowerCase()!==actorId.toLowerCase()||
    !['admin','root','waiter','kitchen'].includes(role))throw Error('h6_operations_forbidden');
 return {actorId,role};
};
export function createH6OperationsCoordinator({repository,issueCapability,refundEconomicIncident=null}={}){
 if(!repository||typeof repository.acknowledgeDispatch!=='function'||
    typeof repository.reportIncident!=='function'||typeof repository.resolveIncident!=='function'||
    typeof repository.managePickup!=='function'||typeof repository.setCatalogSoldOut!=='function'||
    typeof issueCapability!=='function'||
    (refundEconomicIncident!==null&&typeof refundEconomicIncident!=='function'))
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
 const reconcileEconomicRefund=async(result,incidentId)=>{
  if(result?.state!=='refund_due'||refundEconomicIncident===null)return result;
  if(!UUID.test(incidentId??''))throw Error('invalid_h6_incident_result');
  let refund;
  try{refund=await refundEconomicIncident(incidentId);}
  catch(error){
   // The legacy pay-as-ordered ledger owns its own refund attempt. Only the
   // exact absence of an economic attempt selects that existing path; provider
   // or SQL failures remain visible and retryable.
   if(error instanceof Error&&error.message==='refund_not_found')return result;
   throw error;
  }
  return refund?.state==='succeeded'?Object.freeze({...result,state:'resolved'}):result;
 };
 return Object.freeze({
  acknowledgeDispatch(verified,{dispatchId,correlationId}={}){
   const bound=capability(verified,'ack_dispatch',dispatchId,correlationId);
   return repository.acknowledgeDispatch({dispatchId,capability:bound.capability});
  },
  async reportIncident(verified,{roundId,lineId=null,origin,reason,affectedCents,correlationId}={}){
   const bound=capability(verified,'report_incident',roundId,correlationId);
   const result=await repository.reportIncident({roundId,lineId,origin,reason,affectedCents,
    capability:bound.capability});
   return reconcileEconomicRefund(result,result?.incidentId);
  },
  async resolveIncident(verified,{incidentId,resolution,reason,correlationId}={}){
   const bound=capability(verified,'resolve_incident',incidentId,correlationId);
   const result=await repository.resolveIncident({incidentId,resolution,reason,capability:bound.capability});
   return reconcileEconomicRefund(result,incidentId);
  },
  closeAccount(verified,{accountId,correlationId}={}){
   if(typeof repository.closeAccount!=='function')throw Error('h6_account_close_unavailable');
   const bound=capability(verified,'close_account',accountId,correlationId);
   return repository.closeAccount({accountId,capability:bound.capability});
  },
  setCatalogSoldOut(verified,{itemId,soldOut,correlationId}={}){
   if(typeof soldOut!=='boolean')throw Error('invalid_catalog_availability_operation');
   const bound=capability(verified,'set_catalog_sold_out',itemId,correlationId);
   return repository.setCatalogSoldOut({itemId,soldOut,capability:bound.capability});
  },
  managePickup(verified,{lineId,action,expectedVersion,correlationId}={}){
   const bound=pickupCapability(verified,action,lineId,expectedVersion,correlationId);
   return repository.managePickup({lineId,action,expectedVersion,capability:bound.capability});
  }
 });
}
