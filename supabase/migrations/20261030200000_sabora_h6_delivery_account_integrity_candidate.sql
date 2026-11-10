-- H6 B1 integrity gate: delivery projection must refer to the same economic
-- account as its immutable round. Candidate-only; transfer remains guarded.
-- A composite FK makes cross-account delivery impossible even for a privileged
-- writer or a future SECURITY DEFINER transfer implementation.
BEGIN;
ALTER TABLE sabora.order_rounds
 ADD CONSTRAINT order_rounds_id_account_unique UNIQUE (id,account_id);
ALTER TABLE sabora.order_round_delivery_destinations
 ADD CONSTRAINT order_round_delivery_round_account_fk
 FOREIGN KEY (round_id,account_id)
 REFERENCES sabora.order_rounds(id,account_id)
 NOT DEFERRABLE;
-- Validate existing backfill as part of the same DDL transaction.
DO $integrity$
BEGIN
 IF EXISTS (
  SELECT 1 FROM sabora.order_round_delivery_destinations d
  JOIN sabora.order_rounds r ON r.id=d.round_id
  WHERE d.account_id<>r.account_id
 ) THEN
  RAISE EXCEPTION 'h6_delivery_account_mismatch';
 END IF;
END;
$integrity$;
COMMIT;
