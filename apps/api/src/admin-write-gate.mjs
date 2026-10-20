// Additional administrative write gate, separate from role-based read access.
// No route is registered here; ownership is always resolved from durable storage.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createAdminWriteGate({ lookupOwner } = {}) {
  if (typeof lookupOwner !== 'function') throw new Error('invalid_admin_write_gate_config');
  return async function requireAdminWriter(request, reply) {
    const staff = request.verifiedStaff;
    if (!staff || !UUID.test(staff.userId) || !['root', 'admin'].includes(staff.role)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
    // ROOT's privileged writes are a separate authority, not ownership.
    if (staff.role === 'root') return;
    let ownerId;
    try { ownerId = await lookupOwner(); }
    catch { return reply.code(503).send({ error: 'authorization_unavailable' }); }
    if (typeof ownerId !== 'string' || !UUID.test(ownerId)) {
      return reply.code(503).send({ error: 'authorization_unavailable' });
    }
    if (ownerId.toLowerCase() !== staff.userId.toLowerCase()) {
      return reply.code(403).send({ error: 'write_ownership_required' });
    }
  };
}
