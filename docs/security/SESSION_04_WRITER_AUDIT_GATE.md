# Sesión 4 — puerta de seguridad del escritor y auditoría (22-10-2026)

## Evidencia comprobada
- PR #2 continúa Draft; HEAD inicial b61ce21b278079565620c90b37617ae67ceb9ce7.
- Sabora CI 39700503112 y Bootstrap 39700503103: SUCCESS para b61ce21b.
- Contrato normativo: docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md; continuidad: docs/continuity/SESSION_04_HANDOFF.md.

## Bloqueo técnico confirmado por inspección
- La función sabora.transition_table_ordering_candidate(uuid,uuid,text,timestamptz) recibe p_actor como argumento. El adaptador staff-table-transition-coordinator.mjs deriva ese argumento del verificador de sesión, pero no existe aún rol SQL operativo con frontera de identidad verificada en DB.
- El trigger capture_table_ordering_audit_candidate() registra actor_user_id NULL deliberadamente. No es lícito afirmar atribución personal completa.
- La función es SECURITY INVOKER y sus permisos EXECUTE están revocados a roles públicos y técnicos enumerados. Conceder EXECUTE directamente a un rol de navegador o un escritor general permitiría suplantar p_actor; no hacerlo.
- Las pruebas de carreras de bloqueo de mesa no prueban todavía confirmación económica completa.

## Requisitos de implementación para habilitar escritura
1. Un único límite backend autenticado valida JWT y membresía vigente; documentar algoritmo real de firma y rotación antes de conexión a Supabase Auth.
2. Rol login NOINHERIT/NOBYPASSRLS; permisos explícitos mínimos; ninguna capacidad SQL directa de suplantación de actor ni acceso a tablas ajenas. La validación debe ser vinculante dentro de la misma transacción y resistir revocaciones concurrentes.
3. El actor auditado debe derivarse de un contexto imposible de manipular desde el navegador; no confiar en p_actor ni en SET de variables SQL accesibles al cliente. Mantener auditoría append-only, FORCE RLS y pruebas de rechazo de UPDATE/DELETE/TRUNCATE.
4. Serializar mesa, visita, versión QR, publicación económica, idempotencia y escritura de pedido en una sola transacción; probar rollback y cierre concurrente con PostgreSQL 17 desechable.
5. Antes de activar rutas HTTP, acreditar pruebas negativas de grants, auditoría y concurrencia en CI para el SHA exacto.

## Estado
Este registro es un análisis de bloqueo, **no** una concesión de permisos, activación de rutas, implementación de escritor ni certificación de seguridad. No modifica Supabase operativo, VPS ni Fleetia. PR debe permanecer Draft; merge y despliegue prohibidos sin autorización expresa.

## Avance de frontera de entrada (22-10-2026)

Se endureció `apps/api/src/staff-table-transition-coordinator.mjs` para rechazar objetos con prototipos exóticos, campos símbolo, campos ocultos y getters/setters, antes de resolver la sesión o abrir una transacción. Se añadieron pruebas de entradas hostiles y una prueba positiva de actor obtenido de sesión verificada en `tests/staff-transition-input-boundary.test.mjs`.

Commits de implementación: `48a0709d73790481126b75994c50ae589cf683f0` y `3e7e862d056666d757a28de8a547b06453d50eaf`.

**Alcance limitado:** el cambio es protección del límite de entrada JavaScript; no demuestra protección frente a suplantación si se otorgaran permisos SQL directos. No se ha implementado aún el rol escritor operativo, la atribución SQL individual, ni el flujo transaccional completo de pedido. Comprobar CI del HEAD exacto antes de considerar validado el cambio.

## Gate automatizado de no activación (22-10-2026)

Nuevo `scripts/ci/staff-transition-activation-gate.sql` conectado a `scripts/ci/postgres-migration-smoke.sh`. Comprueba privilegios efectivos y ACL de PUBLIC para la función de transición y el ledger de auditoría; exige SECURITY INVOKER, RLS forzado y disparadores activos de captura, UPDATE/DELETE y TRUNCATE. Se ejecuta tras migraciones sobre PostgreSQL 17 aislado, sin tocar Supabase real.

Este gate **protege la situación actual cerrada**; no implementa el escritor operativo ni sustituye los futuros ensayos de identidad y concurrencia. Commits de desarrollo: `ae7e7b97`, `e9da5700`, `796cc7b7`, `400eab29`. Confirmar Sabora CI y Bootstrap del HEAD exacto antes de marcarlo como validado.

## Pruebas de transacción del personal (22-10-2026)

