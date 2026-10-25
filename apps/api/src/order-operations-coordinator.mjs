import {createOrderOperationsRepository} from './order-operations-repository.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ROLES = new Set(['admin', 'waiter', 'kitchen']);

function ownData(object, key) {
  if (!object || typeof object !== 'object' || Array.isArray(object) ||
      (Object.getPrototypeOf(object) !== Object.prototype &&
       Object.getPrototypeOf(object) !== null)) {
    throw Error('order_operations_forbidden');
  }
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
    throw Error('order_operations_forbidden');
  }
  return descriptor.value;
}

function trustedStaff(context) {
  const identity = ownData(context, 'verifiedIdentity');
  const verifiedStaff = ownData(context, 'verifiedStaff');
  const actorId = ownData(identity, 'userId');
  const staffId = ownData(verifiedStaff, 'userId');
  const role = ownData(verifiedStaff, 'role');
  if (typeof actorId !== 'string' || !UUID.test(actorId) ||
      typeof staffId !== 'string' || !UUID.test(staffId) ||
      staffId.toLowerCase() !== actorId.toLowerCase() || !ROLES.has(role)) {
    throw Error('order_operations_forbidden');
  }
  return Object.freeze({actorId, role});
}

function assertSafeInput(value) {
  if (value === undefined) return Object.freeze(Object.create(null));
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype &&
       Object.getPrototypeOf(value) !== null)) {
    throw Error('invalid_order_operations_input');
  }
  const snapshot = Object.create(null);
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || key === '__proto__' ||
        !Object.prototype.propertyIsEnumerable.call(value, key)) {
      throw Error('invalid_order_operations_input');
    }
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) {
      throw Error('invalid_order_operations_input');
    }
    Object.defineProperty(snapshot, key, {
      value: descriptor.value, enumerable: true, writable: false, configurable: false,
    });
  }
  return Object.freeze(snapshot);
}

function assertVerifiedMembership(verified, staff) {
  const actorId = ownData(verified, 'actorId');
  const role = ownData(verified, 'role');
  if (typeof actorId !== 'string' || !UUID.test(actorId) ||
      actorId.toLowerCase() !== staff.actorId.toLowerCase() ||
      role !== staff.role) {
    throw Error('order_operations_forbidden');
  }
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
      const safeInput = assertSafeInput(page);
      return withTransaction(async (query) => {
        assertVerifiedMembership(await repository.verifyMembership(query, staff), staff);
        return repository.listBoard(query, {...safeInput, ...staff});
      });
    },

    async transitionLine(context, input) {
      const staff = trustedStaff(context);
      const safeInput = assertSafeInput(input);
      const capability = issueTransitionCapability({
        actorId: staff.actorId,
        lineId: safeInput.lineId,
        targetStatus: safeInput.targetStatus,
        correlationId: safeInput.correlationId,
      });
      return withTransaction(async (query) => {
        // The capability-verifying SQL wrapper revalidates active membership
        // under lock. A separate direct staff query here would require table
        // privileges on the shared operations login and reopen the SQL bypass.
        return repository.transitionLine(query, {...safeInput, ...staff, capability});
      });
    },

    async listHistory(context, input) {
      const staff = trustedStaff(context);
      const safeInput = assertSafeInput(input);
      return withTransaction(async (query) => {
        assertVerifiedMembership(await repository.verifyMembership(query, staff), staff);
        return repository.listHistory(query, {...safeInput, ...staff});
      });
    },
  });
}
