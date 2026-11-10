import { prepareCustomerRegistration } from './customer-id.mjs';

// Internal-only adapter: no public route or authentication is exposed here.
// A PostgreSQL unique violation aborts the current subtransaction, so each
// candidate must be isolated by a SAVEPOINT before retrying.
export function createCustomerProfileWriter({ withTransaction, prepare = prepareCustomerRegistration, maxAttempts = 5 } = {}) {
  if (typeof withTransaction !== 'function' || typeof prepare !== 'function' ||
      !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
    throw Error('invalid_customer_writer_configuration');
  }
  return async function registerCustomer(input) {
    return withTransaction(async query => {
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const candidate = prepare(input);
        if (candidate?.error) return candidate;
        if (!candidate || typeof candidate.internalId !== 'string' ||
            typeof candidate.publicId !== 'string' || typeof candidate.alias !== 'string') {
          throw Error('invalid_customer_candidate');
        }
        await query('SAVEPOINT customer_id_candidate');
        try {
          const result = await query(
            'INSERT INTO sabora.customer_profiles(id,public_id,alias,company) VALUES ($1,$2,$3,$4) RETURNING id,public_id,alias,company',
            [candidate.internalId, candidate.publicId, candidate.alias, candidate.company]
          );
          if (!result || result.rowCount !== 1 || !result.rows?.[0]) throw Error('customer_insert_unconfirmed');
          await query('RELEASE SAVEPOINT customer_id_candidate');
          return result.rows[0];
        } catch (error) {
          await query('ROLLBACK TO SAVEPOINT customer_id_candidate');
          await query('RELEASE SAVEPOINT customer_id_candidate');
          if (error?.code !== '23505' || error?.constraint !== 'customer_profiles_public_id_key') throw error;
          if (attempt === maxAttempts - 1) throw Error('customer_public_id_collision_limit');
        }
      }
      throw Error('customer_public_id_collision_limit');
    });
  };
}
