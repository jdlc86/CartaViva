# H6 — Evidencia de progreso del bloque B (2026-10-30)

**Estado: PARCIAL / NO-GO.** Este informe es evidencia de implementación, no norma funcional. La autoridad sigue siendo `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`.

## Cambios verificables

- `20261030160000_sabora_h6_operational_binding_foundation_candidate.sql`: vínculos operativos versionados por cuenta, destino de entrega por ronda, backfill y RLS FORCE sin permisos DML de cliente.
- `20261030170000_sabora_h6_historical_round_reader_candidate.sql`: lectura histórica anclada al pedido original y `order_rounds.account_id`, sin acoplamiento a la ubicación mutable de la cuenta.
- `scripts/ci/table-change-root-postgres17.test.mjs`: regresión real de lectura histórica, aislamiento de roles, identidad económica y destino de entrega.
- `scripts/ci/migration-audit.mjs` y su prueba: nueva migración registrada y auditada.

## Evidencia CI

- `ba10bfeb6d475d4237ed5dfd22c3522a3c3bed81`: Sabora CI, conformidad visual y bootstrap, todos SUCCESS.
- `f90cef67fe50e6c1e694c8a5912b09dbb18d53cc`: las tres ejecuciones SUCCESS, incluida PostgreSQL 17.
- `4ce707547197be146f65dd22c1ca6ebf85462f8a`: las tres ejecuciones SUCCESS, incluida PostgreSQL 17.
- No se han ejecutado las pruebas funcionales completas F01–F28/R01–R10; no se atribuye PASS a esas puertas.

## Bloqueadores para cerrar B

La función `confirm_customer_round_h6_candidate` continúa bajo el guard provisional `table_change_transfer_not_integrated`. Falta integrar en **una sola transacción** la cuenta elegible exacta, la sesión autorizada, revalidación QR, consumo único del permiso, creación de ronda, pagos, traslado de destinos pendientes, eventos e idempotencia. La lectura histórica ya no debe depender de la ubicación operativa, pero los consumidores de sala/cocina/SSE siguen pendientes de integración conjunta en C.

**Regla de seguridad:** no retirar el guard ni activar el flujo mientras no haya confirmación raíz y regresiones PG17 de concurrencia, cierre, revocación, pago e idempotencia. No hay merge ni despliegue autorizado. Fleetia, VPS compartido y Supabase operativo fuera de alcance.


## Integración de confirmación de proyecciones — avance posterior

- `20261030180000_sabora_h6_confirm_projection_atomic_candidate.sql` integra, en la **misma transacción de confirmación H6**, la creación/validación del vínculo operativo y la proyección de entrega por ronda. Mantiene la restricción preventiva entre mesas y el origen histórico inmutable.
- El reintento comprueba que `order_rounds.account_id` coincide con la cuenta esperada y devuelve la identidad económica persistida, no una cuenta inferida de la mesa.
- Solo `sabora_h6_fn_owner` (sin login) obtiene privilegios de proyección bajo políticas RLS específicas; el rol cliente carece de DML directo.
- `scripts/ci/table-change-root-postgres17.test.mjs` verifica el orden transaccional, el guard y los privilegios del catálogo PG17.
- **Defecto detectado y corregido:** SQLSTATE `42702` por `ON CONFLICT(account_id)` ambiguo con la columna de retorno de PL/pgSQL. Corregido mediante `ON CONFLICT ON CONSTRAINT customer_account_operational_bindings_pkey`.
- Commit de corrección `364a61a750a524d6a8e6ad86439e26f4df4b4c2a`: **Sabora CI SUCCESS, conformidad visual SUCCESS y Bootstrap SUCCESS**. La primera ejecución con el defecto fue FAIL y no se oculta. Los diagnósticos temporales se retiraron después en `ae4a8ed`, cuya CI se verifica por separado.

**No confundir este avance con el cierre de B:** todavía no se implementa la transferencia entre mesas ni el consumo de permiso, y la matriz F01–F28/R01–R10 sigue sin cerrar. Estado global NO-GO.

## Integridad de la proyección de entrega — puerta adicional B1

- Migración forward-only `20261030200000_sabora_h6_delivery_account_integrity_candidate.sql`: impone `UNIQUE(order_rounds.id,order_rounds.account_id)` y una FK compuesta desde `order_round_delivery_destinations(round_id,account_id)`. El destino no puede declarar una cuenta diferente de la ronda histórica.
- La migración valida las filas existentes bajo la misma transacción de DDL. No altera balances, pagos, pedidos históricos, roles ni políticas RLS. **Impacto de bloqueo:** validación y locks DDL sobre rondas y destinos; solo se ha destinado a PostgreSQL 17 desechable.
- `scripts/ci/table-change-root-postgres17.test.mjs`: prueba negativa de cuenta cruzada (SQLSTATE 23503) y positiva de proyección coherente, con rollback del fixture.
- Auditoría de migraciones y recuento actualizados. Commits de implementación hasta `f96e927`.
- **CI del commit pendiente de resultado al redactar este apartado**; no se declara PASS antes de verificar Actions.
- Este refuerzo es una **condición necesaria, no suficiente**: todavía falta consumo atómico del permiso y traslado real, consumidores sala/cocina/SSE y aceptación F01–F28/R01–R10. El guard provisional permanece. **NO-GO**.

