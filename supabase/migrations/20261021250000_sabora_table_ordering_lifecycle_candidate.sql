-- Candidate table ordering lifecycle, isolated CI only. No runtime grants.
-- Closed and paused tables never authorize new orders. A timed pause is
-- evaluated at request time; it does not require a polling job.
BEGIN;
ALTER TABLE sabora.dining_tables
 ADD COLUMN ordering_state text NOT NULL DEFAULT 'closed'
  CHECK (ordering_state IN ('open','paused','closed')),
 ADD COLUMN pause_until timestamptz,
 ADD COLUMN ordering_state_changed_at timestamptz NOT NULL DEFAULT now(),
 ADD CONSTRAINT dining_table_pause_state CHECK
  ((ordering_state='paused') OR pause_until IS NULL);
COMMENT ON COLUMN sabora.dining_tables.ordering_state IS
 'Candidate staff-managed state; closed by default, no staff writer installed';
COMMENT ON COLUMN sabora.dining_tables.pause_until IS
 'If paused, new orders become eligible after this instant; NULL means indefinite pause';
COMMIT;
