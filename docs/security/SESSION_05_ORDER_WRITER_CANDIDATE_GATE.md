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

## Pruebas de mutación del gate negativo (22-10-2026)

- `scripts/ci/catalog-confirmation-activation-gate-mutations.sh` ejecuta cinco alteraciones deliberadamente inseguras **solo en PostgreSQL 17 desechable**: `GRANT INSERT` sobre `orders`, `GRANT SELECT` sobre el ledger, desactivación de `FORCE RLS` en pedidos, eliminación de `CHECK` del alias y desactivación del trigger append-only del ledger.
- Cada mutación se introduce dentro de una transacción temporal; el gate debe **rechazarla por la causa esperada**. El cierre de la conexión revierte cualquier alteración. Al final se vuelve a ejecutar el gate limpio para demostrar que las mutaciones no persistieron.
- Integrado en `postgres-migration-smoke.sh`. Este control prueba que la barrera negativa detecta regresiones; **no** autoriza el rol futuro, ni sustituye la integración real Node–PostgreSQL y la auditoría individual.
- Comprobar GitHub Actions del último SHA antes de considerar validado este hito.

- Cobertura adicional de mutación: concesión `EXECUTE` de la RPC legacy `confirm_order` al rol `authenticated` y creación de una política RLS permisiva de lectura en `catalog_displayed_quotes`. Ambas deben producir rechazo específico del gate. Total: siete mutaciones aisladas.

## Replay y conflicto de idempotencia con pool inyectado

- La prueba `catalog-order-confirmation-pool-candidate.test.mjs` ahora reutiliza el ledger simulado entre dos transacciones: una segunda confirmación idéntica devuelve `replayed` sin duplicar pedido ni ledger; la misma clave con cantidad diferente debe abortar con `order_idempotency_conflict` y `ROLLBACK`.
- El alcance es **pool simulado en Node**, no integración Node–PostgreSQL real. La serialización de sesiones y la unicidad SQL continúan probándose separadamente en PG17 aislado. No se concede acceso ni se habilita endpoint.

## Replay con visita revocada

- La regresión de pool inyectado confirma que una solicitud previamente confirmada **no** puede reutilizar su clave idempotente tras revocar la visita: `lockContext` se evalúa antes de `lookupIdempotency`, la segunda transacción revierte y no crea otro pedido ni ledger.
- Esta prueba comprueba el orden del coordinador con respuestas simuladas; la garantía de carrera real con cierre de mesa sigue dependiendo de los bloqueos PostgreSQL 17 y del futuro test Node–PG real. No activa permisos.

## Nuevos casos negativos del candidato con pool inyectado

- El test de composición con pool simulado incorpora rotación de QR (rechazo **antes** de consultar el ledger de idempotencia), cotización vencida y catálogo agotado. Todos deben producir `ROLLBACK`, liberar la conexión y no insertar ni pedido ni intento de confirmación.
- Se conserva el caso de visita revocada **después** de una confirmación exitosa: el replay se rechaza por contexto no autorizado antes de consultar la clave previa.
- Estas pruebas ejercitan las decisiones de Node mediante respuestas simuladas; no son un sustituto de pruebas de SQL real de QR, expiración y stock. La activación sigue bloqueada por la integración Node–PostgreSQL 17, el rol mínimo y la auditoría individual.

## Frontera de entrada sin checkout (22-10-2026)

- Nuevas regresiones del candidato con pool inyectado comprueban que campos económicos o de identidad ajenos al contrato (`priceCents`, `economicEvidence`, `publishedRevision`, `customerAlias`, `customerIdentifier`, `company`, `sessionId`) se rechazan **antes de adquirir conexión**.
- También se rechazan getters de entrada, estructuras cíclicas y tokens de aceptación de tipo o tamaño incorrectos sin iniciar transacción. Los tests exigen cero llamadas a `pool.connect()`.
- La validación temprana limita la superficie de ataque y el uso de conexiones; no acredita aún autenticación de red, rol SQL mínimo ni integración Node–PostgreSQL real.

## Lectura estricta de evidencia numérica persistida