## B2 — orden de bloqueos en la decisión del camarero

- `20261030210000_sabora_h6_table_change_decision_lock_order_candidate.sql`: la decisión ahora resuelve identidad sin bloquear filas, toma primero el advisory lock del cliente compartido con la confirmación H6, y solo después bloquea cuenta y solicitud; revalida estado de cuenta, rol activo y vencimiento en el punto de decisión. Evita la inversión anterior `account FOR UPDATE → advisory` frente a `advisory → account FOR UPDATE`, que podía causar deadlock.
- La función sigue **sin permisos EXECUTE de roles runtime** hasta disponer de una frontera de autenticación del actor; no se activa el traslado.
- Prueba de catálogo PG17 añadida para propietario, aislamiento y orden de bloqueos. Las pruebas de carreras funcionales y consumo único siguen pendientes.
- Estado de este bloque: candidato sujeto a GitHub Actions; **NO-GO** para despliegue.


## B1 extension — per-line delivery scope (2026-10-30)

Candidate migration `20261030220000_sabora_h6_line_delivery_destination_foundation_candidate.sql`
introduces an account-scoped destination for each **non-picked-up order line**.
The earlier round-level destination is insufficient for a round containing
both a picked-up line and an outstanding line: moving the entire round would
rewrite the completed item's operational delivery scope. The new table
separates line identity, original order and stable account from mutable
delivery table/session/visit, with composite foreign keys, FORCE RLS and
owner-only scoped DML. The backfill excludes completed pickups and checks its
cardinality. A real PG17 catalog test verifies the new FKs and privilege
boundary; migration audit tracks the change.

**No transfer is enabled** by this migration. Confirmation remains guarded,
and the next complete B2 step must atomically consume the approved grant,
rebind the stable account, redirect only pending line destinations and
persist the new order in the same transaction. It must update staff delivery
readers and SSE before acceptance. This is a B1 foundation, not B2 closure.
CI results for the new migration must be checked before claiming validation.


## B1 line-destination lifecycle (candidate)

Migration `20261030230000_sabora_h6_line_delivery_confirm_lifecycle_candidate.sql`
replaces the sealed H6 confirmation so **newly confirmed rounds** insert one
destination per non-picked-up line, in the same database transaction, after
the round and before kitchen dispatch. Existing lines are backfilled by the
previous migration. This closes the **candidate projection lifecycle**
(backfill plus new writes) but does not implement transfer or staff delivery
readers. The source-order invariant is asserted against PG17 function catalog;
actual CI execution remains required for acceptance. Migration audit now
covers 53 files. The cross-table guard is intentionally preserved.

## PostgreSQL FK preflight correction

The per-line projection's composite FK `(order_id,order_line_id)` needs an explicit
unique referenced key `order_lines(order_id,id)`, not merely the single-column
primary key. Added this key in the same candidate migration and a PG17 catalog
assertion. The change is additive and does not modify historical order identity.
The CI execution is required before the migration can be accepted.

## B2 sealed grant-consumption primitive (candidate)

Migration `20261031000000_sabora_h6_atomic_grant_consume_candidate.sql`
adds an owner-only SECURITY DEFINER primitive for **one-use approved grant
consumption**. It serializes by customer advisory lock, revalidates the active
session, open account, operational binding, approved request, destination
visit/QR version and persisted destination order; in one transaction it marks
the approval consumed, moves the operational account binding and redirects
only lines not in `picked_up` status. Original orders, account balances,
payment attempts and dispatch records are not rewritten. No direct runtime
EXECUTE is granted; PG17 catalog assertions check its sealed boundary.

**Integration gate remains open:** the H6 confirmation function does not yet
call this primitive. A proper B2 cutover must resolve the original account
before persisting an order on B, preserve idempotent replay, invoke consumption
within the same transaction, synchronize round/line destination readers and
SSE, and pass real PG17/E2E concurrency/payment tests. Do not treat this
primitive as a working end-to-end table transfer.

## B2 grant-consumption ownership hardening

The sealed primitive now requires the destination order to have an H6 round
whose immutable `account_id` matches the original economic account before it
may consume the one-use approval. Matching only customer and destination table
would permit a mismatched order to act as proof of transfer. The PG17 catalog
test asserts this ownership predicate. This is a security correction to the
candidate primitive, **not** an end-to-end transfer cutover. GitHub Actions
must pass before the candidate can be accepted.

## Session revocation hardening

