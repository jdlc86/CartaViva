-- Candidate writer table lock / ordering-state gate, executed only in
-- isolated disposable PostgreSQL 17 after canonical migrations.
-- A denied state must produce zero lockable rows, before INSERT or ledger.
BEGIN;
INSERT INTO sabora.dining_tables(number,capacity,qr_token_hash,ordering_state,
 grouping_window_seconds)
VALUES (930193,4,decode(repeat('93',32),'hex'),'open',120)
RETURNING id AS table_id,session_id \gset

-- Exact SQL predicate used by catalog-order-writer.mjs.
SELECT 1 / CASE WHEN count(*)=1 THEN 1 ELSE 0 END AS open_table_allowed
 FROM (
  SELECT first_confirmed_at,grouping_window_seconds
  FROM sabora.dining_tables
  WHERE id=:'table_id' AND session_id=:'session_id'
    AND (ordering_state='open' OR
         (ordering_state='paused' AND pause_until IS NOT NULL
          AND pause_until<=clock_timestamp()))
  FOR UPDATE
 ) permitted;

UPDATE sabora.dining_tables SET ordering_state='closed' WHERE id=:'table_id';
SELECT 1 / CASE WHEN count(*)=0 THEN 1 ELSE 0 END AS closed_table_denied
 FROM (
  SELECT id FROM sabora.dining_tables
  WHERE id=:'table_id' AND session_id=:'session_id'
    AND (ordering_state='open' OR
         (ordering_state='paused' AND pause_until IS NOT NULL
          AND pause_until<=clock_timestamp()))
  FOR UPDATE
 ) permitted;

UPDATE sabora.dining_tables
 SET ordering_state='paused',pause_until=clock_timestamp()+interval '1 hour'
 WHERE id=:'table_id';
SELECT 1 / CASE WHEN count(*)=0 THEN 1 ELSE 0 END AS future_pause_denied
 FROM (
  SELECT id FROM sabora.dining_tables
  WHERE id=:'table_id' AND session_id=:'session_id'
    AND (ordering_state='open' OR
         (ordering_state='paused' AND pause_until IS NOT NULL
          AND pause_until<=clock_timestamp()))
  FOR UPDATE
 ) permitted;

UPDATE sabora.dining_tables SET pause_until=NULL WHERE id=:'table_id';
SELECT 1 / CASE WHEN count(*)=0 THEN 1 ELSE 0 END AS indefinite_pause_denied
 FROM (
  SELECT id FROM sabora.dining_tables
  WHERE id=:'table_id' AND session_id=:'session_id'
    AND (ordering_state='open' OR
         (ordering_state='paused' AND pause_until IS NOT NULL
          AND pause_until<=clock_timestamp()))
  FOR UPDATE
 ) permitted;

-- An expired pause is inspected separately: PostgreSQL's table-state
-- constraints/triggers may normalize it. Do not claim acceptance until the
-- effective state transition has an independently verified contract.
UPDATE sabora.dining_tables
 SET pause_until=clock_timestamp()-interval '1 hour' WHERE id=:'table_id';
SELECT ordering_state,pause_until,
 (ordering_state='open' OR
  (ordering_state='paused' AND pause_until IS NOT NULL
   AND pause_until<=clock_timestamp())) AS eligible_by_writer_predicate
 FROM sabora.dining_tables WHERE id=:'table_id';

-- Session rotation invalidates the old session, even when table is open.
UPDATE sabora.dining_tables SET ordering_state='open' WHERE id=:'table_id';
SELECT 1 / CASE WHEN count(*)=0 THEN 1 ELSE 0 END AS wrong_session_denied
 FROM (
  SELECT id FROM sabora.dining_tables
  WHERE id=:'table_id'
    AND session_id='00000000-0000-4000-8000-000000000099'
    AND (ordering_state='open' OR
         (ordering_state='paused' AND pause_until IS NOT NULL
          AND pause_until<=clock_timestamp()))
  FOR UPDATE
 ) permitted;

-- No order/ledger was written in any state. Rollback must remove fixture.
ROLLBACK;
SELECT 1 / CASE WHEN NOT EXISTS(
 SELECT 1 FROM sabora.dining_tables WHERE id=:'table_id'
) THEN 1 ELSE 0 END AS table_gate_fixture_rolled_back;