- Se endureció `catalog-confirmation-read-repository.mjs` para aceptar revisiones e importes de PostgreSQL solo como enteros seguros de JavaScript o cadenas decimales canónicas no negativas. Se rechazan `null`, vacío, blancos, exponentes, signo explícito, ceros iniciales, fracciones y enteros fuera del rango seguro.
- Motivo: `Number(null)`, `Number('')` y `Number('  ')` producen cero y podrían convertir un dato corrupto en una evidencia económica aparentemente válida.
- Se añadieron regresiones de cada campo de cotización y de la revisión del catálogo. El lector falla cerrado sin conceder permisos nuevos ni activar rutas.

## Integridad estructural del ledger económico (22-10-2026)

- El validador `safeJson` del adaptador de confirmación rechaza ahora arrays dispersos, getters, propiedades ocultas/no enumerables, símbolos, ciclos y claves peligrosas, antes de `JSON.stringify` y de cualquier sentencia SQL.
- Se evita que `Array.prototype.every` omita huecos o que la serialización invoque getters y transforme silenciosamente la evidencia comprobada.
- Pruebas negativas exigen cero escrituras SQL en estos escenarios. Esta defensa del adaptador no sustituye el origen confiable del catálogo, la autenticación ni la futura integración Node–PG17.

## Carrera inversa de cierre de mesa en PostgreSQL 17 aislado

- Se añadió `catalog-order-writer-close-first-concurrency-smoke.sh` y se conectó al smoke de migraciones. En dos sesiones SQL reales, el camarero cierra primero la mesa y mantiene el bloqueo; la consulta candidata `FOR UPDATE` debe esperar y, tras el commit del cierre, devolver **cero mesas abiertas**.
- Complementa la prueba previa de la carrera inversa (pedido obtiene el bloqueo antes que el cierre). La ejecución está confinada al contenedor PostgreSQL 17 desechable con `--network none`; no se concede permiso runtime ni se activa el escritor.
- El gate Node–PostgreSQL real, rol de escritura mínimo y auditoría independiente siguen pendientes.

## Tercera carrera real: cierre revocado por ROLLBACK

- La suite de PostgreSQL 17 desechable incluye `catalog-order-writer-close-rollback-concurrency-smoke.sh`. Dos sesiones independientes: el camarero obtiene el bloqueo al cerrar, la confirmación candidata espera, y la transacción del camarero ejecuta `ROLLBACK`. La confirmación debe recuperar el bloqueo y observar la mesa **abierta**, sin conservar un cierre abortado.
- Complementa las dos carreras de `COMMIT` ya probadas: pedido primero/cierre después y cierre primero/pedido después. Todas usan fixtures de mesa y personal separados, sin conexiones a Supabase ni VPS.
- Sigue sin acreditarse el coordinador Node completo contra PostgreSQL con rol mínimo; el PR permanece Draft y no se habilitan rutas de escritura.

## Respuesta del bloqueo de idempotencia

- La consulta `pg_advisory_xact_lock` debe completar sin error y devolver un objeto de respuesta con `rows` array; si el adaptador devuelve `null` o una respuesta malformada se aborta la transacción antes de leer el ledger.
- No se infiere la posesión del bloqueo de una cantidad fija de filas: PostgreSQL expone un resultado de función `void`, y el contrato de prueba puede usar arrays vacíos. La serialización efectiva sigue acreditada por la carrera de sesiones PostgreSQL 17.

## Regresión explícita del bloqueo advisory

- `tests/catalog-confirmation-read-repository.test.mjs` cubre respuestas `null`, `undefined`, sin `rows`, `rows:null` y `rows` no array. Ninguna debe alcanzar el `SELECT` de confirmaciones.
- Un error SQL del bloqueo se propaga sin ejecutar el lector del ledger. Una respuesta PostgreSQL válida con fila de función `void` permite continuar.
- Las pruebas son unitarias con consulta inyectada; la prueba separada de dos sesiones PG17 acredita la espera real. Ninguna activa permisos ni endpoints.

## Ampliación de mutaciones del gate negativo

- Se añadieron cinco regresiones SQL desechables: `UPDATE` sobre `orders` para rol lector, `DELETE` sobre cotizaciones para `authenticated`, retirada de `FORCE RLS` en confirmaciones, desactivación del trigger anti-`TRUNCATE` de cotizaciones y eliminación de unicidad de idempotencia.
- Cada mutación se aplica solo en una conexión transaccional del PostgreSQL 17 de CI, debe provocar un rechazo con mensaje esperado y se revierte al terminar la conexión. Se vuelve a ejecutar el gate sobre el esquema original.
- Ninguna mutación es una migración operativa ni concede permisos persistentes.

