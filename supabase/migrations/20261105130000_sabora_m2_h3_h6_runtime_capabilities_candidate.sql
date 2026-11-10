-- Sabora M2: exact opt-in capabilities for the H3-H6 integration candidate.
-- Candidate only: no LOGIN, password, endpoint, worker or deployment is created.
BEGIN;

DO $roles$
DECLARE v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY[
    'sabora_f12_customer_runtime',
    'sabora_f12_operations_runtime',
    'sabora_b3_confirmation_runtime',
    'sabora_b3_h6_reader_runtime',
    'sabora_b3_h4_transition_runtime',
    'sabora_m2_customer_event_runtime'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname=v_role) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOREPLICATION',v_role);
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE rolname=ANY(ARRAY[
      'sabora_f12_customer_runtime','sabora_f12_operations_runtime',
      'sabora_b3_confirmation_runtime','sabora_b3_h6_reader_runtime',
      'sabora_b3_h4_transition_runtime',
      'sabora_m2_customer_event_runtime'
    ]) AND (rolcanlogin OR rolinherit OR rolsuper OR rolbypassrls OR
      rolcreatedb OR rolcreaterole OR rolreplication)
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_m2_runtime_role' USING errcode='0P000';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_catalog.pg_auth_members m
    JOIN pg_catalog.pg_roles granted ON granted.oid=m.roleid
    JOIN pg_catalog.pg_roles member ON member.oid=m.member
    WHERE granted.rolname=ANY(ARRAY[
      'sabora_f12_customer_runtime','sabora_f12_operations_runtime',
      'sabora_b3_confirmation_runtime','sabora_b3_h6_reader_runtime',
      'sabora_b3_h4_transition_runtime',
      'sabora_m2_customer_event_runtime'
    ]) OR member.rolname=ANY(ARRAY[
      'sabora_f12_customer_runtime','sabora_f12_operations_runtime',
      'sabora_b3_confirmation_runtime','sabora_b3_h6_reader_runtime',
      'sabora_b3_h4_transition_runtime',
      'sabora_m2_customer_event_runtime'
    ])
  ) THEN
    RAISE EXCEPTION 'unsafe_sabora_m2_runtime_membership' USING errcode='0P000';
  END IF;
END;
$roles$;

GRANT USAGE ON SCHEMA sabora TO
  sabora_f12_customer_runtime,
  sabora_f12_operations_runtime,
  sabora_b3_confirmation_runtime,
  sabora_b3_h6_reader_runtime,
  sabora_b3_h4_transition_runtime,
  sabora_m2_customer_event_runtime;

GRANT EXECUTE ON FUNCTION sabora.request_customer_table_change_h6_resolved_candidate(bytea),
  sabora.read_customer_table_change_h6_candidate(bytea),
  sabora.read_customer_table_change_outbox_h6_candidate(bytea,bigint,integer)
 TO sabora_f12_customer_runtime;

GRANT EXECUTE ON FUNCTION sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)
 TO sabora_f12_operations_runtime;

-- This is the only positive cutover grant for transfer confirmation. The
-- legacy H6 customer capability deliberately retains no EXECUTE on it.
GRANT EXECUTE ON FUNCTION sabora.confirm_customer_round_h6_transfer_integration_candidate(
  bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text),
  sabora.resubmit_customer_order_revision_h6_candidate(
  bytea,uuid,text,text,text,uuid,integer,text,jsonb,boolean)
 TO sabora_b3_confirmation_runtime;

GRANT EXECUTE ON FUNCTION sabora.read_customer_round_h6_candidate(bytea,uuid,text,uuid),
  sabora.read_customer_payment_policy_h6_candidate(bytea,uuid,text),
  sabora.read_customer_order_revision_h6_candidate(bytea,uuid,text,uuid)
 TO sabora_b3_h6_reader_runtime;

-- Kitchen/sala receives the destination-aware board, actor-bound transition
-- and immutable history only. The physical LOGIN receives SET membership,
-- never direct EXECUTE or relation privileges.
GRANT EXECUTE ON FUNCTION sabora.transition_order_line_authorized_candidate(
  text,text,uuid,uuid,text,text,bigint,bigint,text),
  sabora.read_order_operations_delivery_pickup_board_h6_candidate(
  text,text,uuid,text,text,bigint,uuid,integer,integer,bigint,bigint,text),
  sabora.read_order_operations_history_authorized_candidate(
  text,text,uuid,text,uuid,integer,bigint,bigint,text)
 TO sabora_b3_h4_transition_runtime;

-- SSE has a distinct one-function capability. It cannot confirm an order,
-- read a round, request a table change or impersonate staff operations.
GRANT EXECUTE ON FUNCTION sabora.read_customer_event_backlog_h6_candidate(
  bytea,uuid,text,uuid,bigint,integer)
 TO sabora_m2_customer_event_runtime;

COMMIT;
