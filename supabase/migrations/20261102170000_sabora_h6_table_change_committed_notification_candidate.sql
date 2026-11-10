-- Candidate-only. The durable response remains the sealed SQL state; NOTIFY
-- carries only a wake-up signal, never customer, account or table details.
-- No runtime GRANTs and no operational migration are authorized.
BEGIN;
CREATE FUNCTION sabora.notify_table_change_committed_h6_candidate()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path=pg_catalog,pg_temp
AS $body$
BEGIN
 PERFORM pg_catalog.pg_notify('sabora_h6_table_change_changed','');
 RETURN NULL;
END;
$body$;
REVOKE ALL ON FUNCTION sabora.notify_table_change_committed_h6_candidate()
 FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sabora_h6_table_change_requests_committed_candidate
 AFTER INSERT OR UPDATE ON sabora.customer_table_change_requests
 FOR EACH STATEMENT
 EXECUTE FUNCTION sabora.notify_table_change_committed_h6_candidate();
CREATE TRIGGER sabora_h6_table_change_session_revoked_candidate
 AFTER UPDATE OF revoked_at,expires_at ON sabora.customer_sessions
 FOR EACH STATEMENT
 EXECUTE FUNCTION sabora.notify_table_change_committed_h6_candidate();
CREATE TRIGGER sabora_h6_table_change_account_closed_candidate
 AFTER UPDATE OF state ON sabora.customer_accounts
 FOR EACH STATEMENT
 EXECUTE FUNCTION sabora.notify_table_change_committed_h6_candidate();
CREATE TRIGGER sabora_h6_table_change_binding_changed_candidate
 AFTER INSERT OR UPDATE ON sabora.customer_account_operational_bindings
 FOR EACH STATEMENT
 EXECUTE FUNCTION sabora.notify_table_change_committed_h6_candidate();
COMMIT;
