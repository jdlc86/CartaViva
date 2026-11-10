// Wrap a PostgreSQL reader query with a safe application-facing error.
// The original driver error (which may contain connection details) is never
// attached as a cause or returned to HTTP clients.
export function createSafeStaffReaderQuery({ query, observe = () => {} } = {}) {
  if (typeof query !== 'function' || typeof observe !== 'function') {
    throw new Error('invalid_safe_staff_reader_config');
  }
  return async function safeStaffReaderQuery(sql, params) {
    try {
      return await query(sql, params);
    } catch {
      try { observe('staff_reader_query_failed'); } catch { /* diagnostics are optional */ }
      throw new Error('staff_reader_unavailable');
    }
  };
}
