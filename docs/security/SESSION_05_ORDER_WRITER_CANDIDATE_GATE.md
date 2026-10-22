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

## Puerta SQL del escritor (bloque siguiente)

- Se añadió `scripts/ci/catalog-order-writer-sql-smoke.sql` al pipeline de migraciones PostgreSQL 17 aislado. Cubre la sentencia `WITH created ... updated` que materializa el primer pedido, actualiza `first_confirmed_at`, genera `order_lines` mediante trigger, clasifica un segundo pedido como `grouped` y revierte pedido/línea en un savepoint.
- Esta prueba **no es** aún una ejecución directa del módulo Node con PostgreSQL: SQL y JavaScript permanecen separados. Se requiere test de integración con un adaptador de transacciones y pruebas concurrentes antes de cualquier activación.
- Se normalizaron las continuaciones de shell de las pruebas SQL para evitar ambigüedad de escape.
- **Puertas aún cerradas:** privilegios mínimos y política RLS para un writer de servidor; autenticación de sesión; validación de visita/cierre concurrentes en PostgreSQL; integración HTTP; publicación en Supabase. No habilitar el flujo por un CI verde.

## Bloque adicional: carrera escritor frente a cierre y pedidos tardíos

- Nuevo `scripts/ci/catalog-order-writer-close-concurrency-smoke.sh`: dos sesiones independientes de PostgreSQL 17, la primera retiene `FOR UPDATE` sobre mesa abierta y la segunda intenta cierre mediante `transition_table_ordering_candidate`. El test exige espera real de bloqueo y verifica que la mesa queda cerrada. Se ejecuta en el contenedor desechable del pipeline.
- Ampliado `catalog-order-writer-sql-smoke.sql` con pedido posterior al vencimiento de la ventana, que debe clasificarse como `late` sin modificar `first_confirmed_at`. Se conserva cobertura de `first`, `grouped`, trigger de cocina y rollback.
- **Limitación:** la carrera de cierre ejercita el bloqueo SQL del escritor, pero todavía no ejecuta el módulo Node ni una confirmación real completa en la primera sesión. No confundir esta prueba con acreditación end-to-end.
- Las pruebas no conceden permisos de runtime y no tocan Supabase ni VPS. El PR continúa Draft y requiere acreditación CI del HEAD de este hito.

## Identidad estable bajo bloqueo (22-10-2026)

- El lector de visita ahora bloquea también la fila de `customer_profiles` con `FOR SHARE OF v,s,p`, mientras conserva `FOR UPDATE OF t`. Así la identidad atribuida al pedido no puede modificarse concurrentemente mediante una actualización del perfil durante la transacción de confirmación.
- Se valida que el alias autenticado tenga 1–80 caracteres Unicode, no sea vacío y no contenga caracteres de control; el identificador público debe respetar `SB-[2-9A-HJ-NP-Y]{12}`. Las pruebas unitarias incluyen rechazos explícitos.
- El bloqueo de perfil presupone que el flujo de edición del perfil usa UPDATE normal sobre la misma fila. La prueba de concurrencia entre edición de perfil y pedido real sigue pendiente, así como un adaptador Node conectado a PG17; este hito **no** autoriza endpoints ni roles de escritura.

## Puerta de concurrencia de edición de perfil (22-10-2026)

- Nuevo `scripts/ci/catalog-profile-confirmation-concurrency-smoke.sh` ejecutado desde `postgres-migration-smoke.sh` contra PostgreSQL 17 desechable y sin red. Una transacción bloquea `customer_profiles` con `FOR SHARE`; otra intenta editar `alias`. La prueba exige observar una espera de tipo `Lock`, después completar ambas transacciones y verificar que la edición termina.
- Esto acredita el conflicto de bloqueos PostgreSQL utilizado por `catalog-visit-context-repository.mjs`, pero **no** ejecuta aún el SELECT completo del módulo Node ni su transacción real. Se mantiene la puerta de integración Node/PG17 y los grants de runtime cerrados.
- No se toca Supabase operativo, ni VPS compartido, ni Fleetia. Requiere comprobar el estado final de CI del commit.

## Candidato Node con adaptador transaccional (22-10-2026)

- `createCatalogOrderConfirmationPoolCandidate` en `apps/api/src/catalog-order-confirmation-candidate.mjs` ensambla el flujo de confirmación con el adaptador ya existente `createPostgresTransaction({pool})`. Se inyecta el pool; **no se crea ni configura una conexión operativa**.
- `tests/catalog-order-confirmation-pool-candidate.test.mjs` verifica el límite de cliente único con doble de pool: `BEGIN` y `COMMIT` para confirmación; `BEGIN` y `ROLLBACK` ante fallo de ledger o visita revocada; liberación de cliente; pedido y ledger en el mismo contexto.
- El escritor valida ahora alias con el máximo de 80 caracteres Unicode del perfil, no 160. El quote del test se deriva del constructor económico canónico.
- **Aún no acreditado:** ejecución real de código Node sobre PostgreSQL 17 (sin dependencia `pg` en el paquete API), permisos mínimos del rol dedicado, RLS, integración HTTP y pruebas de carreras del flujo completo. La activación continúa bloqueada.

