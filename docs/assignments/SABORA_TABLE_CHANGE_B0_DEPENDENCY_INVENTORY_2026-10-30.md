# B0 — Inventario verificable de dependencias del cambio de mesa (2026-10-30)

**Estado:** inventario parcial de código, NO-GO; no sustituye la normativa de `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`. Guía de aceptación: `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`.

## Relaciones inspeccionadas en migración H6
Fuente: `supabase/migrations/20261027122858_sabora_h6_events_payments_operations_candidate.sql`.

| Entidad | Relación / campos comprobados | Invariante para traslado |
| --- | --- | --- |
| `sabora.customer_accounts` | `id` PK; `table_id`, `session_id`, `visit_key`, `customer_id`; `state` open/settled/blocked; UNIQUE (table_id,session_id,visit_key,customer_id) y UNIQUE (id,table_id,session_id,visit_key,customer_id) | Mantener `id`, saldo y pagos; impedir duplicación al confirmar destino; revisar todas las FKs antes de cambiar mesa/visita |
| `sabora.order_rounds` | `order_id` UNIQUE FK a orders; `account_id` FK a customer_accounts(id); `grouping_deadline`, `state` | Rondas anteriores conservan cuenta, plazo y estado |
| `sabora.payment_attempts` | `round_id` FK a order_rounds; `account_id` FK a customer_accounts(id) | Mantener identidad y correlación de Stripe |
| `sabora.kitchen_dispatches` | `round_id` UNIQUE FK, `order_id` UNIQUE FK, `state`; **sin columna de destino de entrega** en esta tabla | No usar dispatch como única fuente de destino; identificar proyección de sala/recogida antes de modificar |
| `sabora.event_outbox` | `table_id`, `session_id`, `visit_key`, `customer_id`, `account_id`, `audience`, `staff_role`, `aggregate_id`, `payload` | No reescribir eventos históricos; generar nuevos eventos de traslado con audiencias correctas y evitar filtraciones |
| `sabora.customer_table_change_requests` | Migración `20261030124000_sabora_table_change_candidate.sql`: cuenta, origen, ventana, decisión, destino y pedido consumidor | Aprobación sin traslado; consumo único al confirmar pedido en destino |

## Bloqueo de arquitectura confirmado
`sabora.confirm_customer_round_h6_candidate` llama a `sabora.persist_customer_order_candidate` **antes** de resolver `customer_accounts`. Después busca/crea cuenta por mesa, sesión, visita y cliente. Sin refactorización de ese orden, un pedido desde destino puede crear una cuenta nueva y dividir el saldo. No integrar `applyTransfer` después de la confirmación.

`apps/api/src/customer-production-composition.mjs` restringe SQL por lista exacta y `apps/api/src/h6-sql-preflight.mjs` verifica superficie de funciones por rol. La adaptación no puede ejecutarse con SQL libre o privilegios generales.

## Orden de trabajo antes de B1/B2
1. Completar inventario de `orders`, `order_lines`, `customer_table_visits`, vistas/proyecciones de sala y cocina, SSE, consultas de cobro y referencias de mesa/visita en **todas** las migraciones. Comprobar constraints/FKs efectivas con PG17 aislado.
2. Establecer orden de bloqueos consistente: sesión/visita, cuenta, autorización, pedido y destinos operativos, con carreras y rollback verificables. El orden definitivo requiere contrastar la función H6 existente.
3. Introducir representación explícita del destino operativo de entregas pendientes **separada** del origen histórico; actualizar lectores de sala/cocina y eventos sin modificar registros históricos.
4. Refactorizar confirmación H6 para resolver y bloquear cuenta original **antes** de crear/relacionar la ronda; validar QR y mesa en la misma transacción, consumir concesión y mover destinos pendientes de forma atómica.
5. Ejecutar F01–F28 y R01–R10 de la guía, con PG17 real y navegador; solo después considerar GO.

## Evidencia y límites
Inspección estática de la migración H6 y del código candidato; **no se han ejecutado pruebas PG17 ni E2E** para este inventario. No hay autorización para merge, despliegue, Supabase operativo o recursos del VPS. Fleetia queda excluido.

