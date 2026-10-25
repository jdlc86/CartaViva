# Outbox candidate — PostgreSQL 17 disposable verification

State: **executed locally and integrated into GitHub Actions on 2026-10-25**.
The schema remains a design-only candidate at
`docs/security/sql-candidates/staff_invitation_outbox_schema_pg17.sql`; passing
these tests does not authorize installing it on operational Supabase.

## Preconditions

Use a disposable PostgreSQL 17 database containing the prerequisite
`sabora.staff_enrollments` table from the isolated staff lifecycle
candidate migration. Use a test-only role with permission to create the
outbox table; do not reuse production credentials or the shared VPS.

## Automated harness

`scripts/ci/staff-invitation-outbox-postgres17.test.mjs` runs through the same
loopback-only disposable container and temporary pinned `pg@8.16.3` module as
the other real-driver suites. The wrapper refuses non-GitHub targets, verifies
the exact ephemeral URL and removes the container and module directory on exit.
Both workflows invoke it from
`scripts/ci/catalog-postgres17-node-driver-smoke.sh` after applying every
operational migration; the test then applies the outbox SQL from `docs/` only
inside that disposable database.

The original eight real PostgreSQL cases verify:

1. PostgreSQL 17, FORCE RLS, owner-scoped policies, zero runtime table grants
   and denial to a real unprivileged login.
2. Hash/state/claim/outcome constraints, attempt-state coupling, paired
   cancellation fencing and monotonic timestamps.
3. `pending → claimed → dispatching → delivered`, including a wrong fence
   before dispatch and after completion.
4. Two independent claimers blocked by `FOR UPDATE`; exactly one fence wins.
5. `revoke↔claim`: revocation waits for the lock, then blocks dispatch,
   reconciliation cancels the claimed job and late acceptance is denied by the
   staff lifecycle wrapper.
6. `resend↔claim`: the old version becomes superseded, the new version is
   unique, and re-claiming the same job is a no-op.
7. Provider result `unknown` is persisted once as terminal `failed`, remains
   visibly ambiguous and is never automatically retried.
8. A provider may accept an already in-flight message after revocation, but the
   enrollment remains `revoked`; outbox delivery never activates staff.

## Defects found by the first real run

The initial run passed 5/8 and exposed three defects that mock/static tests had
not detected:

- `pending` accepted a nonzero `attempts` value;
- `pending→claimed` did not advance `updated_at`, leaving it older than
  `claimed_at`;
- `claimed→dispatching` never incremented `attempts`.

The correction couples attempts to state, increments the counter only when a
dispatch is authorized, updates the claim timestamp atomically, rejects a
half-populated cancellation fence and requires `updated_at` to cover every
durable transition timestamp. The repeated local run passed **8/8**. Root
regression passed **830/830**, focused invitation tests **48/48**, and the API
syntax build passed before commit `bab8f59`.

## Atomic lifecycle/outbox acceptance

Commit `1021380` adds an integrated `SECURITY DEFINER` boundary that invokes
the existing HMAC lifecycle wrapper and changes the outbox in one PostgreSQL
statement. Its sealed `NOLOGIN` owner receives only:

- `EXECUTE` on the internal HMAC wrapper;
- column-level outbox `SELECT`, `INSERT` and cancellation-only `UPDATE`;
- three RLS policies for those exact operations.

The disposable harness creates a real `LOGIN` named
`sabora_ci_staff_invitation_runtime`. It is `NOINHERIT`, not superuser, has no
`BYPASSRLS`, role membership, database/schema creation, table, column or
sequence privileges, and cannot execute the internal lifecycle wrapper. Its
only positive data-plane capability is `EXECUTE` on the integrated wrapper.
Direct reads/writes, keyring access, DDL and `SET ROLE` are exercised and
denied. Administrator access is used only for fixture setup and independent
inspection, never as the acceptance principal.

The resulting 15-case PG17 matrix proves that lifecycle row, idempotency
ledger, audit and outbox commit together; an outbox uniqueness failure rolls
all four back and can be safely retried after the conflict is removed. It also
proves a concurrent identical invite creates one job plus one replay, resend
cancels a claimed old version, acceptance cancels pending delivery, and revoke
wins against a blocked resend with no deliverable work remaining. Final local
results: **15/15 PG17**, **60/60 focused**, **842/842 root**, API build and
`git diff --check` successful.

## Unresolved gates

The candidate schema deliberately grants no runtime LOGIN. The positive login
and its `EXECUTE` grant exist only in the disposable harness. It has no
encrypted invitation secret, no approved operational credential or worker
identity/policies and no lease-expiry/reclaim protocol. It is therefore **not
deployable**. The provider remains unselected;
`accepted` means only provider acceptance, and an `unknown` response is kept
terminal to avoid a duplicate email after a possibly successful request.

There is intentionally no attempt to make an external email atomic with a
database revocation. A dispatch already in flight may finish; safety comes from
revalidating the durable enrollment and token during acceptance. No worker,
endpoint or real email is activated by this verification.

A mock transaction test cannot substitute for these checks.
