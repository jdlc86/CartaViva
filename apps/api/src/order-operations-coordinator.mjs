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

function assertSafeInput(value) {
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
       Object.getPrototypeOf(value) !== null) ||
      !Reflect.ownKeys(value).every(key => typeof key === 'string' &&
        Object.prototype.propertyIsEnumerable.call(value, key) &&
        Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'))) {
    throw Error('invalid_order_operations_input');
  }
  return value;
}

function assertVerifiedMembership(verified, staff) {
  if (!verified || typeof verified !== 'object' || Array.isArray(verified) ||
      typeof verified.actorId !== 'string' || !UUID.test(verified.actorId) ||
      verified.actorId.toLowerCase() !== staff.actorId.toLowerCase() ||
      verified.role !== staff.role) {
    throw Error('order_operations_forbidden');
  }
}

export function createOrderOperationsCoordinator({withTransaction, repository = createOrderOperationsRepository()} = {}) {
  if (typeof withTransaction !== 'function' || !repository ||
      typeof repository.verifyMembership !== 'function' ||
      typeof repository.listBoard !== 'function' ||
      typeof repository.transitionLine !== 'function' ||
      typeof repository.listHistory !== 'function') {
    throw Error('invalid_order_operations_coordinator');
  }

  return Object.freeze({
    async listBoard(context, page) {
      const staff = trustedStaff(context);
      const safeInput = assertSafeInput(page);
      return withTransaction(async (query) => {
        const verified = await repository.verifyMembership(query, staff);
        assertVerifiedMembership(verified, staff);
        return repository.listBoard(query, {...safeInput, ...staff});
      });
    },

    async transitionLine(context, input) {
      const staff = trustedStaff(context);
      const safeInput = assertSafeInput(input);
      return withTransaction(async (query) => {
        const verified = await repository.verifyMembership(query, staff);
        assertVerifiedMembership(verified, staff);
        return repository.transitionLine(query, {...safeInput, ...staff});
      });
    },

    async listHistory(context, input) {
      const staff = trustedStaff(context);
      const safeInput = assertSafeInput(input);
      return withTransaction(async (query) => {
        const verified = await repository.verifyMembership(query, staff);
        assertVerifiedMembership(verified, staff);
        return repository.listHistory(query, {...safeInput, ...staff});
      });
    },
  });
}
