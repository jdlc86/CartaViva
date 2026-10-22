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

## Bloque posterior: atribución de identidad y serialización

- El lector de visitas obtiene ahora `customer_profiles.alias` y `customer_profiles.public_id` mediante JOIN por `customer_id`, manteniendo bloqueos de mesa/visita/sesión. No toma estos campos del navegador.
- El escritor separa la consulta `SELECT ... FOR UPDATE` de la inserción del pedido; actualiza `first_confirmed_at` dentro de un CTE explícitamente referenciado. La agrupación y el ledger usan la misma transacción del llamador.
- Se actualizaron fixtures de tests para el orden real de consultas y rechazo de errores de ledger.
- **Validación pendiente:** no se pudo clonar el repositorio en el shell local (resolución DNS de GitHub no disponible); no atribuir ejecución de tests locales. GitHub Actions del SHA final todavía no confirmado.
- **Bloqueador adicional:** el coordinador sigue exigiendo integración del writer con repositorio y autorización del runtime. Ningún endpoint o grant se ha habilitado. La compatibilidad de `public_id` con la identidad visible debe acreditarse con pruebas de contrato y PG17.

## Correcciones posteriores (22-10-2026)

- Se repararon secuencias de escape literales en `catalog-visit-context-repository.mjs` que impedían interpretar JavaScript. No atribuir éxito de pruebas previo a esta reparación.
- El lector de visita bloqueada proyecta `customer_profiles.alias` y `public_id` vinculados por la sesión de cliente. El test unitario exige ahora esa procedencia y el identificador `SB-[2-9A-HJ-NP-Y]{12}`.
- El escritor candidato rechaza identificadores no canónicos y caracteres de control en alias. Se actualizaron las pruebas correspondientes.
- El shell local no resuelve `github.com`; la ejecución local de tests del repositorio no está acreditada. Las consultas de workflow del último SHA no devolvieron runs; **CI pendiente**, no verde.
- El escritor continúa **sin conexión al coordinador operativo**, sin grants ni HTTP. Sigue pendiente smoke real PostgreSQL 17 para el SQL del escritor, agrupación y rollback.

## Corrección de orden de bloqueos y nueva puerta CI

- `catalog-visit-context-repository.mjs` adquiere `FOR UPDATE OF t` antes de `FOR SHARE OF v,s`, evitando que dos confirmaciones intenten elevar simultáneamente un bloqueo compartido de mesa. Sigue pendiente prueba concurrente PostgreSQL 17 de esta secuencia exacta.
- `scripts/ci/catalog-order-identity-compatibility-smoke.sql` prueba en transacción revertida la inserción legacy y candidata, el trigger de líneas de cocina y el rechazo de identidad mezclada.
- `postgres-migration-smoke.sh` ejecuta la nueva prueba después de migrar PostgreSQL 17 desechable. No se conecta a Supabase operativo.
- GitHub Actions detectó diez tests de composición con fixtures antiguos sin `customer_alias`/`customer_identifier`. Se corrigieron en los tests de confirmación, repositorio y cotización. La existencia de commits de corrección no implica CI verde; comprobar el HEAD más reciente.

## Integración offline de coordinador y escritor

- `apps/api/src/catalog-order-confirmation-candidate.mjs` ensambla el coordinador de confirmación, el repositorio de lectura y el escritor de pedido+ledger con una transacción suministrada por el llamador. **No** crea pool, ruta HTTP, rol ni concesión SQL.
- `tests/catalog-order-confirmation-candidate.test.mjs` verifica con dobles de consulta el flujo correcto, rechazo por visita revocada o catálogo agotado y propagación del error del ledger al límite transaccional.
- Estos tests prueban **orquestación**, no semántica PostgreSQL. Falta acreditar el SQL del escritor y carreras reales con PostgreSQL 17 desechable; el rollback real depende de `withTransaction` y debe probarse con el adaptador de producción antes de activar.
- La compatibilidad del perfil con el identificador público y los bloqueos se verificó en pruebas de módulo; aún no existe autorización para runtime, despliegue ni merge.
