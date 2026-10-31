# Sabora — B0: dependencias verificadas para el traslado atómico A→B

**Estado:** inventario técnico de implementación, **NO-GO**. No es fuente normativa ni habilita el traslado. Fuente normativa: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, «Cambio de mesa con consumición activa — decisión funcional 2026-10-30». Plan subordinado: `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`. Rama candidata: `integration/sabora-h6-b2-delivery-board-contract-20261031`.

## 1. Dependencias concretas comprobadas en GitHub

| Identidad / estado | Fuente implementada | Invariante para F12 |
| --- | --- | --- |
| Sesión autenticada | `customer_sessions`, `confirm_customer_round_h6_candidate` | La sesión no revocada resuelve el mismo `customer_id`; bloqueo de sesión y advisory lock por cliente antes de escrituras |
| Visita QR destino | `customer_table_visits`, `dining_tables`, `persist_customer_order_candidate` | Mesa B operativa, sesión/visita/versión QR actuales; nunca reutilizar ocupación antigua |
| Cuenta económica | `customer_accounts` y `customer_account_operational_bindings` (migración `20261030160000`) | `account_id` original inmutable; `customer_accounts.table_id/session_id/visit_key` siguen históricos; actualizar solo binding operativo y versión |
| Solicitud/concesión | `customer_table_change_requests` (`20261030124000`) y RPC de solicitud/decisión (`20261030190000`) | Aprobación sin destino; consumir una sola concesión, `consumed_order_id` único, cuenta/cliente/origen coherentes |
| Confirmación H6 | `confirm_customer_round_h6_candidate` (`20261030230000`) | Hoy devuelve `table_change_transfer_not_integrated` antes de persistir si existe cuenta abierta en otra mesa; debe transformarse en única operación atómica, no en segundo pedido/cuenta |
| Persistencia de pedido | `persist_customer_order_candidate`, `orders`, `order_lines` | Pedido nuevo histórico de B; pedidos anteriores conservan origen A, sin reasignación de su `order_id` |
| Rondas y pagos | `order_rounds`, `payment_attempts`, `order_round_delivery_destinations` | Nueva ronda del **mismo** `account_id`; no modificar autorizaciones, cobros, saldos ni rondas anteriores |
| Destino de cada plato | `order_line_delivery_destinations` (`20261030220000`), FK compuesta `order_lines(order_id,id)` y `order_rounds(id,account_id)` | Redirigir exclusivamente líneas pendientes, nunca recogidas; incremento de `destination_version` dentro de la transacción |
| Cocina y sala | `20261031080000` / `20261031090000` (lector H6/B2), `manage_pickup_task_h6_candidate` | Lectura y reclamación coherentes con B; no usar transición heredada `picked_up` |
| Avisos durables | `event_outbox`, `20261031100000` | Nuevos eventos de recogida en B, con versión, audiencia y replay SSE sin duplicados |
| API y PWA | `customer-production-flow.mjs`, `customer-production-composition.mjs`, `customer-flow-transport.ts`, `table-change-service.mjs` | Las rutas y los roles de producción deben llamar solo RPC autorizadas y la PWA seguir el flujo visual aprobado |

## 2. Fallos abiertos observables

1. **F12 no está implementado:** la función H6 de confirmación bloquea explícitamente cuenta abierta en otra mesa con `table_change_transfer_not_integrated`. El `applyTransfer` del adaptador JS también falla cerrado. Ningún test de traslado por actualización manual de destino demuestra F12.
2. **La recogida aún depende de la visita A:** `manage_pickup_task_h6_candidate` verifica la visita histórica `orders.table_id/session_id`. La prueba de revocación de A obtiene 403 sin mutaciones, pero todavía no permite operar legítimamente en B tras el traslado.
3. **Riesgo de doble cuenta:** `confirm_customer_round_h6_candidate` hace `INSERT INTO customer_accounts(table_id,session_id,visit_key,customer_id)` con clave de mesa. Sin refactor de origen, una confirmación en B crearía otra cuenta y podría separar rondas/pagos.
4. **Riesgo de contaminación por mesa reocupada:** las consultas deben validar la versión de QR y sesión actual en B; un `table_id` sin `session_id` y `visit_key` no autoriza recoger ni recibir eventos.
5. **Sin aceptación visual F01–F28/R01–R10:** los fixtures SQL que cambian `order_line_delivery_destinations` directamente no sustituyen el flujo de solicitud, aprobación, QR, confirmación, cobro y sala.

## 3. Orden de transacción a implementar y demostrar, no dar por validado

La entrada debe ser la **confirmación H6 existente**, no un endpoint secundario de transferencia. El bloqueo de sesión de cliente y el advisory lock por `customer_id` ya están presentes. Se debe preservar un orden global compatible con solicitud/decisión: identidad de cliente → cuenta y binding → concesión → mesa/visita de destino y su QR → persistencia de pedido/ronda/pago → cambio de binding → redirección de líneas pendientes → consumo de concesión y auditoría/outbox → commit. Este orden es **hipótesis de diseño a verificar frente a locks reales de `persist_customer_order_candidate` y pagos**, no instrucción para escribir SQL sin comprobar posibles deadlocks.

La prueba de aceptación debe forzar rollback después de cada fase; repetir misma `request_key`; ejecutar dos confirmaciones simultáneas con la misma concesión; cerrar/revocar/reocupar A y B durante el intento; comprobar que el único `account_id` permanece, que no hay cobros duplicados y que la cocina y la sala no muestran destinos cruzados.

## 4. Puertas de salida antes de aceptar B2

- F12: autorización aprobada sin destino; primera confirmación válida en B consume una sola vez; segundo traslado a C sin concesión devuelve error sin efectos.
- F13 y revocaciones: QR B revocado, mesa B bloqueada, nueva sesión B, cuenta cerrada, concesión revocada y carrera de vencimiento: rechazo atómico y auditable.
- R01–R06: PG17 desechable con concurrencia real, FK/RLS/roles mínimos, idempotencia, saldos y outbox; ninguna sustitución por mocks.
- R07–R10: SSE con aislamiento y replay, API autenticada, PWA cliente/sala con Playwright/axe/capturas y regresión completa.
- Solo después, informe de cierre con SHA, workflow y dictamen GO/NO-GO. No merge ni despliegue sin autorización.

**Restricción:** sin cambios en Fleetia, VPS ni Supabase operativo. Este inventario no certifica la implementación.
