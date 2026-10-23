# Sesión 7 — continuidad operativa CartaViva / Sabora (23-10-2026)

## Fuente de verdad y punto de partida

- Repositorio **jdlc86/CartaViva**; rama de trabajo **feat/sabora-pnpm-bootstrap**; **PR #2 Draft**.
- HEAD verificado al preparar este documento: **6a84444032c5b09b08c9d8a63dd9c59b78e5a01a**.
- GitHub Actions de ese HEAD: **Sabora CI 39906530629 SUCCESS** y **Bootstrap Sabora lockfile 39906530639 SUCCESS**.
- Volver a consultar HEAD, diferencias, PR y workflows al comenzar la sesión 7; estos identificadores son una fotografía, no una garantía para commits futuros.
- **GitHub es la fuente de verdad**. Leer este documento, `docs/continuity/SESSION_06_HANDOFF.md`, `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `docs/architecture/SABORA_ECONOMIC_PUBLICATION_IMPLEMENTATION_PLAN.md`, `docs/security/SESSION_05_ORDER_WRITER_CANDIDATE_GATE.md` y la documentación de arquitectura, seguridad, CI y despliegue pertinente. No reinterpretar contratos ni asumir capacidades por memoria.

## Arquitectura y límites

CartaViva es el directorio central; **Sabora es un único restaurante**, con **dos PWAs independientes** (cliente y administración). Mantener aislamiento por proyecto, identidad y recursos. No introducir multi-restaurante dentro de Sabora por inferencia.

No tocar Fleetia ni sus contenedores, redes, volúmenes, bases de datos, puertos o procesos, ni otros proyectos del VPS compartido. **Prohibidos merge, despliegue, reinicios y migraciones en Supabase operativo sin autorización expresa**. El proyecto Supabase indicado en el contexto de CartaViva no es autorización para modificarlo. Las pruebas PostgreSQL 17 deben ejecutarse en contenedor **desechable y aislado**, como en CI, nunca sobre recursos compartidos.

Se permite trabajar en rama, publicar commits, pruebas, documentación y PR en **jdlc86/CartaViva**. Mantener PR #2 Draft. Evitar revisiones Codex de pago salvo nueva instrucción del usuario.

## Estado técnico comprobado en documentación

- Existe una composición candidata de confirmación de pedidos con coordinación transaccional, validación de QR y sesión de cliente mediante visita durable, bloqueo de mesa, lectura de publicación, cotización previa, recálculo económico, consentimiento ante cambio de precio, idempotencia por ámbito y persistencia atómica de pedido/ledger.
- Fábrica canónica: `apps/api/src/catalog-order-confirmation-candidate.mjs`. No volver a crear una fábrica duplicada; la documentación de sesión 6 describe su consolidación.
- Componentes relevantes: `catalog-confirmation-coordinator.mjs`, `catalog-confirmation-repository.mjs`, `catalog-confirmation-read-repository.mjs`, `catalog-visit-context-repository.mjs`, `catalog-order-writer.mjs`, `catalog-confirmation-attempt-writer.mjs`, `postgres-transaction.mjs`.
- Existen pruebas Node de transacciones con pool/driver simulado, incluyendo rollback ante respuestas SQL hostiles, ocupación `first/grouped/late`, idempotencia, validación económica y límites de confianza.
- `scripts/ci/postgres-migration-smoke.sh` ejecuta migraciones y pruebas SQL en PostgreSQL 17 Docker `--network none`, incluyendo concurrencia, agrupación, cierre, RLS, permisos y atomicidad. **Estas pruebas SQL no equivalen a ejecutar el coordinador Node con un driver PostgreSQL real**.
- Los últimos apartados de `SESSION_06_HANDOFF.md` documentan matrices integradas simuladas de fallo de respuestas y ocupación. Comprobar archivos y tests actuales antes de modificar.
- Hubo una regresión de sintaxis en `catalog-order-writer.mjs` detectada por CI; la documentación de sesión 6 registra su corrección y la recuperación de CI. No repetir la incidencia: verificar sintaxis y pruebas antes de publicar.

## Bloque grande prioritario para la sesión 7

**Meta: acreditar el candidato completo Node + PostgreSQL 17 real en entorno desechable, sin activar producción.**

1. Inspeccionar dependencias y lockfile (`package.json`, `apps/api/package.json`, `pnpm-lock.yaml`) y workflows. Diseñar un harness de integración con driver PostgreSQL declarado y lockfile reproducible; evitar conexiones operativas o secretos de Supabase.
2. Reutilizar el PostgreSQL 17 aislado de CI o crear otro igualmente desechable. Aplicar migraciones existentes sin alterar el esquema operativo.
3. Ejecutar el candidato canónico de Node contra ese PostgreSQL real. Preparar fixtures de mesa abierta, QR vigente, visita autorizada, sesión cliente, catálogo publicado, cotización y contexto económico según los contratos reales. No fabricar autorización en un endpoint ni aceptar flags del navegador.
4. Comprobar persistencia real de pedido, agrupación `first/grouped/late`, línea de cocina y ledger; replay idempotente, mismo request-key con fingerprint incompatible, revisión de precio que exige aceptación, rollback ante error de ledger y concurrencia de primeras confirmaciones/cierre. Separar pruebas factibles de pendientes; no afirmar escenarios no ejecutados.
5. Diseñar y probar **rol escritor SQL de mínimos privilegios** con RLS/FORCE RLS y atribución de actor verificable; mantener las concesiones operativas cerradas hasta que el diseño esté acreditado. No conceder permisos a `anon`, `authenticated` ni roles ajenos.
6. Acreditar `pnpm test`, build, migraciones y workflows en GitHub. Resolver errores y revalidar el **HEAD final**, no solamente el anterior. Documentar evidencias, comandos, límites y pendientes.

Si el bloque completo resulta demasiado grande, dividirlo en hitos coherentes de integración, **no** en una sucesión de microcambios cosméticos. Priorizar resultados verificables y seguridad. No habilitar rutas HTTP, grants de runtime ni despliegue hasta superar los gates documentados.

## Método autónomo

- Consultar primero estado real de rama, PR, archivos y GitHub Actions.
- Leer y respetar los contratos antes de editar. Trabajar en bloques amplios: código + tests + documentación.
- Ejecutar verificaciones disponibles; si el entorno local no tiene Docker, GitHub o conectividad, usar GitHub Actions y revisar logs. No presentar una prueba simulada como integración real.
- Tras cada hito importante, actualizar `docs/continuity` y documentos de arquitectura/seguridad afectados. Anotar SHA, workflow y resultado exactos.
- Ante fallos, investigar logs, corregir y revalidar sin esperar intervención si la acción es segura y está autorizada.
- No realizar merge ni despliegue por iniciativa propia. No acceder a Fleetia o recursos compartidos.
- Al terminar, informar qué se implementó, qué CI está acreditado, qué queda pendiente y los identificadores verificables.

## Próximo paso inmediato

Leer el HEAD real y comprobar si la integración Node–PostgreSQL 17 y el gate del rol mínimo ya han avanzado desde esta fotografía; después implementar el siguiente bloque faltante, evitando duplicar código y pruebas.

## Avance posterior de sesión 7 — guard de parámetros SQL (23-10-2026)

- Se reconcilió el HEAD documental `6a844440` con `43403878`: comparación GitHub confirma **un commit de avance**, exclusivamente la adición de este handoff. Los workflows del HEAD `43403878` terminaron SUCCESS: Sabora CI `39906977066` y Bootstrap `39906976966`.
- Commit `97094e8ae1a20b9fc0b8b0fb78532311f7d51616`: `apps/api/src/postgres-transaction.mjs` rechaza explícitamente parámetros `undefined`, evitando que un driver PostgreSQL los convierta silenciosamente en SQL NULL. Los NULL explícitos permanecen permitidos.
- Commit `7b58924d2b1adcc2e8fe2f660a545816f9d2d629`: `tests/postgres-transaction-undefined-bindings.test.mjs` prueba rechazo previo a driver, rollback si el error se propaga, conexión liberada y aceptación de NULL explícito.
- Esta mejora es un **guard unitario**, no evidencia de Node + PostgreSQL 17 real. La integración con driver declarado/lockfile, fixtures SQL, concurrencia, atomicidad e identidad de mínimos privilegios **sigue pendiente**. No se han habilitado rutas HTTP ni grants operativos.
- Al momento de publicar el test, la consulta de workflows del nuevo HEAD devolvió una lista vacía: **CI nuevo todavía no acreditado**. Consultar de nuevo el HEAD y las ejecuciones antes de declarar SUCCESS.
- Sin merge, despliegue, acceso al VPS ni cambios en Supabase operativo o Fleetia.

## CI de regresión y corrección (23-10-2026)

- En HEAD `762f4bb2`, los workflows `39907644598` (Sabora CI) y `39907644616` (Bootstrap) terminaron **FAILURE**. Los logs de ambos identifican **1 fallo entre 504 tests**: `tests/postgres-transaction.test.mjs`, prueba «query boundary rejects mutable and nonserializable SQL bindings before driver dispatch». La prueba antigua aún esperaba que `undefined` fuese aceptado como binding, en contradicción con el nuevo guard fail-closed.
- Commit `fe5306ca80e8ebfa70c25572cc66db1d5435c5ca`: se actualiza la expectativa de esa prueba para exigir rechazo de `undefined` y mantener la ejecución positiva con `null` explícito. El guard de producción no se revierte.
- **Verificación pendiente:** consultar workflows de `fe5306ca` y del HEAD documental final. No atribuir SUCCESS hasta comprobar las ejecuciones nuevas.

## Gate verde verificado y próximo bloque indivisible (23-10-2026)

- Se verificaron los workflows del HEAD `4f78b89d6f14ad880f0ce4e6857dd8610f065d85`: **Sabora CI 39907798952 SUCCESS** y **Bootstrap Sabora lockfile 39907798830 SUCCESS**. Esta evidencia acredita el guard `undefined` y su regresión corregida; no acredita aún la integración Node–PostgreSQL real.
- Se releyeron la fábrica canónica `catalog-order-confirmation-candidate.mjs`, el coordinador, repositorio, escritor, `scripts/ci/postgres-migration-smoke.sh`, `package.json`, `apps/api/package.json` y `pnpm-lock.yaml`. La API todavía no declara `pg` y el lockfile no contiene un paquete `pg@`; el smoke actual ejecuta SQL dentro de Docker `--network none`, no un driver Node conectado a PostgreSQL.
- **Siguiente bloque indivisible:** declarar y bloquear el driver de PostgreSQL en el lockfile; crear harness Node real con PostgreSQL 17 desechable y conectividad exclusivamente local/aislada; reutilizar migraciones y fixtures verificables; ejecutar la fábrica canónica contra el driver; comprobar idempotencia, cierre concurrente, agrupación, rechazo y rollback; acreditar RLS y rol mínimo sin activar grants de producción. No introducir una dependencia sin regenerar y validar el lockfile reproducible.
- Mantener PR Draft y prohibición de merge/despliegue y de uso de VPS/Fleetia/Supabase operativo.

## Corrección de frontera de autorización de visita (23-10-2026)

- `3850801a8ad43b56950437e61438d5cb62a91db8`: `catalog-visit-context-repository.mjs` solo interpreta `rows: []` como ausencia legítima de visita. Si el driver declara una fila pero devuelve `null`, `undefined`, primitivo u objeto inválido, se rechaza con `invalid_catalog_visit_response` en vez de convertir corrupción del adaptador en «no autorizado». No se amplían permisos ni se conceden autorizaciones.
- `a321f59edb9fead931399a4af7fdc7b2802b9b7d`: pruebas negativas y positivas para distinguir ausencia de fila y respuesta malformada.
- Este es un endurecimiento de la frontera Node simulada, **no la integración Node + PostgreSQL 17 real**. Revalidar el HEAD final en CI y mantener el gate de driver/lockfile/integración real pendiente.

## Puerta reproducible del lockfile (23-10-2026)

- Se verificó el HEAD `2429f3306ef9fbc73790fefd934124101b60af24`: **Sabora CI 39908161042 SUCCESS** y **Bootstrap Sabora lockfile 39908161060 SUCCESS**.
- Commit `67a7ea05d4271f61e67910e5746405cc3be17a87`: el workflow `.github/workflows/bootstrap-lockfile.yml` ahora ejecuta `git diff --exit-code -- pnpm-lock.yaml` inmediatamente después de regenerar el lockfile, antes de instalar/testear. Si el manifiesto cambia sin actualizar el lockfile versionado, el gate falla aunque pnpm pueda regenerarlo localmente. Se mantiene `contents: read` y `persist-credentials: false`; no hay escritura automática ni despliegue.
- **CI de este nuevo HEAD pendiente de acreditación**. La integración Node–PG17 real requiere incorporar `pg` con lockfile generado auténticamente, no una resolución inventada; el workflow ahora detectará ese desacople.

## Consistencia de consentimiento en frontera de repositorio (23-10-2026)

- `e245b4ace83f63f113e6a0575d2c83b9f7754d13`: `catalog-confirmation-repository.mjs` exige equivalencia lógica entre `requiresAcceptance` y `acceptanceVerified` en la llamada de persistencia: no permite aceptación fabricada cuando no existe recotización ni confirmación sin aceptación cuando es necesaria. El escritor económico ya tenía esta defensa; ahora se rechaza antes de llamar al adaptador `persist`.
- `010245bdd077e7929ea4d05df56dcca970d4d98f`: regresiones para ambos estados inválidos y ambos válidos, con contador de invocaciones de persistencia.
- La implementación sigue **desconectada** de HTTP, roles operativos y Supabase. Esta corrección no reemplaza la integración real Node/PostgreSQL 17 ni su gate de permisos.

## Endurecimiento de cotización económica previa (23-10-2026)

- `cc89d8046ae1e79b84ebde7a9503f1d3fef67553`: `catalog-confirmation-decision.mjs` comprueba que el registro `previous` tiene prototipo simple, propiedades de datos propias y enumerables, sin símbolos ni accesores, **antes** de leer importes o revisión. Se evita ejecutar getters no confiables en la decisión económica.
- `01636013aaf6129ec43fdb5ce077aeb1ed352744`: regresiones de getter con contador, símbolos y prototipo heredado.
- Los workflows del HEAD anterior `df7ce93` estaban aún en progreso al comprobarlos. El gate real Node–PG17 y los permisos del writer continúan pendientes. PR Draft; ninguna ruta o credencial operativa habilitada.

## Composición completa mediante pool inyectado — regresión de integración simulada (23-10-2026)

- Se verificó HEAD `a171f54cf86a0dca574305f6fe724d5fe9b84430`: **Sabora CI 39908580417 SUCCESS** y **Bootstrap 39908580378 SUCCESS**.
- Commit `3ec8a1f1c00888cd2bcde893a93e708894bb6940`: nueva suite `tests/catalog-confirmation-pool-end-to-end.test.mjs`, que ejecuta **la fábrica completa** `createCatalogOrderConfirmationPoolCandidate` pasando por `createPostgresTransaction`, autorización de visita, bloqueo de idempotencia, catálogo, quote, order writer y ledger. Comprueba commit único, proyección de cocina, replay sin segunda escritura, rollback por fallo de ledger, visita revocada, agotado, aceptación HMAC por bajada de precio y conflicto de fingerprint. Verifica liberación de conexiones.
- **Límite explícito:** el pool de esta suite simula SQL en memoria. No demuestra semántica de PostgreSQL, bloqueos reales, grants ni RLS. El siguiente hito obligatorio sigue siendo driver `pg` declarado y lockfile real, PG17 desechable y suite sobre conexiones físicas. No confundir esta suite con la acreditación del hito.
- CI del nuevo HEAD debe consultarse y corregirse si falla. PR Draft, sin merge, VPS, Fleetia, Supabase operativo ni activación HTTP.

## Extensión del pool integrado — agrupación y cierre de ventana (23-10-2026)

- HEAD previo `9d9275860202e9a0b450293e1b0aa3b2aed96ad8` acreditado: Sabora CI `39910161877` SUCCESS y Bootstrap `39910161856` SUCCESS.
- `aa8f2a09a48d195e23e2451bf9b5823fff9ede36`: el simulador de la composición completa admite primera confirmación previa y ventana configurable. Nuevas regresiones para pedido **grouped** antes de vencer la ventana, **late** exactamente al vencer, bloqueo de escritura si sube el precio sin consentimiento y replay con fingerprint distinto. Conserva la primera marca temporal y comprueba rollback y liberación de conexión.
- Estas pruebas complementan, **no sustituyen**, los smoke SQL PG17 existentes. Sigue pendiente la conexión Node + `pg` a PG17 real, migraciones/fixtures y rol mínimo. No se han cambiado dependencias ni generado un lockfile ficticio.

## PostgreSQL 17 real: ventana configurable de agrupación (23-10-2026)

- `f5abb1541cc165fdfb390c307cb48cae6fb549c1`: nuevo `scripts/ci/catalog-order-writer-configurable-window-smoke.sql` para una mesa aislada con ventana de **60 segundos** (distinta de 300): confirma primer pedido, segundo pedido dentro de ventana, tercero fuera de ventana, proyección de cocina y preservación del primer timestamp en ambos casos. Los datos se revierten con `ROLLBACK`.
- `e20b17ec0814a39b6f721f4e0650d4c2743fa821`: incorpora el smoke al script canónico `scripts/ci/postgres-migration-smoke.sh`, en contenedor PostgreSQL 17 `--network none` de GitHub CI.
- **Alcance:** SQL real en PostgreSQL 17, pero no driver Node `pg`. El gate de integración de Node, lockfile y mínimos privilegios sigue pendiente. Corregir CI si falla antes de dar el bloque por acreditado.

- `e063e48f5d85652d4213e84a6b94d4245d976c91`: el primer pedido del smoke de 60 segundos usa ahora el mismo `CASE` de estado de ocupación de la mesa que el escritor real; se eliminó la clasificación constante que no probaba la decisión de agrupación. La primera marca temporal se deriva de la mesa en PostgreSQL, no de una etiqueta prefijada.
- Los workflows del HEAD documental `600c3ec` permanecían **queued** al comprobarlos. Consultar la ejecución del HEAD más reciente; no dar por acreditado el nuevo smoke hasta que termine. La integración Node–PG17 con `pg` sigue pendiente.

## Gate adicional: fixture de ventana y rollback verificable (23-10-2026)

- `888d1b606b59a7d35f274f3ffd45adcaaf1829fe`: antes del primer pedido se verifica en PostgreSQL que la mesa de prueba tiene **60 segundos**, estado abierto y primera confirmación nula. Un cambio accidental al valor por defecto de 300 segundos rompe el smoke.
- `4df97ed6b0fc44f2ed88e23ec5d3d6a2631ed7a8`: tras `ROLLBACK`, el smoke consulta PostgreSQL y exige ausencia de la mesa, los tres pedidos y sus líneas de cocina. La limpieza se **comprueba**, no se presupone.
- Los workflows anteriores seguían en cola durante esta sesión; las pruebas de este HEAD deben acreditarse antes de marcar el gate verde. Pendiente integración Node real con driver `pg`, lockfile auténtico y permisos mínimos.

## PG17 real: bloqueo de mesa antes de confirmar (23-10-2026)

- `33143d7cece0ed93486f7af31e2fa5dc42a159d0`: smoke `scripts/ci/catalog-order-table-state-gate-smoke.sql` que ejecuta el predicado `SELECT ... FOR UPDATE` del escritor candidato contra PostgreSQL 17 real. Casos: mesa abierta permitida; cerrada denegada; pausa futura denegada; pausa sin caducidad denegada; pausa vencida permitida; sesión distinta denegada. El fixture se revierte y se verifica su ausencia.
- `1bf41c5cb267913e780794457cf721c9b14c1d07`: integración en `scripts/ci/postgres-migration-smoke.sh`. Este gate comprueba la frontera SQL, no el driver Node ni un grant operativo.
- Los workflows anteriores estaban en cola; **no afirmar CI verde** para estos cambios sin inspeccionar sus ejecuciones. La integración real `pg` + lockfile auténtico sigue pendiente.

### Hallazgo real en CI y diagnóstico de pausa vencida

- Sabora CI `39917455977` del commit `525320e` **FAILED** en el nuevo smoke `catalog-order-table-state-gate-smoke.sql`: la comprobación `expired_pause_allowed` devolvió cero filas (división por cero), tras pasar abierta/cerrada/pausa futura/pausa indefinida. No atribuir éxito a este gate.
- `61f74f3786d39a3cc6e9fd2fb6edc7102370de72`: sustituye la afirmación no acreditada sobre pausa vencida por diagnóstico de `ordering_state`, `pause_until` y elegibilidad del predicado. **La aceptación de pausa vencida queda pendiente de investigar**, no se declara cubierta. Los demás casos conservan aserciones estrictas.
- El SQL del escritor incluye explícitamente pausa vencida en su predicado, pero el resultado real del gate exige verificar el estado persistido/normalizado de la mesa antes de afirmar el comportamiento. Mantener PR Draft y no activar rutas.

### Resolución de fallo de CI: restricción de estado de pausa

- CI `39917621554` y Bootstrap `39917621687` fallaron en el mismo smoke PG17; no fue el lockfile. El log confirmó que una mesa `paused` con `pause_until` vencido satisface el predicado del escritor (`eligible_by_writer_predicate=t`). El fallo ocurrió **después**, al intentar `UPDATE ordering_state='open'` conservando `pause_until`, lo que viola la restricción `dining_table_pause_state`.
- `0390b72eb09dbd0bd7cd9af9dd8441ea63485437`: la transición de fixture a `open` limpia **atómicamente** `pause_until=NULL`, conforme a la restricción SQL. El comportamiento de pausa vencida queda observado por consulta SQL; su aserción estricta de aceptación deberá restituirse antes del gate definitivo.
- No hay cambio de migraciones ni del escritor operativo. Revalidar ambos workflows antes de dar por cerrado el fallo.

### Segundo fallo real y corrección de sesión activa

- Ambos workflows del commit `177ac298a5c3f7bbb9904df38d995645a05cb2ed` terminaron **FAILURE** en `expired_pause_allowed`, después de pasar las comprobaciones anteriores.
- La prueba había conservado `session_id` del INSERT inicial a pesar de las transiciones de estado. `7ebb4a335457af969785821473d7beee82abc49c` lee el `session_id` **actual** antes de comprobar la pausa vencida; conserva una prueba independiente que rechaza explícitamente una sesión incorrecta. Esta hipótesis debe contrastarse en el nuevo CI; no declarar validación hasta entonces.
- Sin cambios en contratos operativos, migraciones, rol de runtime o endpoints. Continúa pendiente la prueba Node + driver `pg` real y su lockfile.

## Bloque Node.js + driver pg real en PostgreSQL 17 desechable (23-10-2026)

- `scripts/ci/catalog-postgres17-node-driver-smoke.sh` crea **un PostgreSQL 17 nuevo** en GitHub Actions con puerto efímero ligado únicamente a `127.0.0.1`, aplica todas las migraciones y elimina contenedor/archivos temporales mediante `trap`. Rechaza explícitamente su ejecución fuera de `GITHUB_ACTIONS=true`; nunca lee URL de Supabase, credenciales operativas ni usa el VPS.
- Instala `pg@8.16.3` **solo en un directorio temporal de CI** para poder ejecutar el primer gate Node real sin modificar el manifiesto de producción ni inventar `pnpm-lock.yaml`. La integración formal de la dependencia `pg` en `apps/api/package.json` y su lockfile reproducible continúa pendiente; esta instalación efímera no los sustituye.
- `scripts/ci/catalog-postgres17-driver-integration.test.mjs` usa el driver real `pg.Pool` con `createPostgresTransaction`: confirma transacción y decodificación de resultados, comprueba rollback de una inserción real en `sabora.dining_tables` desde otra conexión y comprueba serialización de dos clientes por `pg_advisory_xact_lock`. Es un primer gate del adaptador de transacciones, **no** la acreditación completa del coordinador catálogo→pedido→ledger.
- Ambos workflows (`Sabora CI` y `Bootstrap Sabora lockfile`) ejecutan el gate adicional después de migraciones SQL. El contenedor temporal solo expone loopback en un runner efímero; no se toca Fleetia, Supabase ni producción.
- **No declarar verde** hasta revisar los resultados de GitHub Actions para el HEAD de este bloque. Mantener PR #2 Draft; sin merge ni despliegue.

### Extensión del gate Node real: agrupación, cocina y RLS (23-10-2026)

- El HEAD `2a3ab5b54e26cd4230a9d560de4a03a40af287ce` quedó **SUCCESS** en Sabora CI `39922661503` y Bootstrap `39922661547`; acredita el adaptador transaccional real en PostgreSQL 17.
- `5e200e07879fe250b81d7d04e41eb17005bcbc86` amplía `scripts/ci/catalog-postgres17-driver-integration.test.mjs`: ahora Node y el driver `pg` ejecutan en PostgreSQL 17 el CTE real de inserción y marca temporal para `first/grouped/late`, verifican las líneas de cocina, hacen `ROLLBACK` y comprueban desde otra conexión que no quedan pedidos ni líneas. Se mantiene el aislamiento del runner y la limpieza del contenedor.
- Nuevo gate SQL consultado **desde Node**: `pg_class` exige `relrowsecurity`, `relforcerowsecurity` y ausencia de `INSERT` para `anon` y `authenticated` en `orders`, `order_lines` y `catalog_confirmation_attempts`. Esto no equivale a acreditar un rol escritor de mínimos privilegios.
- Pendiente revisar CI de este HEAD; los nuevos escenarios todavía no acreditan la fábrica completa `createCatalogOrderConfirmationPoolCandidate`, replay y consentimiento económico reales. No activar runtime ni grants.

### Regresión Bootstrap y recuperación de readiness PG17

- En `fdd82e680d4d435d1a4f891728c1c9df97c74612`: **Sabora CI 39923096985 SUCCESS**, **Bootstrap 39923096842 FAILURE**. El log del Bootstrap localizó el fallo en el arranque del nuevo contenedor del harness Node: `psql: connection to server on socket ... failed`. No fue una regresión del test de pedidos ni de RLS; la ejecución ni siquiera llegó a migraciones del nuevo contenedor.
- `e0143609471de04c0a7b2fb7086193f416422cce`: el harness espera hasta 60 intentos por una **consulta SQL efectiva** `SELECT 1` y, si no llega a estar disponible, muestra logs del contenedor antes de fallar. Se mantiene `trap` de limpieza y aislamiento loopback.
- Revalidar ambos workflows del HEAD nuevo. No atribuir SUCCESS al cambio de readiness hasta que terminen.

### Bloque real Node: escritor canónico y ledger atómico (23-10-2026)

- `8677c3d606f600ec2bc72c204c78dc0a874bfefe`: extensión del harness PostgreSQL 17 para ejecutar **`createCatalogOrderWriter` real**, no solo un CTE copiado en el test. Genera evidencia con `buildCatalogLineEvidence`, crea mesa/catálogo/quote temporales, llama `writer.persist` mediante `createPostgresTransaction` y comprueba el pedido `first`, su proyección de cocina y la fila de `catalog_confirmation_attempts` con evidencia económica idéntica. Una segunda operación con quote inexistente debe fallar y revertir pedido/línea. Limpieza explícita en `finally` y eliminación del contenedor por `trap`.
- **Importante:** esta prueba suministra un contexto de autorización construido por el fixture SQL, por lo que acredita la persistencia atómica del escritor pero **no** la validación real QR/sesión/visita del coordinador. No habilitar HTTP ni permisos de runtime. CI nuevo pendiente de acreditar.

### Corrección del fixture ante ledger append-only (23-10-2026)

- En el HEAD `4691e9b9063b501664a1f5f7a2e0410b0e6d462f`, el gate Node del escritor canónico falló con SQLSTATE `23514 catalog_ledger_append_only`. El fallo fue causado por la **limpieza del propio test**, que intentaba hacer `DELETE` de `catalog_confirmation_attempts` tras comprobar la escritura. La restricción de inmutabilidad operativa funcionó correctamente y no debe relajarse.
- `e6909030bc956e8d681dec9b48c2eb21f1b15639` sustituye ese cleanup por un `BEGIN` de fixture, un `SAVEPOINT` para simular quote inválida y un `ROLLBACK` final de toda la transacción, sin modificar ni borrar filas del ledger confirmado. Comprueba dentro de la transacción pedido/línea/evidencia y fuera de ella la ausencia de residuos. Es el patrón obligatorio para este test de integración.
- El gate comprueba atomicidad del escritor real en una transacción de prueba; **no acredita persistencia duradera tras COMMIT** ni autorización del coordinador. No activar producción ni declarar verde hasta que CI concluya.

### Ampliación del escritor canónico real: first/grouped/late

- `1329f0e9dd6f1e80358b954caa6f366d6ca0a21c`: el mismo fixture transaccional invoca ahora `createCatalogOrderWriter` **tres veces** contra PostgreSQL 17 real: primera confirmación, agrupación a 30 segundos y llegada tardía a 301 segundos, usando nuevas quotes y claves idempotentes por intento. Comprueba para cada una la clasificación, la proyección de cocina y la fila de ledger, sin copiar la implementación del CTE.
- Se mantiene el rechazo de quote inválida bajo `SAVEPOINT` y el `ROLLBACK` de todo el fixture, imprescindible porque el ledger es append-only. No se cambia el comportamiento operativo ni la migración.
- **No confundir este gate con el coordinador completo**: falta validar la lectura autorizada de QR/visita y la resolución de precio/reprice con el `pg.Pool` real. Pendiente CI del nuevo HEAD.

### Carrera de inicialización Docker PostgreSQL: socket temporal frente a TCP final

- El Bootstrap `39926305324` del HEAD `193ec177...` falló al crear los roles: `psql: connection to server on socket ... No such file or directory`. La comprobación SQL previa contra el socket podía conectar al **servidor temporal del entrypoint**, que se detiene antes de arrancar PostgreSQL definitivo. Esperar más tiempo al socket no garantiza disponibilidad del servidor final.
- `bc338d9d0e79dd8a88ff73989fd302a559943a82` exige conexión **TCP `127.0.0.1` dentro del contenedor** para readiness, roles y migraciones; `0eca9e3de48cec2dc5c30273fa0e79b34726d859` añade `PGPASSWORD` de CI para autenticar ese TCP. La contraseña solo corresponde al contenedor desechable, no a ningún entorno real.
- Esta solución evita depender de la vida del socket de inicialización. Revisar ambos workflows del HEAD; la prueba Node sigue siendo un gate aislado sin permisos de runtime ni despliegue.

### Gate Node real: lectura del ledger, aislamiento de replay y quote

- El HEAD `3e8462b7952b8706cb311e772d2b85209310599d` quedó **SUCCESS** en Sabora CI `39926587276` y Bootstrap `39926587372`, incluyendo la corrección de readiness TCP del PostgreSQL 17 desechable.
- `e7d02c0abac1e698f822e2997d462d2c49aaf030`: amplía el gate real `pg` para ejecutar `createCatalogConfirmationReadRepository` dentro de la misma transacción del escritor. Acredita búsqueda del intento en ledger por ámbito completo y clave, ausencia de replay para otra cesta u otro actor, lectura de la quote con evidencia económica exacta y rechazo de un catálogo aún no publicado. Se mantiene el rollback integral de fixtures append-only.
- Pendiente verificar CI del HEAD actualizado y acreditar el flujo completo `createCatalogOrderConfirmationPoolCandidate` con autorización real de sesión/visita/QR y consentimiento ante repricing. No activar endpoints, grants ni producción.

### Primer gate del coordinador completo contra PG17 real: denegación de visita

- `76a9a32c741497b0b2a3bb9eeae1110f67f98625` añade al harness `pg.Pool` real la composición `createCatalogOrderConfirmationPoolCandidate`. Se presenta una petición sintácticamente válida pero sin visita/QR registrados; el coordinador debe responder `order_context_forbidden` tanto en el primer intento como en un supuesto replay. Se comprueba ausencia de pedido y ledger. Esta es una prueba real de la frontera de autorización negativa, no una simulación del pool.
- **Falta la ruta positiva** de visita autenticada, publicación de catálogo, cotización y aceptación de cambio de precio con fixtures reales. El candidato sigue sin HTTP, grants operativos ni despliegue. Verificar los workflows del HEAD.

### Aislamiento de cotización real y cambios concurrentes de rama

- `b8e525d752a04e8f10ede5cda240274781159719`: el gate Node+PG17 comprueba además que `loadPreviousQuote` no devuelve cotizaciones para otra sesión de mesa ni otra visita, ni devuelve una cotización caducada. Se usa `SAVEPOINT` para expirar temporalmente el fixture y restaurarlo sin mutaciones duraderas.
- Durante este bloque se detectó un **avance concurrente de la rama** (HEAD `76a9a32...`), que ya añadió una prueba del coordinador real para QR/visita inexistentes. Se releyó el archivo y se aplicó el cambio sobre su versión nueva, sin sobrescribir la prueba concurrente. Revisar los workflows del HEAD final antes de afirmar éxito.

### Gate PG17: QR incorrecto contra mesa existente

- `7e9b4273a412ac6b9cc474f5b775fdacf02b6908` añade un fixture de mesa abierta **existente** con hash QR real en PostgreSQL 17; el repositorio canónico `createCatalogVisitContextRepository` recibe un QR incorrecto y debe denegar autorización. El fixture se ejecuta dentro de `BEGIN/ROLLBACK`, sin limpieza por DELETE.
- Se comprueba además que el coordinador con el mismo intento rechazado no genera pedidos ni ledger después del rollback del fixture. **Alcance explícito:** la prueba de QR contra mesa existente ejecuta el repositorio en su propia transacción; la llamada posterior al coordinador ocurre sin mesa persistida, por lo que aún no acredita el rechazo del coordinador contra una mesa existente confirmada en otra conexión.
- Próximo hito: fixture comprometido con aislamiento de datos de CI y limpieza segura, o transacción controlada que permita probar ruta positiva de visita+QR+sesión con el coordinador completo. No activar HTTP ni grants.

### Endurecimiento del harness Node/PG17

- `31ae91c2832c6b263d7d7133007eac03d4eee98e`: el test Node rechaza su ejecución sin `GITHUB_ACTIONS=true` o cuando `SABORA_CI_PG_MODULE` no apunta al módulo `pg` instalado en el directorio temporal creado por el harness. Ya existía validación de DSN loopback `postgres@127.0.0.1/postgres` y el shell exige GitHub Actions antes de arrancar Docker.
- Este control protege contra invocaciones accidentales con módulos de runtime ajenos; no sustituye el aislamiento de red/credenciales ni autoriza uso sobre VPS o Supabase. CI del nuevo HEAD pendiente.

### Límites de tiempo para el gate real PG17

- `218620d1fbda7e994874cdf82a3d1acc9f4c9ea1`: el `pg.Pool` exclusivo del harness Node añade límites de sesión PostgreSQL: `statement_timeout=15000`, `lock_timeout=5000`, `idle_in_transaction_session_timeout=20000` (milisegundos). La conexión ya tiene `connectionTimeoutMillis=3000`. Esto evita que una regresión de bloqueos del test quede esperando indefinidamente y acota transacciones abandonadas.
- No modifica configuración operativa, esquema, contratos ni comportamiento del runtime. El gate de concurrencia debe comprobarse en CI; no inferir SUCCESS sin verificar el HEAD exacto.