## Verificación de la fila bloqueada de ocupación

- El escritor candidato comprueba que la fila `dining_tables FOR UPDATE` incluya `grouping_window_seconds` como entero seguro estrictamente positivo y `first_confirmed_at` como `null` o fecha JavaScript válida devuelta por el driver PostgreSQL.
- Se rechazan estados malformados antes de cualquier `INSERT` de pedido o ledger. Pruebas negativas incluyen ventana nula, texto, cero, negativa o fraccionaria y fecha textual o inválida. Prueba positiva confirma la propagación de la fecha PostgreSQL al cálculo de agrupación.
- No se alteran contratos de duración de ventana ni se concede acceso runtime. La verificación es una defensa adicional sobre las restricciones SQL.

## Consistencia del grupo devuelto por el INSERT

- El escritor exige que el resultado del `INSERT ... RETURNING` contenga `grouping` en `first/grouped/late`. Si la mesa bloqueada no tenía `first_confirmed_at`, solo acepta `first`; si ya tenía fecha, rechaza `first`.
- El rechazo ocurre antes de insertar la confirmación económica; el gestor de transacciones del candidato revierte el pedido si la respuesta SQL es incoherente. Pruebas con adaptador inyectado cubren agrupaciones desconocidas y combinaciones imposibles.
- No se interpreta esta validación como acreditación de permisos SQL runtime ni de integración real Node–PostgreSQL.

## Puerta de atributos y pertenencia del escritor SQL dormido

- `scripts/ci/catalog-confirmation-activation-gate.sql` verifica explícitamente que `sabora_admin_writer` continúe sin `LOGIN`, `INHERIT`, `BYPASSRLS`, `SUPERUSER`, `CREATEROLE`, `CREATEDB` ni `REPLICATION`. No admite membresías SQL entrantes ni salientes.
- `scripts/ci/catalog-confirmation-activation-gate-mutations.sh` añade cinco mutaciones de prueba aisladas: activar `INHERIT`, `LOGIN`, `BYPASSRLS` o establecer membresía en cualquiera de las dos direcciones con el lector. Cada mutación debe provocar rechazo de la puerta y revertirse al cerrar la conexión de CI.
- Es una barrera preventiva adicional, no una concesión de privilegios ni autorización de despliegue.

## Ampliación de mutaciones de privilegios administrativos

- Cuatro pruebas adicionales fuerzan temporalmente `SUPERUSER`, `CREATEROLE`, `CREATEDB` y `REPLICATION` sobre el escritor dormido; la puerta debe rechazar cada atributo. Total de mutaciones nuevas de atributos y membresías en este bloque: nueve.
- Se usa exclusivamente el contenedor PostgreSQL 17 desechable de CI. Cada alteración se ejecuta en una transacción descartada tras el rechazo; se repite la puerta sobre el estado restaurado.

## Corrección de la prueba SUPERUSER

- La mutación `SUPERUSER` fue correctamente rechazada por la primera barrera de privilegios efectivos (`candidate order/ledger privilege leaked`), antes de alcanzar la barrera de atributos. El fallo de CI era una expectativa incorrecta del texto de error, no una aceptación del privilegio.
- La regresión ahora exige ese rechazo temprano; las demás mutaciones conservan sus expectativas específicas. Se requiere nuevo CI verde para acreditar el conjunto.

## Acreditación de escritura del primer instante de ocupación

- El SQL candidato devuelve `first_timestamp_written` desde el CTE `updated`, además de `id` y `grouping`. Para el primer pedido debe ser `true`; para `grouped` o `late` debe ser `false`.
- Se aborta antes del ledger si el `INSERT` de primer pedido no actualizó realmente `dining_tables.first_confirmed_at`, o si se notifica una actualización contradictoria para un pedido posterior. La transacción externa debe revertir también el pedido ante el rechazo.
- Se actualizaron el harness de confirmación completo y las pruebas unitarias de escritor. Esta prueba de adaptador no sustituye la acreditación real Node–PostgreSQL 17.

## Comprobación real PostgreSQL 17 del indicador de primera confirmación

- `scripts/ci/catalog-order-writer-sql-smoke.sql` ahora devuelve el mismo indicador `(updated.id IS NOT NULL)` que el escritor Node y comprueba en PostgreSQL 17 aislado: `first=true`, `grouped=false` y `late=false`.
- La prueba conserva la verificación de proyección de cocina, agrupación y reversión transaccional. No habilita acceso al escritor candidato ni cambia el esquema operativo.

