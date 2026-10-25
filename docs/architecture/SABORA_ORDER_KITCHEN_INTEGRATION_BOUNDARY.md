# Contrato de integración pedido → operaciones de cocina (candidato)

Fecha: 2026-10-24. Estado: **verificación de frontera; integración entre ramas pendiente**.

## Fuente de verdad y ramas

- Contrato normativo: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`.
- Escritor transaccional en `feat/sabora-pnpm-bootstrap`: `apps/api/src/catalog-order-writer.mjs`, `catalog-confirmation-coordinator.mjs`, ledger de confirmaciones y trigger de proyección `orders → order_lines`.
- Cocina/camarero en PR [#4](https://github.com/jdlc86/CartaViva/pull/4), rama `codex/sabora-kitchen-waiter-operational`: `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md` y migración `20261023225024_sabora_kitchen_waiter_operations_candidate.sql`.
- **No fusionar ni activar PR #4 de forma implícita.** La composición de ambas ramas deberá ser validada en un SHA común cuando se autorice la integración.

## Frontera que se puede probar hoy

1. Una confirmación válida inserta una fila en `sabora.orders` y el trigger crea exactamente una `sabora.order_lines` por plato. El estado inicial de la línea es `confirmed`.
2. Confirmar **no** inserta `pickup_notifications` ni `order_line_events`, ni acredita que cocina haya recibido una comanda.
3. El reintento de la misma clave recupera el `order_id` durable; no inserta otra línea.
4. El intento duplicado que falla en el ledger revierte el pedido tentativo y su línea de cocina.
5. El smoke `scripts/ci/catalog-confirmation-kitchen-durability-smoke.sql` verifica las cuatro invariantes anteriores sobre PG17 desechable.

## Contrato independiente del PR #4

PR #4 declara solo las transiciones por línea `confirmed → preparing → ready → picked_up`, con actor y rol verificados por el servidor, correlación idempotente, evento durable y aviso de recogida. `ready` genera el aviso; `picked_up` lo acusa como **recogido por sala**, no como entregado al comensal. Esta cadena no implementa por sí sola el acuse de recepción de la **comanda/despacho** previsto por el contrato consolidado.

## Criterios de aceptación para integración posterior

- Integrar migraciones y API en un SHA común sin alterar las garantías del escritor; ejecutar `pnpm test`, build, PostgreSQL 17 desechable, carreras de cierre de mesa y doble confirmación.
- Confirmar que el identificador estable de pedido, las revisiones inmutables y el despacho tienen semántica diferenciada antes de exponer recepción por cocina.
- Verificar que el cliente nunca puede llamar a transiciones de personal; roles y sesión se validan en backend y en la transacción.
- Aprobar los logins SQL y grants de mínimos privilegios, RLS efectiva, bootstrap JWT, DTO de aceptación explícita de cambios de precio y transporte de eventos sin polling.
- No introducir `delivered`, cancelación o reembolso parcial sin contrato económico y autorización específica.

No se ha realizado merge, despliegue, ni modificación de Supabase operativo, Fleetia o VPS.

## DTO público candidato para consentimiento de cambio de precio

La ruta candidata `POST /api/v1/customer/orders/confirm` responde `409` con
`error: acceptance_required` y `repricing` de versión `schemaVersion: 1`.
Su lista cerrada de campos es `previousTotalCents`,
`currentTotalCents`, `differenceCents` (con signo),
`previousPublishedRevision`, `currentPublishedRevision`,
`acceptanceToken` y `expiresAt` (epoch milisegundos).

El token se emite en servidor después de bloquear visita, mesa y catálogo;
está firmado con HMAC y vincula actor, cesta, plato, selección, cantidad,
revisión y snapshot económico. Caduca a los cinco minutos por defecto.
El cliente debe **mostrar ambos importes y la diferencia y obtener una
aceptación humana explícita**, incluso si la diferencia es cero pero cambió
la revisión o si el precio disminuyó. Solo entonces puede repetir la misma
petición con `acceptanceToken`; no confirmar automáticamente.

La respuesta nunca incluye evidencia interna ni snapshot completo, no se
almacena en caché y no acredita recepción por cocina. La ruta sigue sin
montarse en `server.mjs`. El DTO es **candidato técnico**, no una
autorización para activar producción; el diseño y la UX de aceptación de
la PWA deben revisarse antes de integrar.

## Aceptación HTTP de cocina y sala en SHA de integración (25-10-2026)

`tests/order-operations-http-lifecycle-acceptance.test.mjs`
ejecuta las rutas reales Fastify de operaciones con un
repositorio de estados **simulado**, y recorre:
`confirmed → preparing → ready → picked_up`, visibilidad
de tablero por rol, aviso de recogida y su acuse,
historial, replay idempotente, conflictos de correlación
y rechazo de transiciones prohibidas para cocina y
camarero. Commit `9eb2605`: Sabora CI y Bootstrap SUCCESS.

**Límite de evidencia:** este recorrido prueba integración
HTTP/coordinador y contrato observable, pero no demuestra
la transacción SQL ni las restricciones PostgreSQL 17 de
la transición en esa misma prueba. Las pruebas PG17 del
escritor y de operaciones son evidencias complementarias;
no deben presentarse como aceptación integral
cliente → cocina → camarero en un mismo banco PG17.
El estado `picked_up` acredita recogida por sala, **no
entrega al comensal**. El acuse de recepción de comanda
y la activación de las dos PWA siguen pendientes.
Sin montaje operativo, merge ni despliegue.
