import {createOrderOperationsRepository} from './order-operations-repository.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['admin', 'waiter', 'kitchen']);

function trustedStaff(context) {
  if (!context || typeof context !== 'object' || Array.isArray(context) ||
      !context.verifiedIdentity || !context.verifiedStaff ||
      typeof context.verifiedIdentity !== 'object' || Array.isArray(context.verifiedIdentity) ||
      typeof context.verifiedStaff !== 'object' || Array.isArray(context.verifiedStaff) ||
      !UUID.test(context.verifiedIdentity.userId) ||
      typeof context.verifiedStaff.userId !== 'string' ||
      !UUID.test(context.verifiedStaff.userId) ||
      context.verifiedStaff.userId.toLowerCase() !== context.verifiedIdentity.userId.toLowerCase() ||
      !ROLES.has(context.verifiedStaff.role)) {
    throw Error('order_operations_forbidden');
  }
  return Object.freeze({
    actorId: context.verifiedIdentity.userId,
    role: context.verifiedStaff.role,
  });
}

export function createOrderOperationsCoordinator({
  withTransaction,
  repository = createOrderOperationsRepository(),
  issueTransitionCapability,
} = {}) {
  if (typeof withTransaction !== 'function' || !repository ||
      typeof repository.verifyMembership !== 'function' ||
      typeof repository.listBoard !== 'function' ||
      typeof repository.transitionLine !== 'function' ||
      typeof repository.listHistory !== 'function' ||
      typeof issueTransitionCapability !== 'function') {
    throw Error('invalid_order_operations_coordinator');
  }

  return Object.freeze({
    async listBoard(context, page) {
      const staff = trustedStaff(context);
      return withTransaction(async (query) => {
        await repository.verifyMembership(query, staff);
        return repository.listBoard(query, {...page, ...staff});
      });
    },

    async transitionLine(context, input) {
      const staff = trustedStaff(context);
      const capability = issueTransitionCapability({
        actorId: staff.actorId,
        lineId: input?.lineId,
        targetStatus: input?.targetStatus,
        correlationId: input?.correlationId,
      });
      return withTransaction(async (query) => {
        // The capability-verifying SQL wrapper revalidates active membership
        // under lock. A separate direct staff query here would require table
        // privileges on the shared operations login and reopen the SQL bypass.
        return repository.transitionLine(query, {...input, ...staff, capability});
      });
    },

    async listHistory(context, input) {
      const staff = trustedStaff(context);
      return withTransaction(async (query) => {
        await repository.verifyMembership(query, staff);
        return repository.listHistory(query, {...input, ...staff});
      });
    },
  });
}
