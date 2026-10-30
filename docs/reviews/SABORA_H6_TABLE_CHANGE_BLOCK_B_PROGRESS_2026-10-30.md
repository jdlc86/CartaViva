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
