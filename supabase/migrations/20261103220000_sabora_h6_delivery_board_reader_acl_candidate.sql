-- Candidate only: complete the sealed H6 delivery-board reader's minimum ACL.
-- The destination projection is FORCE RLS and owned by the H6 function role.
-- The independent order-operations SECURITY DEFINER owner requires column-
-- scoped SELECT and its own policy to resolve current table/session correctly.
-- No browser, staff login, H6 runtime or PUBLIC access is added.
BEGIN;
GRANT SELECT(order_line_id,table_id,session_id,visit_key,destination_version)
 ON sabora.order_line_delivery_destinations TO sabora_order_operations_fn_owner;
CREATE POLICY sabora_order_operations_delivery_board_read
 ON sabora.order_line_delivery_destinations
 FOR SELECT TO sabora_order_operations_fn_owner USING (true);
COMMIT;