Se incorpora `tests/staff-transition-transaction-boundary.test.mjs` con un harness de transacción simulado que verifica: consulta de membresía activa bajo `FOR SHARE`, sujeto firmado utilizado en SQL parametrizado, rechazo de camarero suspendido y cocina, rechazo de registros de membresía contradictorios, no acceso a DB con bearer inválido, rollback ante error de escritura y rechazo de resultados SQL de cardinalidad incorrecta.

**Importante:** el harness verifica composición y orden lógico de las llamadas JavaScript, **no** reproduce bloqueos ni commit/rollback de PostgreSQL. Las pruebas de carreras reales existentes se mantienen separadas; siguen sin cubrir el pedido completo. No se han concedido permisos nuevos ni activado HTTP. Commit de pruebas: `9dd45c9ba92ec8c6458fdaba0c44546bdff09fcf`.

## Aislamiento de contexto de confirmación (22-10-2026)

El coordinador candidato `apps/api/src/catalog-confirmation-coordinator.mjs` comprueba ahora que el contexto autorizado bloqueado devuelto por el repositorio coincide exactamente con `tableId`, `visitId`, `actorId` y `basketId` de la solicitud, y exige un `sessionId` no vacío. El rechazo se produce **antes** de buscar replays idempotentes. Pruebas negativas en `tests/catalog-confirmation-coordinator.test.mjs`.

Commits: `91b927144c369b0fef3a920580051f40807fea0e` y `0e512fa69d8a9cad0c78b4950f2fc92899cbec44`. Es un endurecimiento del coordinador candidato: todavía falta conectar credenciales de cliente verificadas, escritor SQL mínimo, persistencia transaccional completa y auditoría atribuida. No autoriza activación de rutas.

## Canonización de entrada para confirmación candidata (22-10-2026)

El coordinador `catalog-confirmation-coordinator.mjs` ahora construye una copia de los datos no confiables antes de consultar repositorios o calcular huellas de idempotencia. La copia rechaza getters/setters, símbolos, propiedades no enumerables, prototipos exóticos, ciclos, arreglos dispersos, nombres peligrosos y profundidad excesiva. Pruebas negativas añadidas a `tests/catalog-confirmation-coordinator.test.mjs`.

Commits `d6edbb925890644768e43a2341f5f915ea73866f` y `1603d8c7cb366d45dc131c27c9b1e6e044c974c0`. Este control es solo defensa en profundidad del candidato y no demuestra por sí mismo una transacción SQL completa, ni autoriza rutas HTTP o permisos productivos.

## Límite de tamaño para confirmación candidata (22-10-2026)

El coordinador ahora rechaza huellas canónicas superiores a 16 KiB y tokens de aceptación superiores a 4096 caracteres, antes de invocar `withTransaction`. Se agregaron pruebas negativas de cargas sobredimensionadas y un caso positivo de confirmación ordinaria. Commits: `940393f63aca7f007c1be93aeb2064f1dcfffced` y `1f31265ef419f5fefdf3ed10e52795a119a71a5e`.

Esta defensa no sustituye límites de transporte HTTP, autorización de identidad, writer SQL ni confirmación transaccional completa; permanece como código candidato.

## Límite de vida de la transacción PostgreSQL (22-10-2026)

`apps/api/src/postgres-transaction.mjs` invalida el callback `query` una vez terminada la unidad de trabajo. Rechaza operaciones tardías después de commit o rollback. Además, si la unidad de trabajo devuelve el control con consultas pendientes sin esperar, impide el commit, espera su finalización antes de intentar rollback y descarta la conexión del pool. Nuevas regresiones en `tests/postgres-transaction.test.mjs`.

Commits: `405efae8`, `55eb23b9`, `7a061233`, `f4f3bcac`, `65fb3dca`. Esta protección del adaptador no concede acceso SQL, no verifica identidad por sí sola y no habilita confirmación de pedidos.

## Regresión de concurrencia del adaptador (22-10-2026)

La prueba de consultas desacopladas fue corregida para esperar explícitamente el inicio de la consulta antes de liberarla (`6193ddb6`), evitando depender de una única microtarea. Se añaden casos que rechazan una consulta retenida durante un COMMIT pendiente y que comprueban rollback tras error de consulta (`c5c3ceef`). Estos son tests de control de vida de la conexión, no pruebas de concurrencia de pedidos contra PostgreSQL real.

La aceptación depende de que los workflows del HEAD definitivo terminen SUCCESS; no basta con ejecuciones verdes de commits anteriores.

## Lectura de idempotencia candidata (22-10-2026)

