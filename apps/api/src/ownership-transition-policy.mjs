// Pure transition policy; database transaction must revalidate actor and owner
// under the same lock before persisting any administrative change.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIONS = new Set(['request','offer','accept','reject','cancel','force']);
const normalize = value => typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null;
export function decideOwnershipTransition({ action, actor, currentOwnerId, target, proposal, reason } = {}) {
  if (!ACTIONS.has(action) || !actor || actor.state !== 'active') return { error: 'forbidden' };
  const actorId = normalize(actor.userId);
  const ownerId = currentOwnerId == null ? null : normalize(currentOwnerId);
  if (!actorId || (currentOwnerId != null && !ownerId) || !['root','admin'].includes(actor.role)) {
    return { error: 'forbidden' };
  }
  const targetId = normalize(target?.userId);
  const eligibleTarget = targetId && target?.role === 'admin' && target?.state === 'active';
  const isOwner = actor.role === 'admin' && actorId === ownerId;
  if (action === 'force') {
    if (actor.role !== 'root') return { error: 'forbidden' };
    if (!eligibleTarget || !reason?.trim()) return { error: 'invalid_transition' };
    if (targetId === ownerId) return { error: 'unchanged_owner' };
    return { nextOwnerId: targetId, auditAction: 'force_transfer' };
  }
  if (actor.role !== 'admin') return { error: 'forbidden' };
  if (action === 'request') {
    if (!ownerId || isOwner) return { error: 'invalid_transition' };
    return { proposalKind: 'request', fromOwnerId: ownerId, toOwnerId: actorId };
  }
  if (action === 'offer') {
    if (!isOwner || !eligibleTarget || targetId === ownerId) return { error: 'invalid_transition' };
    return { proposalKind: 'offer', fromOwnerId: ownerId, toOwnerId: targetId };
  }
  if (!proposal || !['request','offer'].includes(proposal.kind) ||
      !['pending'].includes(proposal.status) ||
      normalize(proposal.fromOwnerId) !== ownerId ||
      !normalize(proposal.toOwnerId)) return { error: 'stale_proposal' };
  const recipientId = normalize(proposal.toOwnerId);
  const decisionMaker = proposal.kind === 'request' ? ownerId : recipientId;
  if (action === 'cancel') {
    const creatorId = proposal.kind === 'request' ? recipientId : ownerId;
    return actorId === creatorId ? { nextStatus: 'cancelled' } : { error: 'forbidden' };
  }
  if (actorId !== decisionMaker) return { error: 'forbidden' };
  if (action === 'reject') return { nextStatus: 'rejected' };
  if (!eligibleTarget || targetId !== recipientId) return { error: 'invalid_transition' };
  return { nextOwnerId: recipientId, nextStatus: 'accepted', auditAction: 'accepted_transfer' };
}
