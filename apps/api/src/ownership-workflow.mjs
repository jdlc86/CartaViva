// Internal-only ownership workflow. A trusted JWT verifier supplies actorUserId.
// The pool identity must be private; do not expose this service to browser SQL.
import { decideOwnershipTransition } from './ownership-transition-policy.mjs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const valid = x => typeof x === 'string' && UUID.test(x);
const ACTIONS = new Set(['request','offer','accept','reject','cancel','force']);
export function createOwnershipWorkflow({ withTransaction } = {}) {
 if (typeof withTransaction !== 'function') throw Error('invalid_ownership_workflow_config');
 return async function transition({ actorUserId, action, correlationId, proposalId, targetUserId, reason } = {}) {
  if (!valid(actorUserId) || !valid(correlationId) || !ACTIONS.has(action) ||
      (proposalId != null && !valid(proposalId)) ||
      (targetUserId != null && !valid(targetUserId))) return {error:'invalid_request'};
  return withTransaction(async query => {
   // Lock order: ownership singleton, then staff rows, then proposal.
   const singleton = await query('select owner_user_id from sabora.admin_write_ownership where singleton=true for update',[]);
   if (singleton.rows?.length !== 1) throw Error('ownership_unavailable');
   const ownerId = singleton.rows[0].owner_user_id;
   const existing = await query('select action,actor_user_id,proposal_id,previous_owner_id,next_owner_id from sabora.admin_ownership_audit where correlation_id=$1',[correlationId]);
   if (existing.rows?.length) {
    const row=existing.rows[0];
    return row.actor_user_id === actorUserId && row.action === (action==='force'?'force_transfer':action==='accept'?'accepted_transfer':action)
     ? {replayed:true,proposalId:row.proposal_id,nextOwnerId:row.next_owner_id}
     : {error:'correlation_conflict'};
   }
   const ids=[...new Set([actorUserId,ownerId,targetUserId].filter(valid))].sort();
   const members=await query('select user_id,role,state from sabora.staff_members where user_id = any($1::uuid[]) order by user_id for update',[ids]);
   const byId=new Map((members.rows||[]).map(row=>[row.user_id,row]));
   const actor=byId.get(actorUserId);
   if (!actor) return {error:'forbidden'};
   let proposal;
   if (['accept','reject','cancel'].includes(action)) {
    if (!proposalId) return {error:'invalid_request'};
    const result=await query('select id,kind,status,from_owner_id,to_owner_id from sabora.admin_ownership_proposals where id=$1 for update',[proposalId]);
    if (result.rows?.length!==1) return {error:'proposal_not_found'};
    const p=result.rows[0];
    proposal={kind:p.kind,status:p.status,fromOwnerId:p.from_owner_id,toOwnerId:p.to_owner_id};
    if (action==='accept' && !byId.has(p.to_owner_id)) {
     // The target is read after locking the singleton. Staff state changes
     // acquire the singleton first via BEFORE STATEMENT governance trigger.
     const recipient=await query('select user_id,role,state from sabora.staff_members where user_id=$1 for update',[p.to_owner_id]);
     if (recipient.rows?.[0]) byId.set(p.to_owner_id,recipient.rows[0]);
    }
   }
   const targetId=action==='request'?actorUserId:
     (action==='accept'?proposal?.toOwnerId:targetUserId);
   const decision=decideOwnershipTransition({
    action,actor:{userId:actorUserId,role:actor.role,state:actor.state},
    currentOwnerId:ownerId,target:byId.get(targetId),proposal,reason
   });
   if (decision.error) return decision;
   let newProposalId=proposalId??null;
   if (decision.proposalKind) {
    const created=await query(
     'insert into sabora.admin_ownership_proposals(kind,from_owner_id,to_owner_id,created_by,correlation_id) values ($1,$2,$3,$4,$5) returning id',
     [decision.proposalKind,decision.fromOwnerId,decision.toOwnerId,actorUserId,correlationId]);
    newProposalId=created.rows[0].id;
   }
   if (decision.nextOwnerId) {
    await query('update sabora.admin_write_ownership set owner_user_id=$1,assigned_at=now() where singleton=true',[decision.nextOwnerId]);
   }
   if (decision.nextStatus) {
    await query('update sabora.admin_ownership_proposals set status=$1,resolved_at=now() where id=$2',[decision.nextStatus,proposalId]);
   }
   const auditAction=decision.auditAction??action;
   await query(
    'insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id,reason) values ($1,$2,$3,$4,$5,$6,$7)',
    [correlationId,actorUserId,auditAction,newProposalId,ownerId,decision.nextOwnerId??ownerId,reason?.trim()||null]);
   return {proposalId:newProposalId,nextOwnerId:decision.nextOwnerId??ownerId,status:decision.nextStatus??'pending'};
  });
 };
}