`catalog-confirmation-read-repository.mjs` exige ahora una huella canónica no vacía y acotada (16 KiB) para consultar la idempotencia, además de rechazar huellas almacenadas malformadas. Las consultas siguen parametrizadas y acotadas por mesa, sesión, visita, cesta, actor y clave de solicitud. Las regresiones están en `tests/catalog-confirmation-read-repository.test.mjs` (commits `be9f0c24`, `388f52f3`, `b341d835`, `712acac0`).

No hay cambio de permisos, endpoint ni activación. La huella es una comparación de identidad de petición, no un mecanismo criptográfico de autorización.

## Credenciales de visita para confirmación candidata (22-10-2026)

Se ha corregido una divergencia entre `catalog-visit-context-repository.mjs` y `catalog-confirmation-coordinator.mjs`: la confirmación exige ahora `qrToken` y `customerSessionToken` y los remite a `lockContext` dentro de la misma transacción. Se rechazan credenciales ausentes o malformadas antes de SQL. **Las credenciales quedan excluidas de la huella de idempotencia**, que identifica los datos económicos de la solicitud, no secretos de sesión. Pruebas de regresión en `tests/catalog-confirmation-coordinator.test.mjs`. Commits `0cbf1b46` y `59645679`.

Sigue siendo un candidato no operativo: la comprobación de credenciales depende de que el repositorio de contexto real se integre y de que los roles SQL, el escritor de pedidos, la auditoría y las pruebas PostgreSQL queden acreditados. No se activan rutas ni se concede ningún permiso.

## Composición candidata de lecturas autorizadas (22-10-2026)

`apps/api/src/catalog-confirmation-repository.mjs` compone el bloqueo de visita con QR y sesión del cliente, la consulta de idempotencia, el bloqueo de publicación y la lectura de cotización anterior. Exige la inyección explícita de un `persist` transaccional: **no proporciona ni simula un escritor duradero por defecto**. Su guard de autorización es una defensa complementaria, no reemplaza RLS ni la revalidación transaccional del escritor.

`tests/catalog-confirmation-repository.test.mjs` cubre ausencia de escritor, secuencia de lecturas, SQL parametrizado, exclusión de credenciales en la consulta de replay y rechazo de contexto no autorizado. Commits `99f001ab`, `463a1ba1`.

**No operativo:** el adaptador de persistencia, permisos SQL de mínimo privilegio, auditoría atribuida y prueba de confirmación completa contra PostgreSQL 17 siguen pendientes. No hay activación HTTP ni despliegue.

## Defensa en profundidad: contexto autorizado en lecturas (22-10-2026)

El lector `catalog-confirmation-read-repository.mjs` exige ahora `authorized === true` y `canOrder === true` en sus tres métodos de lectura, antes de consultar SQL. Se añaden regresiones para contextos revocados o no autorizados, sin consultas ejecutadas (`9d4f29ae`, `60fbb00a`). Es una barrera de adaptador, no una prueba criptográfica de identidad ni sustituto de RLS; la autorización real sigue dependiendo del bloqueo y verificación de la visita con credenciales actuales.

No hay cambios en permisos ni en la base operativa. La persistencia económica de pedidos y su auditoría siguen pendientes.

## Endurecimiento de entrada de cotizaciones (22-10-2026)

El emisor candidato `catalog-quote-issuer.mjs` copia de forma independiente el payload antes de cualquier `await` o transacción. Rechaza getters/setters, propiedades ocultas o simbólicas, prototipos ajenos, referencias circulares, arreglos dispersos, nombres de propiedades peligrosos y profundidad excesiva. También limita la representación JSON a 16 KiB antes de SQL. Pruebas de entradas maliciosas y ausencia de consultas en `tests/catalog-quote-issuer.test.mjs` (commits `87d7e2f1`, `411b4996`, `ad08f788`, `a2fcba84`).

La copia defensiva no autentica la visita ni autoriza importes; la evidencia económica sigue derivándose del snapshot publicado bajo bloqueo. La ruta de cotización continúa inactiva en producción.

## Composición de cotización y prueba de integración candidata (22-10-2026)

`apps/api/src/catalog-quote-repository.mjs` compone la lectura autorizada de visita, el bloqueo de publicación y la inserción de cotización mostrada. Todos los métodos reciben la misma capacidad `query` de la transacción del llamador; el módulo no crea conexiones ni roles. `tests/catalog-quote-repository.test.mjs` prueba el flujo completo del emisor con SQL simulado, los parámetros de evidencia, la exclusión de credenciales en escrituras y rollback cuando la visita está revocada, el plato agotado o la inserción falla (commits `76c1b8bc`, `5afba6cc`).