## Robustez de la transacción de confirmación (bloque posterior)

- Se agregaron pruebas del adaptador `createPostgresTransaction` integrado en el candidato para dos fallos de conexión: COMMIT incierto y ROLLBACK fallido. Ambos casos deben liberar el cliente con indicación de descarte, nunca reciclar una sesión transaccional incierta.
- Se añadieron los módulos del flujo candidato al `build` de `@sabora/api` mediante `node --check`. Se conservan tests de confirmación, rechazo de visita y fallo de ledger con pool simulado.
- No se introdujo dependencia `pg`, credenciales, pool operativo, ruta HTTP ni grants. El smoke de PostgreSQL 17 valida SQL y carreras de bloqueo por separado; la ejecución de todo el coordinador Node contra la instancia real sigue siendo una puerta pendiente.
- Los workflows de GitHub del HEAD deben verificarse tras este cambio. La activación continúa prohibida.

## Paridad de restricciones de identidad en PostgreSQL (22-10-2026)

- La migración candidata `20261022130000_sabora_order_identity_contract_alignment_candidate.sql` endurece los `CHECK` de `sabora.orders` para reflejar el perfil autenticado: alias no vacío de hasta 80 caracteres, sin controles, e identificador público `SB-[2-9A-HJ-NP-Y]{12}`. Las filas legacy conservan los campos nulos y no se reescriben.
- `catalog-order-identity-compatibility-smoke.sql` comprueba rechazos de alias de 81 caracteres, blancos y salto de línea, así como identificadores inválidos. Continúa verificando compatibilidad legacy, trigger de cocina y FORCE RLS.
- Es una migración **candidata en GitHub**; no se ha aplicado a Supabase operativo. Se requiere CI verde, revisión de compatibilidad y autorización explícita antes de cualquier migración de producción.

## Gate negativo reforzado de identidad de pedido

- `catalog-confirmation-activation-gate.sql` exige ahora que `sabora.orders` mantenga `FORCE ROW LEVEL SECURITY` y que sigan presentes y validadas las cinco restricciones de identidad/visita/evidencia económica candidatas. Si una migración posterior las elimina o deja sin validar, el pipeline de PostgreSQL 17 debe fallar.
- Pruebas del escritor amplían rechazo de alias con controles, longitud mayor de 80 o solo espacios; también verifican que se persiste el alias confiable normalizado y la proyección de cocina deriva exclusivamente de evidencia.
- Este gate comprueba existencia y estado de las restricciones, no demuestra permisos operativos, seguridad de conexión Node/PG real ni validez de políticas RLS para un rol dedicado. Mantener activación bloqueada.

## Extensión de denegación de grants sobre pedidos (22-10-2026)

- La puerta `catalog-confirmation-activation-gate.sql` comprueba ahora también `sabora.orders` frente a los roles `anon`, `authenticated`, `sabora_admin_writer`, `sabora_catalog_reader` y `sabora_staff_reader`. Rechaza cualquier permiso de tabla de lectura/escritura, truncado, referencias o triggers, además de los ledgers económicos.
- Esto evita que el puente de identidad del pedido se vuelva escribible por un rol existente de forma accidental. Es un gate **negativo**: no crea el futuro rol del backend ni concede acceso.
- El flujo Node completo sobre PG17 y el modelo de auditoría del actor permanecen pendientes. CI del nuevo HEAD debe comprobarse antes de considerar acreditado el cambio.

## Robustez del checkout del pool transaccional (22-10-2026)

- Se detectó una vía de fuga de cliente en `createPostgresTransaction`: si `pool.connect()` devolvía un objeto con `release` pero sin `query`, el adaptador lanzaba `invalid_transaction_client` sin liberar el checkout. Ahora intenta `release(Error('invalid_transaction_client'))` antes de rechazarlo, descartando la sesión defectuosa. Si el propio `release` falla, se conserva el error de validación; no se ha emitido SQL.
- Nuevas regresiones en `tests/postgres-transaction.test.mjs`: cliente malformado liberable, `release` que falla y resultado nulo. Esta mejora solo prueba el límite del pool inyectado; no supone conexión real a PG17.
- Siguen pendientes driver PostgreSQL de Node en entorno aislado, autenticación y permisos mínimos verificables, auditoría individual, endpoints y autorización de activación. No hay cambios en Supabase operativo ni despliegues.
