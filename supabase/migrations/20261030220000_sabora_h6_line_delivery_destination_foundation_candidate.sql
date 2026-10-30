-- H6 line-level delivery destination foundation. Candidate only; no transfer is enabled.
-- A round may contain both picked-up and pending lines. Round-only destination
-- cannot safely redirect pending items without rewriting completed delivery scope.
BEGIN;
CREATE TABLE sabora.order_line_delivery_destinations (
 order_line_id uuid PRIMARY KEY REFERENCES sabora.order_lines(id),
 round_id uuid NOT NULL,
 account_id uuid NOT NULL,
 order_id uuid NOT NULL,
 table_id uuid NOT NULL REFERENCES sabora.dining_tables(id),
 session_id uuid NOT NULL,
 visit_key text NOT NULL CHECK (visit_key ~ '^[A-Za-z0-9_-]{16,128}$'),
 destination_version bigint NOT NULL DEFAULT 1 CHECK(destination_version>0),
 changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(round_id,account_id)
  REFERENCES sabora.order_rounds(id,account_id),
 FOREIGN KEY(order_id,order_line_id)
  REFERENCES sabora.order_lines(order_id,id),
 UNIQUE(order_line_id,account_id)
);
CREATE INDEX order_line_delivery_by_table
 ON sabora.order_line_delivery_destinations(table_id,session_id);
CREATE INDEX order_line_delivery_by_account
 ON sabora.order_line_delivery_destinations(account_id,round_id);

INSERT INTO sabora.order_line_delivery_destinations
 (order_line_id,round_id,account_id,order_id,table_id,session_id,visit_key)
SELECT l.id,r.id,r.account_id,r.order_id,d.table_id,d.session_id,d.visit_key
FROM sabora.order_rounds r
JOIN sabora.order_lines l ON l.order_id=r.order_id
JOIN sabora.order_round_delivery_destinations d ON d.round_id=r.id
WHERE l.status<>'picked_up';

DO $validate$
BEGIN
 IF (SELECT count(*) FROM sabora.order_line_delivery_destinations)
  <> (SELECT count(*) FROM sabora.order_rounds r
      JOIN sabora.order_lines l ON l.order_id=r.order_id
      WHERE l.status<>'picked_up') THEN
  RAISE EXCEPTION 'line_delivery_backfill_incomplete';
 END IF;
END;
$validate$;

ALTER TABLE sabora.order_line_delivery_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sabora.order_line_delivery_destinations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON sabora.order_line_delivery_destinations FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON sabora.order_line_delivery_destinations TO sabora_h6_fn_owner;
CREATE POLICY h6_owner_line_delivery_select ON sabora.order_line_delivery_destinations
 FOR SELECT TO sabora_h6_fn_owner USING(true);
CREATE POLICY h6_owner_line_delivery_insert ON sabora.order_line_delivery_destinations
 FOR INSERT TO sabora_h6_fn_owner WITH CHECK(true);
CREATE POLICY h6_owner_line_delivery_update ON sabora.order_line_delivery_destinations
 FOR UPDATE TO sabora_h6_fn_owner USING(true) WITH CHECK(true);
-- No runtime table DML and no function that changes destination yet.
COMMIT;