**Alcance:** integración de adaptadores con SQL simulado; no equivale a prueba PostgreSQL 17 de cotización contra RLS, ni concede permisos de escritura, ni activa endpoints. La confirmación duradera de pedidos y aceptación económica siguen pendientes.

## Prueba de flujo de confirmación con repositorios compuestos (22-10-2026)

`tests/catalog-confirmation-composed-flow.test.mjs` integra el coordinador con las lecturas reales del repositorio candidato y un escritor **inyectado de prueba**: valida orden de bloqueos, exclusión de credenciales en lecturas posteriores, replay, visita revocada, plato agotado, cambio de revisión que requiere aceptación y rollback ante fallo del escritor. El ensayo usa respuestas SQL simuladas; no prueba durabilidad ni permisos PostgreSQL. Commit `83c529d9`.

Además, el coordinador enumera expresamente campos obligatorios y trata `acceptanceToken` como opcional para precios sin cambios, manteniendo `customerSessionToken` obligatorio (`65ce596a`, `b2c925ee`). No activa rutas, permisos ni escritura operativa.

## Puerta SQL de activación económica negativa (22-10-2026)

`scripts/ci/catalog-confirmation-activation-gate.sql` verifica en PostgreSQL 17 desechable que `anon`, `authenticated`, `sabora_admin_writer`, `sabora_catalog_reader` y `sabora_staff_reader` no tienen permisos directos sobre los dos ledgers económicos ni pueden ejecutar `sabora.confirm_order` (función histórica que no cumple el contrato económico nuevo). Exige FORCE RLS sin políticas y las restricciones SQL de idempotencia y pertenencia de cotización. Se integra en `scripts/ci/postgres-migration-smoke.sh` después de aplicar las migraciones en el contenedor sin red. Commits `f5f2cfb3`, `a255d412`.

**Es un control de no activación, no un escritor operativo.** El propietario de la base de pruebas puede seguir ejecutando funciones históricas en sus fixtures; ninguna concesión a roles de runtime ni migración de producción queda autorizada por esta prueba.

## Revalidación de credenciales antes de replay (22-10-2026)

La batería de integración candidata de confirmación añade escenarios de QR rotado, bearer de sesión de cliente reemplazado y clave idempotente reutilizada con huella diferente. Se exige que un QR o bearer inválido aborte **antes de consultar idempotencia**, catálogo o escritor, incluso cuando exista un intento previo. Un replay con huella incompatible también aborta antes de catálogo. Pruebas con SQL simulado: `tests/catalog-confirmation-composed-flow.test.mjs` (`65d98120`, limpieza `d73db10d`).

**Alcance:** el mock comprueba la secuencia y las condiciones de rechazo, pero no sustituye pruebas de rotación/revocación concurrente en PostgreSQL 17 con una identidad autenticada y permisos mínimos. Ninguna ruta HTTP o grant se activa.

## Puerta de persistencia candidata y consentimiento (22-10-2026)

`apps/api/src/catalog-confirmation-repository.mjs` valida ahora el alcance completo de la visita autorizada (mesa y sesión UUID, identificadores opacos, `authorized` y `canOrder`), clave y huella acotadas, UUID de cotización, evidencia económica y booleanos de aceptación antes de delegar al escritor inyectado. Un cambio de precio (`requiresAcceptance=true`) con `acceptanceVerified=false` se rechaza sin llamar al escritor. `tests/catalog-confirmation-repository.test.mjs` incluye casos negativos y ausencia de llamadas a persistencia. Commits `c0e9f4c7`, `f44a015f`.

Esta barrera no prueba que el contexto provenga de una transacción real: **no debe exponerse como API de escritura** ni interpretarse como sustituto del rol SQL de mínimo privilegio, auditoría vinculada a identidad y confirmación económica duradera. No hay grants ni despliegue.

## Gate reforzado de inmutabilidad económica (22-10-2026)

La puerta SQL de activación `scripts/ci/catalog-confirmation-activation-gate.sql` comprueba también que **ambas** tablas económicas tengan activos los disparadores `BEFORE UPDATE OR DELETE` y `BEFORE TRUNCATE`, vinculados a `sabora.reject_catalog_ledger_mutation()`. La comprobación inspecciona los bits de evento de `pg_trigger`, exige `SECURITY INVOKER` y rechaza `EXECUTE` público sobre la función de rechazo. Este control complementa FORCE RLS y los permisos negativos ya verificados. Commits `07cafd2d` y `98bea456`.

