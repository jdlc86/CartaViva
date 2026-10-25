# Outbox candidate — PostgreSQL 17 disposable verification

This file is a **test plan**, not evidence of execution. The outbox schema
lives at `docs/security/sql-candidates/staff_invitation_outbox_schema_pg17.sql`
and must not be installed on operational Supabase.

## Preconditions

Use a disposable PostgreSQL 17 database containing the prerequisite
`sabora.staff_enrollments` table from the isolated staff lifecycle
candidate migration. Use a test-only role with permission to create the
outbox table; do not reuse production credentials or the shared VPS.

## Validation sequence

1. Create the prerequisite schema in a disposable PostgreSQL 17 database.
2. Apply the outbox SQL candidate and confirm transaction commits.
3. Verify `relrowsecurity` and `relforcerowsecurity` are both true.
4. Verify `PUBLIC` has no direct table privileges and no permissive
   policies exist. Verify an unprivileged login cannot read or mutate.
5. Under an isolated owner/test principal, insert a staff enrollment and
   one pending outbox job with matching hash/version. Confirm duplicate
   `(enrollment_id,invite_version)` is rejected.
6. Exercise the adapter SQL with two independent database connections and
   transactions. Confirm the first `FOR UPDATE OF o,e` blocks the second
   until commit; only one conditional `pending→claimed` succeeds.
7. Race `revoke` and `resend` against a claim. Ensure the subsequent
   transaction observes the durable state and cannot claim a stale token.
8. Confirm malformed hashes, invalid state, null fence on claimed work,
   and illegal timestamp combinations are rejected by constraints.
9. Roll back/clean the disposable database and record exact PostgreSQL
   version, test commands, output, SHA and CI run IDs in continuity docs.

## Unresolved gates

The candidate schema deliberately grants no runtime permissions. It has
no encrypted invitation secret and no transactional enqueue in the staff
lifecycle function. It is therefore **not deployable**. Provider delivery,
retry semantics, expiry, revocation in flight and actor binding still require
the separate security decision gate.

A mock transaction test cannot substitute for these checks.
