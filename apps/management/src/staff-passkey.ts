const AUTH = '/api/v1/staff/auth';
const SESSION_HEADER = 'X-Sabora-Staff-Session';

export type StaffSession = {
  sessionId: string;
  role: 'root' | 'admin' | 'waiter' | 'kitchen';
  expiresAt: number;
  features: {tableChange: boolean; waiterCalls: boolean; management: boolean; ownership: boolean;
    staffDirectory?: boolean; staffRevocation?: boolean; staffLifecycle?: boolean};
};

export function supportsStaffPasskey() {
  return window.isSecureContext &&
    typeof PublicKeyCredential !== 'undefined' &&
    typeof PublicKeyCredential.parseRequestOptionsFromJSON === 'function' &&
    typeof PublicKeyCredential.prototype.toJSON === 'function';
}

export class StaffAuthenticationError extends Error {
  constructor(readonly status: number) {super('staff_auth_request_failed');}
}

async function authRequest(action: string, options?: RequestInit) {
  const response = await fetch(AUTH + '/' + action, {
    ...options, credentials: 'same-origin', redirect: 'error', cache: 'no-store'
  });
  if (!response.ok) throw new StaffAuthenticationError(response.status);
  return response;
}

async function readSession(response: Response): Promise<StaffSession> {
  const value = await response.json();
  if (!value || typeof value.sessionId !== 'string' || !Number.isSafeInteger(value.expiresAt) ||
      value.expiresAt * 1000 <= Date.now() || !['root', 'admin', 'waiter', 'kitchen'].includes(value.role) ||
      !value.features || !['tableChange', 'waiterCalls', 'management', 'ownership']
        .every(feature => typeof value.features[feature] === 'boolean') ||
      !['staffDirectory','staffRevocation','staffLifecycle'].every(feature =>
        value.features[feature] === undefined || typeof value.features[feature] === 'boolean')) {
    throw new StaffAuthenticationError(503);
  }
  return value;
}

export async function readStaffSession() {
  return readSession(await authRequest('session'));
}

export async function signInWithStaffPasskey() {
  const response = await authRequest('options', {method: 'POST'});
  const {options} = await response.json();
  if (options?.rpId !== window.location.hostname) throw new StaffAuthenticationError(503);
  const publicKey = PublicKeyCredential.parseRequestOptionsFromJSON(options);
  const assertion = await navigator.credentials.get({publicKey: {...publicKey, userVerification: 'required'}});
  if (!(assertion instanceof PublicKeyCredential)) throw new StaffAuthenticationError(401);
  return readSession(await authRequest('verify', {method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({credential: assertion.toJSON()})
  }));
}

export function endStaffSession(session: StaffSession) {
  return authRequest('logout', {method: 'POST', headers: {[SESSION_HEADER]: session.sessionId}});
}

export function createStaffSessionFetch(session: StaffSession, onExpired: () => void): typeof fetch {
  return async (input, options) => {
    if (typeof input !== 'string' ||
        !/^\/api\/v1\/(?:operations\/|admin\/|staff\/(?:me$|lifecycle$|directory(?:[/?]|$)))/.test(input))
      throw new StaffAuthenticationError(400);
    const headers = new Headers(options?.headers);
    headers.set(SESSION_HEADER, session.sessionId);
    const response = await fetch(input, {...options, headers, credentials: 'same-origin', redirect: 'error'});
    if (response.status === 401) onExpired();
    if (response.status === 403) {
      const current = await readStaffSession().catch(() => null);
      if (current?.sessionId !== session.sessionId || current.role !== session.role) onExpired();
    }
    if (response.status === 503) {
      const failure = await response.clone().json().catch(() => null);
      if (failure?.error === 'staff_auth_unavailable') onExpired();
    }
    return response;
  };
}