## Hallazgo adicional — consultas de reintento y pagos H6 (bloqueante)
Inspección de `sabora.read_customer_round_h6_candidate` en la misma migración: enlaza `customer_accounts a` mediante `a.table_id=t.id AND a.session_id=t.session_id AND a.visit_key=v.visit_key` y exige simultáneamente `orders o` en `o.table_id=t.id AND o.session_id=t.session_id AND o.customer_visit_key=v.visit_key`, además de `order_rounds r` con `r.account_id=a.id`. Tras un cambio de mesa, un pedido histórico conserva mesa A mientras la cuenta operativa puede apuntar a B; esta consulta dejaría de poder recuperar la ronda histórica si se actualiza simplemente `a.table_id`. **Es obligatorio rediseñar el acceso a rondas históricas por identidad económica estable, validando la titularidad de sesión, no por coincidencia de mesa actual y mesa histórica.** Probar reintento de confirmación, consulta de estado y pagos iniciados antes del traslado.

En `confirm_customer_round_h6_candidate`, la rama de reintento `IF FOUND` de `order_rounds` devuelve `v_account.id` de la cuenta buscada por la mesa solicitada, no necesariamente `v_round.account_id` del pedido ya persistido. Eso exige una aserción de identidad al reintentar, para evitar devolver una cuenta distinta. No se debe corregir mediante actualización retroactiva de `orders.table_id`.

Estos hallazgos refuerzan la necesidad de una refactorización conjunta de **confirmación + consulta de ronda + proyección de entrega + SSE**, no una actualización aislada de cuenta.

## Protección candidata previa al traslado — 2026-10-30
- Migración nueva: `supabase/migrations/20261030143000_sabora_h6_cross_table_account_guard_candidate.sql`.
- La confirmación H6 se rechaza **antes de persistir** si el mismo cliente tiene una cuenta abierta en otra mesa; bloqueo transaccional por cliente mediante advisory lock. Evita que el flujo H6 actual abra inadvertidamente una segunda cuenta económica en una mesa diferente.
- La protección es **deliberadamente restrictiva**: también bloquea cambios legítimos aprobados y puede bloquear una nueva visita en otra mesa mientras una cuenta anterior permanezca abierta. No equivale a transferencia ni resuelve visitas/sesiones múltiples.
- Se incorpora test estructural `apps/api/src/table-change-h6-cross-table-guard.test.mjs` a `npm test`. **No hay ejecución PostgreSQL 17 ni prueba E2E acreditada.**
- Próximo hito: sustituir el rechazo por consumo atómico del permiso, revalidación de QR/mesa, conservación de cuenta, proyección de entregas y consulta histórica segura. Mantener NO-GO.

## Corrección de alcance — 2026-10-30
La comprobación de la migración provisional `20261030143000` ya no filtra por `customer_accounts.session_id`: las sesiones operativas pueden diferir entre mesas y ese filtro permitiría dividir la cuenta económica. Se mantiene el rechazo de cualquier otra cuenta abierta del cliente hasta resolver continuidad y ámbito de visita de forma normativa. La restricción puede bloquear visitas posteriores con cuentas antiguas abiertas. Prueba estructural actualizada; **PG17 y E2E no ejecutados**. No aprobar despliegue.

### Corrección de alcance del bloqueo preventivo (2026-10-30)
La hipótesis de que las mesas comparten `session_id` **no está garantizada**. Se retiró del predicado de bloqueo el filtro `a.session_id=v_visit.session_id` (commit `6290a388`), porque permitía abrir una segunda cuenta en otra mesa con sesión diferente. El test estructural ahora exige la ausencia de ese filtro (commit `781bc3dd`). La consulta continúa restringida a cuentas abiertas del mismo cliente y mesa distinta. **Riesgo residual conocido:** una cuenta antigua abierta puede bloquear una nueva visita legítima; no se puede resolver correctamente sin introducir identidad de visita económica y transferencia transaccional. Sin PG17 real ni E2E acreditados; NO-GO.