## Endurecimiento del adaptador de transacciones PostgreSQL

- `apps/api/src/postgres-transaction.mjs` conserva la excepción SQL original si también falla `client.release()` al salir del bloque transaccional; el fallo de liberación queda adjunto como `releaseError` cuando el error original permite propiedades.
- Si el `COMMIT` se completó pero falla `release()`, el adaptador devuelve un error, nunca un éxito silencioso. El llamador no debe reintentar a ciegas una confirmación cuyo estado de commit es incierto; debe utilizar idempotencia.
- Cuatro pruebas nuevas cubren fallos simultáneos de consulta/liberación, `BEGIN`/liberación, `COMMIT`/liberación y liberación posterior a `COMMIT` exitoso. No se crea pool ni se habilita el escritor.

- Regresión adicional: errores originales `Error` congelados se conservan aunque fallen tanto `ROLLBACK` como `release()`. No se intenta sobrescribir propiedades no escribibles. El cliente se descarta con la causa del fallo de reversión.

## Cobertura negativa del coordinador completo: fallos parciales

- `tests/catalog-order-confirmation-candidate.test.mjs` añade seis respuestas de ledger corruptas o contradictorias y nueve respuestas de ocupación/creación de pedido incorrectas. El coordinador debe producir `ROLLBACK` sin comunicar confirmación exitosa.
- Una ocupación malformada impide el `INSERT` de pedido; una respuesta incorrecta del `INSERT` impide el ledger; una respuesta de ledger incorrecta revierte el flujo completo.
- Esta cobertura valida el contrato de coordinación mediante consulta inyectada. No prueba todavía atomicidad física del driver Node contra PostgreSQL 17 ni autoriza conectar HTTP o privilegios runtime.

## Verificación reforzada de persistencia temporal en PostgreSQL 17

- `scripts/ci/catalog-order-writer-sql-smoke.sql` calcula ahora la agrupación del primer pedido con `CASE` sobre la ocupación persistida, en vez de fijar artificialmente el literal `first`.
- Se verifica que `first_confirmed_at` coincide exactamente con `orders.confirmed_at` del primer pedido y que un segundo pedido `grouped` no modifica ese instante.
- Tras simular el vencimiento de la ventana, se verifica que un pedido `late` no reinicia la ventana y conserva el instante vencido.
- Estas aserciones usan SQL real sobre el PostgreSQL 17 aislado de CI. La prueba sigue siendo SQL separada, no la integración del coordinador Node mediante driver PostgreSQL.

## Atomicidad de proyección de cocina y rechazo de claves repetidas en PostgreSQL 17

- `scripts/ci/catalog-confirmation-atomicity-smoke.sql` verifica ahora que `order_lines` desaparece junto con `orders` y el ledger tras revertir la confirmación, y que la confirmación válida produce exactamente una línea de cocina.
- Se añade una transacción de prueba que inserta un segundo pedido y su línea de cocina, intenta reutilizar el mismo alcance y `request_key`, y exige rechazo por la restricción `catalog_confirmation_idempotency`. El subbloque revertido no debe alterar el pedido/ledger originales ni dejar pedidos o líneas de cocina adicionales.
- Esto demuestra comportamiento de restricciones, disparadores y rollback sobre PostgreSQL 17 desechable; no reemplaza una integración Node/driver real ni activa permisos o endpoints.

## Reintento de idempotencia tras aborto concurrente

- `scripts/ci/catalog-confirmation-idempotency-concurrency-smoke.sh` cubre ahora dos resultados de la primera transacción en PostgreSQL 17 desechable: `COMMIT` y `ROLLBACK`.
- En ambos casos, una segunda sesión con idéntico alcance de idempotencia debe observar contención real sobre `pg_advisory_xact_lock` y poder adquirir el bloqueo tras finalizar la primera. El caso `ROLLBACK` acredita que un intento abortado no deja un claim persistente que bloquee el reintento.
- No implica que se haya activado un endpoint ni que el coordinador Node se haya ejecutado todavía contra el driver PostgreSQL real.

## Cardinalidad del bloqueo de idempotencia

