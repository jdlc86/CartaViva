// Internal-only ownership workflow. A trusted JWT verifier supplies actorUserId.
// The pool identity must be private; do not expose this service to browser SQL.
import { decideOwnershipTransition } from './ownership-transition-policy.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['request', 'offer', 'accept', 'reject', 'cancel', 'force']);
const PROPOSAL_ACTIONS = new Set(['accept', 'reject', 'cancel']);
const MAX_REASON_LENGTH = 1000;
const normalizeUuid = value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;

function normalizeRequest({ actorUserId, action, correlationId, proposalId, targetUserId, reason }) {
  const actor = normalizeUuid(actorUserId);
  const correlation = normalizeUuid(correlationId);
  const proposal = proposalId == null ? null : normalizeUuid(proposalId);
  const target = targetUserId == null ? null : normalizeUuid(targetUserId);
  const normalizedReason = reason == null ? null : typeof reason === 'string' ? reason.trim() : undefined;
  if (!actor || !correlation || !ACTIONS.has(action) ||
      (proposalId != null && !proposal) || (targetUserId != null && !target) ||
      normalizedReason === undefined || (normalizedReason?.length ?? 0) > MAX_REASON_LENGTH) return null;
  const validShape =
    (action === 'request' && proposal === null && target === null && normalizedReason === null) ||
    (action === 'offer' && proposal === null && target !== null && normalizedReason === null) ||
    (PROPOSAL_ACTIONS.has(action) && proposal !== null && target === null && normalizedReason === null) ||
    (action === 'force' && proposal === null && target !== null && Boolean(normalizedReason));
  if (!validShape) return null;
  return {
    actor,
    correlation,
    proposal,
    target,
    reason: normalizedReason,
    payload: { action, actorUserId: actor, proposalId: proposal, targetUserId: target, reason: normalizedReason }
  };
}

export function createOwnershipWorkflow({ withTransaction } = {}) {
  if (typeof withTransaction !== 'function') throw Error('invalid_ownership_workflow_config');
  return async function transition(input = {}) {
    const normalized = normalizeRequest(input);
    if (!normalized) return { error: 'invalid_request' };
    const { action } = input;
    const { actor, correlation, proposal: proposalId, target: requestedTargetId, reason, payload } = normalized;

    return withTransaction(async query => {
      // Lock order: ownership singleton, all staff rows by UUID, then proposal.
      const singleton = await query(
        'select owner_user_id from sabora.admin_write_ownership where singleton=true for update', []
      );
      if (singleton.rows?.length !== 1) throw Error('ownership_unavailable');
      const ownerId = normalizeUuid(singleton.rows[0].owner_user_id);
      if (singleton.rows[0].owner_user_id != null && !ownerId) throw Error('ownership_unavailable');

      // This non-locking read discovers the proposal recipient. The singleton
      // serializes supported mutations until the proposal is re-read FOR UPDATE.
      let proposalSnapshot;
      if (PROPOSAL_ACTIONS.has(action)) {
        const result = await query(
          'select id,kind,status,from_owner_id,to_owner_id from sabora.admin_ownership_proposals where id=$1',
          [proposalId]
        );
        if (result.rows?.length === 1) proposalSnapshot = result.rows[0];
      }

      const proposalTargetId = normalizeUuid(proposalSnapshot?.to_owner_id);
      const ids = [...new Set([actor, ownerId, requestedTargetId, proposalTargetId].filter(Boolean))].sort();
      const members = await query(
        'select user_id,role,state from sabora.staff_members where user_id = any($1::uuid[]) order by user_id for update',
        [ids]
      );
      const byId = new Map((members.rows || []).map(row => [normalizeUuid(row.user_id), row]));
      const actorMembership = byId.get(actor);
      if (!actorMembership || actorMembership.state !== 'active' ||
          !['root', 'admin'].includes(actorMembership.role)) return { error: 'forbidden' };

      const existing = await query(
        'select request_payload = $2::jsonb as request_matches,result_payload from sabora.admin_ownership_audit where correlation_id=$1',
        [correlation, JSON.stringify(payload)]
      );
      if (existing.rows?.length) {
        const row = existing.rows[0];
        return row.request_matches === true && row.result_payload &&
          typeof row.result_payload === 'object' && !Array.isArray(row.result_payload)
          ? { ...row.result_payload, replayed: true }
          : { error: 'correlation_conflict' };
      }

      let proposal;
      if (PROPOSAL_ACTIONS.has(action)) {
        if (!proposalSnapshot) return { error: 'proposal_not_found' };
        const result = await query(
          'select id,kind,status,from_owner_id,to_owner_id from sabora.admin_ownership_proposals where id=$1 for update',
          [proposalId]
        );
        if (result.rows?.length !== 1) return { error: 'proposal_not_found' };
        const row = result.rows[0];
        proposal = {
          kind: row.kind,
          status: row.status,
          fromOwnerId: normalizeUuid(row.from_owner_id),
          toOwnerId: normalizeUuid(row.to_owner_id)
        };
      }

      const targetId = action === 'request' ? actor : action === 'accept' ? proposal?.toOwnerId : requestedTargetId;
      const targetMembership = byId.get(targetId);
      const decision = decideOwnershipTransition({
        action,
        actor: { userId: actor, role: actorMembership.role, state: actorMembership.state },
        currentOwnerId: ownerId,
        target: targetMembership && {
          userId: normalizeUuid(targetMembership.user_id),
          role: targetMembership.role,
          state: targetMembership.state
        },
        proposal,
        reason
      });
      if (decision.error) return decision;

      let newProposalId = proposalId;
      if (decision.proposalKind) {
        const created = await query(
          'insert into sabora.admin_ownership_proposals(kind,from_owner_id,to_owner_id,created_by,correlation_id) values ($1,$2,$3,$4,$5) returning id',
          [decision.proposalKind, decision.fromOwnerId, decision.toOwnerId, actor, correlation]
        );
        newProposalId = normalizeUuid(created.rows?.[0]?.id);
        if (!newProposalId) throw Error('ownership_persistence_error');
      }
      if (decision.nextOwnerId) {
        await query(
          'update sabora.admin_write_ownership set owner_user_id=$1,assigned_at=now() where singleton=true',
          [decision.nextOwnerId]
        );
      }
      if (decision.nextStatus) {
        await query(
          'update sabora.admin_ownership_proposals set status=$1,resolved_at=now() where id=$2',
          [decision.nextStatus, proposalId]
        );
      }

      const resultPayload = {
        proposalId: newProposalId ?? null,
        nextOwnerId: decision.nextOwnerId ?? ownerId,
        status: decision.nextStatus ?? (action === 'force' ? 'transferred' : 'pending')
      };
      // The persisted enum uses the public action name except for ROOT force.
      const auditAction = action === 'force' ? 'force_transfer' : action;
      await query(
        'insert into sabora.admin_ownership_audit(correlation_id,actor_user_id,action,proposal_id,previous_owner_id,next_owner_id,reason,request_payload,result,result_payload) values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10::jsonb)',
        [correlation, actor, auditAction, newProposalId ?? null, ownerId,
          resultPayload.nextOwnerId, reason, JSON.stringify(payload), 'succeeded', JSON.stringify(resultPayload)]
      );
      return resultPayload;
    });
  };
}
