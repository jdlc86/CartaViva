# Sesión 5 — auditoría de compatibilidad del escritor de pedidos (22-10-2026)

Estado: análisis de esquema **candidato**, no activación. Fuente normativa: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`; diseño económico: `docs/architecture/SABORA_ECONOMIC_PUBLICATION_IMPLEMENTATION_PLAN.md`; continuidad: `docs/continuity/SESSION_05_HANDOFF.md`.

## Hallazgos verificados en migraciones

1. `20261020140000_sabora_order_core.sql`: `sabora.orders` exige `company` y `employee_number` no nulos, además de `items` JSON (1–50), `table_id`, `session_id`, `confirmed_at`, `grouping` y `status`. El contrato actual permite empresa opcional e identidad persistente del comensal. No introducir datos corporativos ficticios.
2. `20261020150000_sabora_order_transaction.sql`: `sabora.confirm_order` acepta datos de identidad y `items` del llamador, sin cotización publicada ni ledger económico. Debe permanecer inaccesible al runtime; **no reutilizarlo** para la confirmación económica.
3. `20261020180000_sabora_order_lines_pickup.sql`: el trigger `sabora_order_lines_insert` deriva `order_lines` de `orders.items`, con categorías `drink/starter/main/dessert`, nombre y cantidad. Alterar `items` sin compatibilidad rompería cocina y recogida. `order_status_events` y `order_line_events` conservan FK al pedido.
4. `catalog-confirmation-attempt-writer.mjs` exige `orderId` confiable generado en la misma transacción y evidencia recalculada; solo inserta el ledger, no crea pedido.
5. `catalog-confirmation-repository.mjs` inyecta `persist`; no existe escritor completo activado ni autorización SQL acreditada.

## Orden de implementación exigido antes de activación

- Diseñar migración **aditiva** candidata de identidad/visita y snapshot económico; preservar columnas y trigger legacy hasta adaptar todos los lectores. Resolver compatibilidad de `company` y `employee_number` mediante migración explícita, nunca mediante cadenas inventadas.
- Crear pedido y revisión económica confiable con `orderId` generado por servidor y ledger de confirmación dentro de **una misma transacción**. El snapshot de cocina se deriva de la evidencia publicada bloqueada, no de `items` arbitrario.
- Mantener lock de mesa, visita, QR y publicación hasta commit; idempotencia por scope y fingerprint, aceptación de recotización verificada; no publicar despacho/eventos antes del commit.
- Añadir regresiones PostgreSQL 17 aisladas para trigger de líneas, FK, rollback conjunto, replay, cambio de precio, visita revocada, QR rotado y carrera con cierre de mesa.
- Resolver rol SQL mínimo NOINHERIT/NOBYPASSRLS, identidad auditada verificable y JWT antes de grants o HTTP. Conservar puertas negativas de activación.

## Límite de esta entrega

Documento de auditoría, **sin migración ni código de escritor**, sin nuevas concesiones, sin Supabase operativo, sin VPS, sin Fleetia, sin merge ni despliegue. Los resultados CI del SHA anterior no prueban un SHA nuevo.
