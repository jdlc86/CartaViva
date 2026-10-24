// Offline, opt-in capability gate for separately provisioned Sabora SQL logins.
// Never import into server.mjs without a separately approved runtime composition.
// Read-only catalog access must be limited to the published-catalog RPC;
// the order writer must not inherit the catalog reader's role or execute its RPC.
// Both runtime logins must be NOINHERIT and lack cluster administration powers.
const roleName = value => typeof value === 'string' && /^[a-z][a-z0-9_]{0,62}$/.test(value);
const SQL = `
SELECT current_user AS effective_role,
       session_user AS login_role,
       rolcanlogin AS can_login,
       rolbypassrls AS bypass_rls,
       rolsuper AS superuser,
       rolcreatedb AS create_db,
       rolcreaterole AS create_role,
       rolreplication AS replication,
       rolinherit AS inherit_role,
       pg_has_role(current_user, 'sabora_catalog_reader', 'SET') AS can_set_catalog_reader,
       has_function_privilege(current_user, 'sabora.read_published_catalog()', 'EXECUTE') AS direct_catalog_execute,
       has_function_privilege('sabora_catalog_reader', 'sabora.read_published_catalog()', 'EXECUTE') AS scoped_catalog_execute
FROM pg_roles WHERE rolname = current_user`;
const SQL_WRITER = `
SELECT current_user AS effective_role,
       session_user AS login_role,
       rolcanlogin AS can_login,
       rolbypassrls AS bypass_rls,
       rolsuper AS superuser,
       rolcreatedb AS create_db,
       rolcreaterole AS create_role,
       rolreplication AS replication,
       rolinherit AS inherit_role,
       pg_has_role(current_user, 'sabora_catalog_reader', 'SET') AS can_set_catalog_reader,
       has_function_privilege(current_user, 'sabora.read_published_catalog()', 'EXECUTE') AS direct_catalog_execute
FROM pg_roles WHERE rolname = current_user`;

async function inspect(pool, sql) {
 let client;
 let success = false;
 try {
  client = await pool.connect();
  if (!client || typeof client.query !== 'function' || typeof client.release !== 'function')
   throw Error('invalid_customer_sql_capabilities');
  const result = await client.query(sql);
  if (!result || !Array.isArray(result.rows) || result.rows.length !== 1)
   throw Error('invalid_customer_sql_capabilities');
  success = true;
  return result.rows[0];
 } catch {
  throw Error('invalid_customer_sql_capabilities');
 } finally {
  if (client) try { client.release(!success); } catch {}
 }
}
function base(row, expected) {
 return row && row.effective_role === expected && row.login_role === expected &&
  row.can_login === true && row.bypass_rls === false && row.superuser === false &&
  row.create_db === false && row.create_role === false &&
  row.replication === false && row.inherit_role === false;
}
export async function assertIsolatedCustomerSqlCapabilities({
 catalogReaderPool, orderWriterPool, expectedCatalogLogin, expectedOrderLogin
} = {}) {
 if (!roleName(expectedCatalogLogin) || !roleName(expectedOrderLogin) ||
     expectedCatalogLogin === expectedOrderLogin ||
     !catalogReaderPool || !orderWriterPool ||
     catalogReaderPool === orderWriterPool ||
     typeof catalogReaderPool.connect !== 'function' ||
     typeof orderWriterPool.connect !== 'function')
  throw Error('invalid_customer_sql_capabilities');
 const reader = await inspect(catalogReaderPool, SQL);
 if (!base(reader, expectedCatalogLogin) ||
     reader.can_set_catalog_reader !== true ||
     reader.scoped_catalog_execute !== true ||
     reader.direct_catalog_execute !== false)
  throw Error('invalid_customer_sql_capabilities');
 const writer = await inspect(orderWriterPool, SQL_WRITER);
 if (!base(writer, expectedOrderLogin) || writer.can_set_catalog_reader !== false ||
     writer.direct_catalog_execute !== false)
  throw Error('invalid_customer_sql_capabilities');
 return Object.freeze({validated:true});
}
