# Auditoría de causa raíz y plan de corrección integral — cambio de mesa H6
Fecha: 2026-10-30. Estado: **NO-GO**. Fuente normativa: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` (cambio de mesa 2026-10-30). Este documento **no sustituye** la normativa.

## Evidencia de código revisada
1. `supabase/migrations/20261027122858_sabora_h6_events_payments_operations_candidate.sql`: `confirm_customer_round_h6_candidate` persiste primero mediante `persist_customer_order_candidate`, luego hace `INSERT ... customer_accounts(table_id,session_id,visit_key,customer_id) ON CONFLICT DO NOTHING` y resuelve la cuenta por la mesa actual. `order_rounds.account_id` y `payment_attempts.account_id` conservan referencias a esa cuenta. `read_customer_round_h6_candidate` une cuenta y pedido por mesa/visita; mover solo `customer_accounts.table_id` rompe consultas históricas.
2. `apps/api/src/customer-production-flow.mjs`: H6 confirma mediante una única función SQL `PERSIST_H6_ORDER_SQL`; no hay transferencia coordinada en el mismo límite de transacción.
3. `apps/api/src/customer-production-composition.mjs`: `h6FlowSql` contiene únicamente lectura de política, lectura de ronda y confirmación H6. No compone `tableChange` ni habilita funciones transaccionales de transferencia.
4. `apps/api/src/table-change-postgres-store.mjs`: `applyTransfer` lanza `table_change_transfer_not_integrated`; el adaptador ejecuta SQL arbitrario dentro de `withTransaction`, pero la migración de solicitudes aplica RLS forzada sin grants de ejecución directa. Falta contrato de identidad y funciones SECURITY DEFINER con permisos mínimos.
5. `supabase/migrations/20261030124000_sabora_table_change_candidate.sql`: conserva solicitudes/aprobaciones, pero no define la transferencia ni su vínculo a confirmación de pedido.
6. `supabase/migrations/20261030143000_sabora_h6_cross_table_account_guard_candidate.sql`: protección provisional restrictiva; puede bloquear visitas legítimas con cuentas previas abiertas. No constituye solución funcional y **no debe promocionarse como cierre**.
7. `sabora.kitchen_dispatches` no tiene columna de destino de entrega independiente; `sabora.event_outbox` contiene `table_id` y cursores por mesa/visita. Es incorrecto redirigir pedidos históricos reescribiendo el `orders.table_id`.

## Causa raíz
El modelo H6 utiliza `table_id/session_id/visit_key` como clave de localización de cuenta y consulta histórica. El contrato funcional requiere una **cuenta económica estable** y un **destino operativo mutable**. No existe actualmente un límite transaccional único que (a) valide QR y mesa, (b) seleccione/traslade cuenta, (c) consuma autorización una vez, (d) confirme pedido y (e) emita eventos correctamente aislados. Un `UPDATE customer_accounts.table_id` posterior a la confirmación crearía cuentas duplicadas y rompería historial.

## Decisión de corrección (no implementada todavía)
- Rediseñar confirmación H6 **en la función raíz**: resolver la cuenta estable *antes* de persistir pedido; validar la visita y QR en la confirmación; bloquear de forma determinista cliente/cuenta/autorización/mesa; consumir permiso y cambiar destino dentro de la **misma transacción** que inserta la ronda. Los reintentos de un pedido ya confirmado deben recuperar `order_rounds.account_id`, sin consumir una segunda autorización.
- Introducir una proyección explícita de destino operativo para entregas pendientes, sin alterar `orders.table_id` ni reconstruir cocina/pagos. Definir estados exactos de entrega a partir de las funciones operativas existentes antes de codificar.
- Hacer que las consultas históricas se autoricen por titularidad de cuenta/ronda y pedido original, no por igualdad entre mesa actual e histórica. Revisar también lecturas de pagos, saldo, avisos SSE y sus cursores; ningún evento debe filtrarse a otros comensales.
- Implementar funciones SECURITY DEFINER de alcance mínimo con owner/grants y preflight, conectadas a los roles y allowlists de `customer-production-composition.mjs`. No usar acceso genérico a tablas con RLS forzada.
- Resolver el ámbito de una cuenta entre visitas distintas: una cuenta anterior abierta no debe impedir por sí sola un nuevo ciclo legítimo; la cuenta elegible para transferencia debe identificarse por una relación de continuidad verificable, no por `customer_id` global ni igualdad de `session_id` de mesas.
- Eliminar la migración provisional de bloqueo **de la propuesta final** cuando la nueva función atómica haya sido validada. No eliminar ahora la protección sin alternativa, porque reabriría el riesgo de división económica.

## Matriz de integración que debe cerrarse en el mismo hito
| Área | Invariante | Prueba requerida |
|---|---|---|
| QR/visita | Escaneo no vincula; primer pedido sí | PG17 + E2E |
| Solicitud | 90 s de reloj servidor; sin destino | PG17 + carrera |
| Aprobación | No traslada; un uso; sin caducidad adicional | PG17 + E2E |
| Confirmación | Traslado y pedido atómicos; mismo account_id | PG17 transacciones paralelas |
| Idempotencia | Reintento devuelve cuenta/ronda original | PG17 |
| Historial | Pedido anterior mantiene mesa origen | PG17 + API |
| Pago | Saldo, Stripe, pagos parciales intactos | PG17 + API |
| Cocina/sala | Sin re-despacho; solo destino pendiente cambia | PG17 + E2E |
| SSE | Aislamiento por titularidad, cuenta y destino | E2E |
| Seguridad | RLS, owner, grants, allowlists, preflight | PG17 roles reales |
| Ciclo de vida | Cierre/revocación invalida permiso | PG17 + E2E |
| Compatibilidad | No rompe pedidos sin traslado | regresión completa |

## Criterio de cierre
Ninguna prueba estructural o mock sustituye PostgreSQL 17 real. Exigir ejecución reproducible, resultados y CI verdes, revisión independiente y trazabilidad normativa. **Sin merges, despliegues ni Supabase operativo** hasta autorización expresa. VPS compartido y Fleetia completamente fuera de alcance.
