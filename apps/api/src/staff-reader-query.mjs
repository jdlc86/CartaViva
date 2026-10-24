// Connection boundary for the dedicated read-only PostgreSQL identity.
// The pool is injected by the backend bootstrap; this module never reads secrets,
// creates a connection, or accepts a service-role/browser Supabase client.
export function createStaffReaderQuery({ pool } = {}) {
  if (!pool || typeof pool.query !== 'function') throw new Error('invalid_staff_reader_pool');
  return async function staffReaderQuery(sql, params) {
    if (sql !== 'select role, state from sabora.staff_members where user_id = $1' ||
        !Array.isArray(params) || params.length !== 1 || typeof params[0] !== 'string') {
      throw new Error('staff_reader_query_not_allowed');
    }
    return pool.query(sql, params);
  };
}
