import { randomUUID } from 'node:crypto';
import { prepareCustomerRegistration } from './customer-id.mjs';
import { issueCustomerSession } from './customer-session.mjs';

// Internal-only transactional registration. Never expose the bearer token in logs
// or persist it alongside the profile. The caller must set an HttpOnly cookie
// only after the transaction commits successfully.
export function createCustomerRegistrationWithSession({
  withTransaction, prepare = prepareCustomerRegistration, issue = issueCustomerSession,
  sessionId = randomUUID, maxAttempts = 5
} = {}) {
  if (typeof withTransaction !== 'function' || typeof prepare !== 'function' ||
      typeof issue !== 'function' || typeof sessionId !== 'function' ||
      !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw Error('invalid_customer_registration_configuration');
  }
  return async function register(input) {
    return withTransaction(async query => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = prepare(input);
        if (candidate?.error) return candidate;
        if (!candidate || typeof candidate.internalId !== 'string' ||
            typeof candidate.publicId !== 'string' || typeof candidate.alias !== 'string') {
          throw Error('invalid_customer_candidate');
        }
        await query('SAVEPOINT customer_registration_candidate');
        try {
          const inserted = await query(
            'INSERT INTO sabora.customer_profiles(id,public_id,alias,company) VALUES ($1,$2,$3,$4) RETURNING id,public_id,alias,company',
            [candidate.internalId,candidate.publicId,candidate.alias,candidate.company]
          );
          if (inserted?.rowCount !== 1 || !inserted.rows?.[0]) throw Error('customer_insert_unconfirmed');
          const session = issue();
          if (!session || typeof session.token !== 'string' ||
              !Buffer.isBuffer(session.tokenHash) || session.tokenHash.length !== 32 ||
              !(session.createdAt instanceof Date) || !(session.expiresAt instanceof Date)) {
            throw Error('invalid_issued_customer_session');
          }
          const sessionRecord = await query(
            'INSERT INTO sabora.customer_sessions(id,customer_id,token_hash,created_at,expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [sessionId(),candidate.internalId,session.tokenHash,session.createdAt,session.expiresAt]
          );
          if (sessionRecord?.rowCount !== 1 || !sessionRecord.rows?.[0]) throw Error('customer_session_insert_unconfirmed');
          await query('RELEASE SAVEPOINT customer_registration_candidate');
          return { profile: inserted.rows[0], token: session.token, expiresAt: session.expiresAt };
        } catch (error) {
          await query('ROLLBACK TO SAVEPOINT customer_registration_candidate');
          await query('RELEASE SAVEPOINT customer_registration_candidate');
          if (error?.code !== '23505' || error?.constraint !== 'customer_profiles_public_id_key') throw error;
          if (attempt === maxAttempts - 1) throw Error('customer_public_id_collision_limit');
        }
      }
      throw Error('customer_public_id_collision_limit');
    });
  };
}