Se mantiene la limitación: la puerta comprueba el esquema y sus ACL en PostgreSQL 17 desechable; **no acredita todavía** escritor duradero, identidad SQL verificada ni una transacción real de pedido con consentimiento.

## Serialización de idempotencia concurrente (22-10-2026)

El lector de idempotencia `apps/api/src/catalog-confirmation-read-repository.mjs` adquiere ahora un bloqueo transaccional `pg_advisory_xact_lock(hashtextextended(...))` **antes** de consultar el intento previo. La clave deriva del alcance autorizado (mesa, sesión, visita, cesta, actor) y la clave de petición; no incluye QR ni bearer. Los reintentos concurrentes con la misma clave quedan serializados hasta commit/rollback y el segundo lector puede ver el intento persistido por el primero. La restricción SQL `catalog_confirmation_idempotency` sigue siendo la última defensa. Una colisión de hash solo serializa solicitudes independientes, no autoriza replays cruzados.

Cobertura: pruebas de orden de consultas, aislamiento de claves y contextos y composición del coordinador (`1fc916ab`, `8f907d99`, `866e8a83`, `0db22a4f`, `501c5287`). **Pendiente:** ejecutar concurrencia real entre dos conexiones PostgreSQL 17, con el escritor duradero y las políticas/identidad SQL mínimas; el contrato sigue desconectado de HTTP y producción.

## Concurrencia PostgreSQL 17 real del bloqueo idempotente (22-10-2026)

`scripts/ci/catalog-confirmation-idempotency-concurrency-smoke.sh` abre **dos conexiones independientes** al PostgreSQL 17 desechable, sin red, creado por `scripts/ci/postgres-migration-smoke.sh`. La primera toma `pg_advisory_xact_lock(hashtextextended(scope,0))` y mantiene la transacción abierta; la segunda intenta la misma clave. La prueba exige observar `wait_event_type='Lock'`, finalización posterior de ambas conexiones y liberación del bloqueo tras commit. El scope reproduce exactamente la serialización de `catalog-confirmation-read-repository.mjs`. Integración: commits `3a0794f5` y `bb7ef8ff`.

**Limitación expresa:** demuestra el bloqueo de dos transacciones reales, no una carrera completa de inserción del pedido, ni prueba de identidad SQL verificada, política RLS de escritor, evidencia económica y aceptación persistidas. Mantener los endpoints y los grants de escritor inactivos hasta superar esas puertas.

## Atomicidad de confirmación en PostgreSQL 17 aislado (22-10-2026)

Se añadió `scripts/ci/catalog-confirmation-atomicity-smoke.sql` al pipeline `scripts/ci/postgres-migration-smoke.sh`. Crea mesa, artículo y cotización en una transacción de pruebas; en un savepoint inserta un pedido y su intento económico, revierte el savepoint y comprueba que **ninguno** subsiste. A continuación inserta otro pedido y su confirmación con la misma clave y comprueba que el par existe exactamente una vez, antes de hacer `ROLLBACK` del fixture completo. Commits `eb7d08fa`, `e0a9e8e4`, `a8fddf43`.

Se trata de una comprobación SQL de atomicidad de los ledgers candidatos bajo el propietario del contenedor desechable, **no** del escritor de aplicación autenticado ni de carreras de inserción con dos clientes. No autoriza grants, rutas HTTP, despliegue ni cambios en el Supabase operativo.

## Rollback automático ante fallo de integridad referencial (22-10-2026)

La prueba de atomicidad de PostgreSQL 17 incorpora un escenario de fallo posterior al `INSERT` del pedido: intenta vincular una confirmación a una cotización de **otro artículo** y exige que PostgreSQL devuelva precisamente `catalog_confirmation_quote_scope`. Un subbloque de excepción comprueba que la inserción anterior del pedido también se revierte y que no queda un intento de confirmación huérfano. Commits `f71b8fdb`, `59fe360c`.

Este ensayo acredita el comportamiento transaccional de la base de datos en un caso de fallo real, pero no sustituye el escritor autenticado y los tests completos de concurrencia/consentimiento. Ningún permiso ni endpoint nuevo se activa.

## Consistencia del registro de aceptación económica (22-10-2026)

Se añadieron dos casos negativos SQL a `catalog-confirmation-atomicity-smoke.sql`: `accepted_reprice=true` sin `accepted_at`, y `accepted_reprice=false` con marca temporal. Ambos deben fallar con `catalog_confirmation_acceptance_consistency` (commit `d87c6c5a`). Esto protege la coherencia estructural del ledger, **no** demuestra que la persona haya aceptado un cambio de precio; la aceptación explícita verificable sigue siendo requisito previo para activar el escritor.
