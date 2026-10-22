# Sesión 5 — escritor de pedido candidato y frontera pendiente

Fecha: 22-10-2026. Solo rama `feat/sabora-pnpm-bootstrap`, PR #2 Draft.

## Cambios

- Migración `20261022120000_sabora_order_identity_compatibility_candidate.sql`: admite **dos modalidades mutuamente excluyentes** de identidad para pedidos históricos y candidatos. Preserva `orders.items` y el trigger de cocina; empresa y número de empleado históricos no se falsifican.
- `catalog-order-writer.mjs`: candidato desconectado. Exige alias e identificador de cliente en el contexto **confiable** (no procedentes del payload económico), además de visita/mesa/sesión autorizadas. Bloquea mesa para creación, calcula grupo de comanda, crea un pedido con `items` derivados de evidencia económica y llama al adaptador del ledger en la misma conexión. Propaga errores para que el gestor de transacciones revierta.
- `tests/catalog-order-writer.test.mjs` y `tests/order-identity-compatibility-candidate.test.mjs`: regresiones unitarias y estáticas; **no sustituyen PostgreSQL 17 real**.

## Puertas abiertas / bloqueos de seguridad

1. `catalog-visit-context-repository.mjs` aún no suministra alias/identificador confiables. El escritor **no debe conectarse** al coordinador hasta resolver esta atribución desde identidad autenticada y bloqueada, sin aceptar sustituciones de cliente.
2. El escritor acepta evidencia suministrada por su llamador privilegiado; la garantía de pertenencia, revisión y disponibilidad depende de la lectura de catálogo bloqueada y de la transacción completa. Falta integración y prueba de extremo a extremo.
3. La migración de identidad candidata todavía no ha sido acreditada con el smoke PostgreSQL 17; los tests estáticos no prueban DDL, trigger ni rollback.
4. La consulta SQL con CTE de actualización del inicio de ventana requiere pruebas reales PostgreSQL 17 para acreditar agrupación y carreras.
5. No existe autorización de rol SQL mínimo ni auditoría individual verificable; sin grants, sin rutas HTTP, sin publicación de eventos ni cobros.
6. El resultado de GitHub Actions debe comprobarse en el SHA final; no asumir CI verde.

No se ha tocado Supabase operativo, VPS, Fleetia, ni se ha realizado merge o despliegue.
