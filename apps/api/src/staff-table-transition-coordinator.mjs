// Candidate application boundary for staff table transitions.
// The actor comes only from a trusted authenticated session resolver.
// No route is mounted and no SQL role is granted by this module.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const allowed=new Set(['open','paused','closed']);
export function createStaffTableTransitionCoordinator({withTransaction,resolveStaffSession,transition}={}){
 if(typeof withTransaction!=='function'||typeof resolveStaffSession!=='function'||
    typeof transition!=='function')throw Error('invalid_staff_transition_coordinator');
 return async function changeTableState(input={}){
  if(!input||typeof input!=='object'||Array.isArray(input)||
     (Object.getPrototypeOf(input)!==Object.prototype&&Object.getPrototypeOf(input)!==null)||
     Reflect.ownKeys(input).some(k=>typeof k!=='string'||
       !['credential','tableId','target','pauseUntil'].includes(k)||
       !Object.prototype.propertyIsEnumerable.call(input,k)||
       !Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptors(input),k)||
       !Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(input,k),'value')))
   throw Error('invalid_staff_transition_request');
  const {credential,tableId,target,pauseUntil=null}=input;
  if(typeof credential!=='string'||credential.length<32||credential.length>4096||
     !uuid.test(tableId)||!allowed.has(target)||
     (pauseUntil!==null&&(target!=='paused'||typeof pauseUntil!=='string'||
       !Number.isFinite(Date.parse(pauseUntil))||
       new Date(pauseUntil).toISOString()!==pauseUntil)))
   throw Error('invalid_staff_transition_request');
  return withTransaction(async query=>{
   const session=await resolveStaffSession(query,{credential});
   if(!session||session.authenticated!==true||!uuid.test(session.actorId)||
      session.active!==true||!['waiter','admin','root'].includes(session.role))
    throw Error('staff_session_forbidden');
   const result=await transition(query,{
    actorId:session.actorId,tableId,target,pauseUntil
   });
   if(!result||!uuid.test(result.tableId)||
      result.tableId.toLowerCase()!==tableId.toLowerCase()||
      result.orderingState!==target||!uuid.test(result.sessionId))
    throw Error('invalid_staff_transition_result');
   return Object.freeze({tableId:result.tableId,orderingState:result.orderingState,
    sessionId:result.sessionId});
  });
 };
}
export function createStaffTableTransitionSqlAdapter(){
 return async function transition(query,{actorId,tableId,target,pauseUntil}={}){
  if(typeof query!=='function'||!uuid.test(actorId)||!uuid.test(tableId)||
     !allowed.has(target))throw Error('invalid_staff_transition_scope');
  const result=await query(
   `SELECT table_id,ordering_state,session_id
      FROM sabora.transition_table_ordering_candidate($1::uuid,$2::uuid,$3::text,$4::timestamptz)`,
   [actorId,tableId,target,pauseUntil]);
  if(!result||!Array.isArray(result.rows)||result.rows.length!==1)
   throw Error('invalid_staff_transition_sql_result');
  const row=result.rows[0];
  return {tableId:row.table_id,orderingState:row.ordering_state,
   sessionId:row.session_id};
 };
}