The sealed B2 transfer primitive now requires its approved grant to belong to
the same still-active customer session that originally requested the change.
A grant from a revoked, expired or different session cannot be consumed. PG17
catalog assertions were extended. This is an isolated security increment;
confirmation integration and end-to-end tests remain mandatory before GO.

## B2 delivery projection consistency (2026-10-30)

The one-use grant consumer now updates both per-line pending destinations and
round-level destinations **only for rounds with no picked-up line**. A mixed
round with a completed pickup retains its round-level historical destination;
its remaining uncollected lines are individually redirected. This avoids
falsely reporting a completed pickup at the new table. PG17 assertions were
added to verify the conservative round-level guard.

Still **NO-GO**: the primitive remains isolated from confirmation, and
operational readers/SSE must use the line-level projection for mixed rounds.

## B2 atomic confirmation integration candidate

Migration `20261031010000_sabora_h6_transfer_confirmation_integration_candidate.sql`
introduces a **separate, ungranted** confirmation function. It resolves the
existing open economic account and validates a same-session approved request
before order persistence. It creates the destination order and round against
the original account, then invokes the one-use grant consumer inside the same
transaction, so rollback also rolls back the order, grant, account binding and
delivery redirection. Replays are checked against the existing round before
consumption. The active `confirm_customer_round_h6_candidate` remains
unchanged and fail-closed; PG17 catalog tests enforce that separation.

**Not production-ready:** this candidate has not passed real PG17 execution
or browser E2E tests. Before cutover, test SQL privileges, the underlying
persistence function's cross-table assumptions, multiple-account ambiguity,
mixed picked-up deliveries, grouping, pay-now/pay-later and SSE kitchen/sala
readers. Only after all acceptance gates pass should the approved entrypoint
be switched; no runtime EXECUTE grant was introduced here.

## Economic account ambiguity gate

The isolated transfer confirmation now rejects a customer with multiple open
accounts instead of arbitrarily selecting the first. This prevents combining
unrelated debts or payments in legacy/exceptional states. A PG17 catalog test
asserts the fail-closed predicate. A deterministic reconciliation process is
still required before such a customer may transfer; no production data is
changed by this gate.

## CI baseline recovered — 2026-10-30

Commit `95f7cc5664f456fc2268956ebae1b5fc58d2a822` passed all three
GitHub workflows: Sabora CI, bootstrap lockfile, and client browser
conformance. The preceding PostgreSQL run reached 14/15 table-change
tests; the remaining assertion was an overescaped regular expression,
corrected before this green baseline. The 48-table FORCE RLS inventory
explicitly includes the per-line destination projection.

**Scope limitation:** these green checks establish migration/catalog and
existing regression conformance, **not** a successful A→B transfer in a
real customer checkout. A new PG17 negative execution test verifies that
the sealed consumer rejects invalid input without changing grant/binding/
delivery row counts. Positive transaction, idempotency, concurrent request,
mixed pickup and payment integration tests remain mandatory. Do not
enable runtime EXECUTE or promote the candidate until they pass.

## PG17 positive approval-consumption milestone — 2026-10-30

Commit `99b5ff23349f512a2b2de5192f4680273d536429` passed all three GitHub Actions workflows (Sabora CI, bootstrap lockfile, client browser conformance). The real PostgreSQL 17 B2 test now executes a one-use approved A→B transfer and checks the original economic account, historical order table, destination binding, unchanged balance, consumed grant and replay rejection. The sealed primitive's ownership check was corrected to use the actual `orders.customer_identifier` and `customer_profiles.public_id` schema, with column-scoped owner privileges and a dedicated owner RLS read policy. No customer/staff runtime EXECUTE grant was introduced.

**Acceptance boundary:** this proves the isolated grant-consumption path in PG17, not end-to-end H6 confirmation, kitchen/sala readers, SSE, mixed picked-up lines, payment modes or concurrency. B2 remains **NO-GO** until these are covered with executable integration/E2E evidence. No merge, production migration or VPS deployment is authorized by this result.

## PG17 delivery-redirection acceptance — 2026-10-30

Commit `1dde277ea63545345de3a805c6ffe4ed726d2543` passed all three GitHub Actions workflows. The real PostgreSQL 17 test exercises a one-use approved A→B grant with an **earlier pending round** and verifies that the operational binding and pending round destination move to B while the original order remains historically on A, the economic account stays unchanged and its outstanding balance remains intact. This is stronger than the prior isolated grant test because it verifies the redirection of already-existing pending work.

**Unclosed B2 acceptance:** the test still calls the sealed grant consumer directly; it does not establish that `confirm_customer_round_h6_transfer_integration_candidate` can persist a valid quoted order, payment state and delivery projections in the same transaction. A positive integrated PG17 checkout, idempotent replay, rollback, concurrency, mixed picked-up lines, and kitchen/sala/SSE E2E remain required. No runtime permission, merge, production migration or deployment is approved. Status: **NO-GO**.