- El lector candidato rechaza respuestas de `pg_advisory_xact_lock` con más de una fila antes de consultar el ledger; se añadió prueba negativa.
- La interfaz de consultas inyectadas continúa aceptando `rows: []` en los dobles de prueba que no materializan la fila void. Esta validación no equivale a certificar el driver PostgreSQL real.

## Conservación de fallos arbitrarios del callback transaccional

- `apps/api/src/postgres-transaction.mjs` registra separadamente la presencia de un fallo del callback, incluso cuando el valor lanzado es `null`, `undefined`, `false`, `0` o una cadena vacía.
- Un fallo posterior de `client.release()` no debe reemplazar ese valor original. La regresión cubre los cinco casos, con `ROLLBACK` y sin `COMMIT`.
- Esta defensa no sustituye la prueba pendiente con un driver PostgreSQL real ni activa el candidato.

## Decodificación económica sin coerción de objetos

- `apps/api/src/catalog-confirmation-read-repository.mjs` comprueba el tipo y representación decimal de `published_revision` y los importes antes de invocar `Number()`. Así, un adaptador de datos defectuoso no puede provocar la ejecución de `valueOf`/`toString` de un objeto recibido como valor numérico.
- La regresión prueba símbolos, objetos con coerción hostil, arrays y booleanos para la revisión y los tres importes. Exige rechazo determinista y cero invocaciones de los métodos de coerción.
- Se mantiene el rechazo fail-closed de datos económicos malformados; el candidato no está conectado a HTTP, pool operativo ni Supabase de producción.

## Límite de tipo para la ventana de agrupación

- El escritor candidato comprueba que `grouping_window_seconds` leído bajo `FOR UPDATE` está dentro del rango positivo `int4` de PostgreSQL (máximo 2.147.483.647), antes de enviar el valor al parámetro `$10::integer` de `make_interval`.
- Pruebas negativas incluyen `2147483648` y `Number.MAX_SAFE_INTEGER`; ninguna debe llegar a insertar pedidos ni ledger.
- La validación es defensiva ante respuestas de adaptador malformadas; no modifica la ventana de negocio configurada ni sus restricciones SQL.

## Presupuesto global de entrada previo a transacción

- `snapshotInput` del coordinador limita ahora el recorrido completo de una confirmación a **4096 nodos** y **65536 bytes UTF-8** acumulados de claves y valores de texto, además de los límites ya existentes de profundidad, cardinalidad por objeto y huella canónica de 16384 bytes.
- El presupuesto global impide que una estructura ramificada de muchos arrays u objetos pequeños eluda los límites por nivel y consuma memoria/CPU antes de abrir una transacción. La contabilidad UTF-8 evita confundir caracteres con bytes.
- Pruebas negativas con más de 4096 nodos y texto multibyte sobredimensionado comprueban rechazo `invalid_confirmation_input` sin `BEGIN` ni consultas. Se conserva una prueba positiva de confirmación ordinaria.
- No se conecta el candidato a HTTP ni se modifica el rol de escritura.

## Respuestas SQL malformadas: distinguir ausencia de corrupción

- El lector transaccional solo interpreta `rows: []` como ausencia de catálogo, cotización o confirmación previa. Si el driver devuelve una fila presente pero `null`, `undefined`, primitiva o array, rechaza con `invalid_catalog_repository_response`.
- El caso es especialmente relevante para la idempotencia: una fila malformada no debe confundirse con ausencia de confirmación previa y provocar un segundo intento de escritura.
- Regresiones cubren los tres lectores y garantizan que el rechazo se produce antes de cualquier operación de persistencia. No se habilitan conexiones, permisos, endpoints ni despliegues.

## Contrato de replay validado extremo a extremo

- El coordinador ya no devuelve `replayed` únicamente por igualdad de huella. Exige también que `result` sea un objeto simple y que `result.orderId` sea un UUID válido. Un resultado corrupto aborta la transacción con `order_idempotency_conflict` sin consultar catálogo ni persistir.
- El lector PostgreSQL ya verificaba `order_id` antes de construir el resultado; esta defensa adicional evita confiar ciegamente en adaptadores de repositorio alternativos o defectuosos.
- Se actualizó la prueba positiva para usar un UUID real y se añadieron regresiones negativas de resultados de replay malformados.
- Sin activación de HTTP, permisos, pool operativo, merge ni despliegue.

## Integridad de IDs de extremo a extremo

- El coordinador candidato exige UUID válido en tres fronteras de persistencia: `previous.quoteId` obtenido del ledger confiable, `result.orderId` del escritor y `replay.result.orderId` de una confirmación previa. La igualdad de huella por sí sola no basta para devolver éxito.
- Las pruebas unitarias sustituyen identificadores ficticios por UUIDs y comprueban rechazo con rollback ante IDs de cotización o pedido ausentes, malformados o de tipo inesperado.
- Esta validación de formato no sustituye FKs, unicidad, transacción real ni autenticación. La integración PostgreSQL 17 con driver Node real permanece pendiente; no hay endpoints nuevos, grants, merge o despliegue.

## Validación económica antes de escribir pedidos

- El escritor candidato ahora ejecuta `assertCatalogConfirmationAttempt({...args,orderId})` **antes del bloqueo de mesa y del INSERT de pedido**. Se reutiliza exactamente el validador del ledger, que recalcula precios, extras y descuentos y verifica consentimiento, huella y alcance.
- El ledger repite la validación en su propia inserción: defensa en profundidad dentro de la misma transacción.
- Las regresiones negativas exigen **cero consultas SQL** ante importes manipulados, extras inconsistentes, huella/clave inválidas o consentimiento contradictorio. Antes, estos fallos se detectaban después de insertar el pedido candidato y dependían exclusivamente del rollback.
- El nuevo gate reduce escrituras innecesarias pero **no reemplaza el rollback obligatorio** si un fallo posterior ocurre. Sin conexión a HTTP, roles operativos, Supabase o VPS.

## Presupuesto de recursos también en el ledger autónomo

- El validador `safeJson` del escritor económico independiente incorpora un presupuesto global de **4096 nodos** y **65536 bytes UTF-8** sumando nombres de propiedades y valores de texto. Los límites anteriores por profundidad, cardinalidad, prototipos, ciclos, getters y arrays dispersos permanecen.
- No se confía únicamente en el `snapshotInput` del coordinador: una invocación directa del adaptador de ledger con estructura ramificada o texto multibyte excesivo también falla antes de ejecutar SQL.
- Se añadieron pruebas negativas de ramificación y textos grandes, más un caso positivo pequeño. El bloque continúa desconectado de HTTP y producción.

## Esquema económico cerrado en la frontera de persistencia

- El adaptador privado de confirmación exige ahora el conjunto **exacto** de quince propiedades de evidencia producidas por `buildCatalogLineEvidence`; cada extra seleccionado exige exactamente `id`, `name`, `priceCents` y `allergens`.
- El descuento admite únicamente `null`, `{type:'fixed',amountCents}` o `{type:'percent',basisPoints}`. Cualquier atributo adicional, incluso si no altera la aritmética, provoca `invalid_catalog_confirmation_attempt` antes de SQL.
- Regresiones negativas cubren metadatos de precio o confianza introducidos por cliente, campos ocultos de extras y descuentos con propiedades mezcladas. La regresión positiva comprueba un descuento porcentual válido.
- Esto complementa el presupuesto de recursos, el recálculo de precios y los bloqueos transaccionales; **no demuestra por sí solo** que la selección provenga del catálogo publicado. El candidato sigue sin grants, HTTP, pool operativo ni despliegue.

## Protección de fronteras de argumentos confiables (22-10-2026)

- El escritor de pedidos y el escritor económico independiente validan **antes de leer propiedades** que los objetos de argumentos y contexto son registros simples, sin propiedades accessor, símbolos, claves especiales de prototipo ni un número excesivo de propiedades. Esta puerta complementa el validador JSON de evidencia y evita invocar getters maliciosos en `context`, `requestKey` o `requestFingerprint`.
- Se añadieron regresiones negativas que cuentan invocaciones a getters y consultas SQL: ambas deben permanecer en **cero** ante los contextos y argumentos malformados. Se comprueban también prototipos heredados y claves propias peligrosas.
- Se conserva la compatibilidad con registros de prototipo nulo, si sus propiedades son datos enumerables válidos. No se atribuye a esta validación la defensa contra proxies JavaScript arbitrarios: el coordinador sigue siendo la frontera primaria para datos de cliente y el candidato continúa desconectado.
- La integración del coordinador Node con un driver PostgreSQL real, la acreditación de rol mínimo y RLS, y la activación HTTP continúan pendientes. No se ha autorizado merge ni despliegue.
