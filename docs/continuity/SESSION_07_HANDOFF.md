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

### Incidencia CI del gate de módulo temporal — corrección

- En el HEAD `e0d4118ae57eac2fce1b575a2f62f8eeb527baf9`, Sabora CI `39927673131` y Bootstrap `39927673090` terminaron **FAILURE** en el paso Node/PG17, antes de ejecutar los tests: `SyntaxError: Invalid regular expression flags` causado por la expresión regular de validación de ruta del módulo temporal.
- `7ed04619d7b8d934c4e9cac4942c44846c66e423` inició la corrección; `6d1623ace95289ccee23591acb37d416ff5431a6` sustituyó la expresión problemática por validación de prefijo/sufijo y segmento alfanumérico, y **conservó explícitamente** el guard de conexión `127.0.0.1/postgres` que no debe eliminarse.
- Verificar el resultado de ambos workflows del nuevo HEAD. No declarar verde por la corrección de código sin evidencia CI.

### Corrección de segundo fallo CI del harness

- Los workflows `39928118609` y `39928118555` del HEAD `112387be...` fallaron en el guard `disposable_pg17_harness_required` antes de iniciar tests. Causa: `mktemp -d` crea directorios `/tmp/tmp.XXXXXXXX` y la expresión de validación del sufijo no permitía el punto.
- `4b5eedfbf781d9fd71d5b0d82d12b2e21ef7870d` permite el punto exclusivamente en el segmento temporal validado. Siguen siendo obligatorios `GITHUB_ACTIONS=true`, el prefijo `/tmp/tmp`, el sufijo `/node_modules/pg` y DSN de loopback.
- Validar las pruebas completas sobre el nuevo HEAD antes de ampliar el flujo positivo.

### Gate de preflight y DSN estrictamente desechable

- `7b147d8470e8b4d6d736cb8ba86e1ae7a8da6951`: el shell de CI ejecuta `node --check` sobre el test del driver antes de instalar dependencias, arrancar Docker o migrar la base desechable. Errores sintácticos fallan pronto.
- `2aa64666e2c961ba1fbfdf6a2d838edc1f2f4102`: el test rechaza URL de PG17 con contraseña distinta de la credencial efímera fijada por el harness, sin puerto, con query string o fragmento, o con protocolo distinto de `postgresql:`. Se mantienen el host `127.0.0.1`, usuario `postgres` y base `postgres`. Estos controles son exclusivos del gate CI y no modifican conexiones de producción.
- Las pruebas del HEAD deben revisarse antes de declarar el gate acreditado. Sin cambios en Fleetia, VPS o Supabase.

### Inmutabilidad de ledger en PG17 real

- `15bc7f6d321c4efd6c1018e05063473eb8a8fb6a`: el gate de escritor canónico ejecuta `UPDATE` y `DELETE` directos sobre un intento económico real y exige que ambos sean rechazados por PostgreSQL. Cada operación se encapsula en `SAVEPOINT` y se restaura mediante `ROLLBACK TO SAVEPOINT`; se vuelve a leer el fingerprint original para comprobar que no hubo alteración.
- Se revalida la exclusión de cotización caducada y se conserva rollback integral de la transacción fixture. **No se introduce limpieza destructiva del ledger**. Este gate debe verificarse contra el HEAD exacto en GitHub Actions.

### Hallazgo CI: cotizaciones también son append-only

- Los workflows del HEAD `d95705944f8572ac58fe3ff1be52ac1072c68af6` fallaron con `catalog_ledger_append_only` (SQLSTATE 23514) al intentar `UPDATE sabora.catalog_displayed_quotes SET expires_at=...` en la prueba de escritor real. Los otros siete subtests pasaron.
- `6bc8bcdc739dbcf4e3bf24f35bbca652d8af70aa` retira esa mutación de prueba: la caducidad no se debe simular editando un registro de evidencia económica protegido. Se mantiene el test de integridad de ledger con `SAVEPOINT` y rollback y se preserva el registro de cotización original.
- No se altera el trigger, la migración ni la política append-only. Validación del nuevo HEAD pendiente.

### Ruta positiva real del coordinador con QR, sesión y visita

- `036e5754bb10d4a13ccc3472a61c66f86f1f46d6` añade al test Node+PostgreSQL 17 un fixture **confirmado exclusivamente en el contenedor Docker efímero de CI**: mesa abierta con hash de QR, perfil de cliente, hash de sesión, visita con versión de QR vigente, artículo publicado con snapshot validable y cotización económica persistida.
- Invoca `createCatalogOrderConfirmationPoolCandidate` con `pg.Pool` real, espera `confirmed`, repite la misma petición y espera `replayed`, rechaza un cambio de cantidad bajo la misma clave idempotente y rechaza un QR erróneo aun con pedido ya confirmado. Verifica exactamente una orden, una línea de cocina y un intento económico.
- A diferencia de los fixtures negativos anteriores, estos registros deben ser visibles desde conexiones diferentes: se confirman en la **base desechable** antes de llamar al coordinador y el contenedor/volúmenes se eliminan al finalizar el shell. No se permite ejecutar este test en una base operativa ni borrar el ledger.
- **Pendiente:** verificar CI exacto del commit; ampliar con repricing/aceptación y concurrencia real de confirmaciones. No conectar HTTP, permisos runtime, Supabase operativo ni VPS.

### Concurrencia positiva real en el pool PG17

- `c56be46d52e6a245f73ca983e130701b95f75d9f`: el fixture positivo añade tres confirmaciones simultáneas del mismo contexto autorizado y una clave idempotente nueva sobre el pool real (`max:4`). Debe producir exactamente un `confirmed`, dos `replayed`, el mismo UUID de pedido y una sola fila de orden y ledger para la clave.
- La comprobación prueba el lock advisory transaccional y el replay de la ruta compuesta, no solo una consulta SQL aislada. Es una prueba exclusivamente de Docker PG17 efímero. Se mantiene sin conexión HTTP ni Supabase operativo.
- No declarar el gate verde hasta inspeccionar las ejecuciones de Sabora CI y Bootstrap del HEAD exacto. El siguiente bloque es consentimiento explícito de repricing y revocación de acceso.

### Repricing firmado: prueba integrada con PG17

- `a833f12763bf47df59a27424f50f3e1eccba2fa2` extiende el fixture autorizado: republica un plato de 1200 a 1600 céntimos con `sabora.publish_catalog_item`, manteniendo inmutable la cotización previa.
- El coordinador debe devolver `acceptance_required` sin insertar pedido, luego acepta exclusivamente un token HMAC emitido para el mismo actor, cesta, artículo, revisión, selección y cantidad; un cambio de cesta se rechaza. Tras consentimiento se confirma el pedido, se repite idempotentemente y se comprueba `accepted_reprice=true` y evidencia de 1600 céntimos en el ledger real.
- Todo permanece en el PostgreSQL 17 de Docker efímero de GitHub Actions. Es prueba candidata; no equivale a activar el flujo HTTP ni a desplegar. Inspeccionar resultado del HEAD exacto y corregir cualquier regresión antes de considerar el gate cerrado.

### Rechazos de consentimiento en PG17 real

- `12268d02ea6f944ba952695663103fd7127f2a26`: amplía el caso de cambio de precio con tokens HMAC caducados, emitidos para otro actor, emitidos para otra cesta y manipulados. Cada uno debe producir `acceptance_required` sin insertar intento económico ni consumir la clave idempotente. Después, el token correcto debe confirmar y registrar la evidencia.
- Los rechazos se ejecutan sobre el mismo contexto autorizado, sin confiar en datos económicos del cliente. No se modifican tablas de cotizaciones inmutables.
- CI del HEAD pendiente; no activar HTTP, roles runtime, migraciones operativas, merge ni VPS.

### Decisión de producto: Estudio de imágenes con IA de Google (2026-10-23)

- Documento normativo añadido: `docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md` (commit `4e7f9accb8c070a199c403f326130a99aa47243f`).
- Proveedor restringido al ecosistema **Google**: Gemini con edición/generación de imágenes mediante API Google, con evaluación de Vertex AI si conviene en producción. Modelo y versión configurables y pendientes de verificación.
- Estudio dentro de Administración → Catálogo; conserva original, genera derivados, compara versiones y exige aprobación/publicación manual. Prohibido añadir ingredientes o modificar el plato; la fidelidad se verifica humanamente.
- Credenciales y llamadas solo en backend; control de acceso, cuotas/costes, auditoría, almacenamiento privado, límites de archivos y ausencia de envío de datos personales. Formatos previstos 5:4, 4:3 y 1:1.
- **No está implementado ni conectado**; no se autorizan migraciones operativas, despliegue, merge ni cambios en Fleetia.

### Encargo corregido y vigente para Codex Desktop — PWA administrativa completa (2026-10-23)

- Se detectó y corrigió el error documental: la asignación anterior limitaba indebidamente Codex al Estudio de imágenes. Queda **sustituida**.
- Fuente de verdad del encargo: `docs/architecture/SABORA_ADMIN_PARALLEL_CODEX_WORK_ORDER.md` (introducido en commit `52febf387e138bc869faef5a315ff2ad33b5438d`). El contrato `docs/architecture/SABORA_AI_IMAGE_STUDIO_GOOGLE.md` describe solo el submódulo fotográfico.
- Codex: **frontend completo** de `apps/management/**` — Resumen, Carta/Catálogo y Estudio de imágenes, Mesas y QR, Comandas, Equipo; priorizar Mesas/QR y Catálogo/Estudio. Respetar **estilos visuales aprobados** sin crear diseño nuevo; sin APIs, datos operativos ficticios ni operaciones no conectadas.
- Asistente principal: backend, cliente, PostgreSQL 17, seguridad, contratos, visitas, pedidos y QR. No solapamiento de archivos. Codex usa rama propia y PR Draft con base `feat/sabora-pnpm-bootstrap`; documenta en `docs/design/SABORA_ADMIN_UI_CODEX_HANDOFF.md`.
- Sin merge, despliegue, Supabase operativo, VPS, Fleetia, secretos ni Gemini real. Verificar build/tests/CI por SHA exacto antes de declarar validación.

### Regresión de revocación de contexto antes de replay (2026-10-23)

- Commit `48d996ed3c8a91e3807d6081211a19ed56633666`: nuevo `tests/catalog-confirmation-context-revocation.test.mjs` en el conjunto ejecutado por `pnpm test`.
- Pruebas de frontera del coordinador: QR revocado, mesa pausada, visita cerrada, discrepancias de visita, actor y cesta. En cada caso `order_context_forbidden` debe producirse **antes** de consultar idempotencia o escribir. Caso positivo de orden de llamadas: contexto → replay → catálogo, con catálogo no disponible.
- Esta regresión usa **adaptador simulado** y no demuestra que las funciones SQL reales revoquen correctamente un QR o cambien estados. Próximo hito: pruebas de revocación/rotación/mesa pausada/visita cerrada en PostgreSQL 17 efímero y verificación del resultado de GitHub Actions sobre el HEAD exacto.
- Se preserva el reparto: Codex solo `apps/management/**` conforme al encargo vigente; asistente principal mantiene pruebas/backend. Sin despliegue, merge, cambios en Supabase operativo o VPS.

### Gate integrado de revocación en PostgreSQL 17 desechable (2026-10-23)

- Commit `76dfd53f9c39359669459373c2fa169422ed320e`: extensión del test de coordinador en `scripts/ci/catalog-postgres17-driver-integration.test.mjs`, sobre el mismo fixture autorizado de pedido confirmado, replay, concurrencia y repricing.
- Casos añadidos sobre PostgreSQL real: pausa indefinida bloquea nuevas claves y replay; pausa vencida permite replay; rotación del hash/version QR invalida token anterior y autorización de visita aunque se use el token nuevo; cierre de mesa cambia sesión, revoca visita y bloquea replay; reapertura no resucita la visita anterior. Se verifica que los intentos económicos append-only no crezcan ante cada rechazo.
- La prueba es **candidata pendiente de ejecución CI**; no afirmar éxito hasta observar Sabora CI del SHA exacto. No aplica migraciones en Supabase operativo ni usa VPS. Codex continúa en frontend administrativo independiente.

### Resultado CI y defensa adicional de sesión de cliente (2026-10-23)

- Para el HEAD `0f3bd5ef3318c0974bd6915df969bbbb0ad99405`: **Sabora CI 39939456864 SUCCESS** y **Bootstrap 39939456843 SUCCESS**. El gate PG17 de pausa/rotación/cierre quedó validado por el workflow que ejecuta `scripts/ci/catalog-postgres17-node-driver-smoke.sh`.
- Commit `1dbd581b145c0c02790f5ff28278d3d13630cf38`: caso adicional de defensa en profundidad que revoca el bearer de sesión del cliente después del cierre/reapertura y verifica rechazo de replay y de una clave nueva, sin alterar el ledger económico original. Este caso comparte una visita ya revocada: **no demuestra por sí solo el aislamiento de revocación de bearer con visita activa**. Esa prueba independiente sigue pendiente.
- Validación del nuevo SHA aún pendiente. No se ha realizado despliegue, merge ni cambio operativo en Supabase/VPS.

### Revocación independiente de bearer con visita todavía activa (2026-10-23)

- Commit `de46802ecda1b39f5db15f09c22c1b81829d33a9`: nuevo test integrado en `scripts/ci/catalog-postgres17-driver-integration.test.mjs` para aislar la causa de rechazo del token de sesión de cliente.
- Fixture PG17 efímero, con transacción revertida al terminar: mesa `open`, QR vigente, visita sin revocar y sin caducar, sesión de cliente inicialmente válida. Primero `lockContext` devuelve `authorized=true` y `canOrder=true`; luego se revoca únicamente `customer_sessions.revoked_at`, se comprueba que mesa, QR y visita permanecen vigentes, y `lockContext` debe devolver ambos flags `false`.
- El test prueba autorización del repositorio de visitas, no una ruta HTTP operativa. CI del SHA exacto pendiente; prohibido extrapolar éxito hasta confirmación. Codex conserva frontend administrativo sin solapamiento.

### Gate de caducidad independiente de visita y sesión (2026-10-23)

- Resultado verificado del commit `d1d62f7dafecc1da9ad480135b7995e603d7e2a8`: **Sabora CI 39939947192 SUCCESS** y **Bootstrap 39939947202 SUCCESS**. Incluye el caso de bearer revocado con visita activa.
- Commit `3afc1e165b9f4dba05af0303fcc0695013728933`: nuevo caso PostgreSQL 17 efímero, `scripts/ci/catalog-postgres17-driver-integration.test.mjs`, que verifica por separado expiración de `customer_table_visits.expires_at` y de `customer_sessions.expires_at`, partiendo de un acceso válido. El fixture restaura la visita antes de caducar el bearer y verifica que la mesa sigue abierta y la visita no está revocada. Rollback final, sin Supabase operativo.
- **Pendiente:** comprobar GitHub Actions para este nuevo HEAD. Este gate solo demuestra el repositorio de autorización; no habilita HTTP ni producción. Codex conserva exclusivamente `apps/management/**`.

### Carrera real entre pausa de mesa y autorización (2026-10-23)

- Commit `adb955220e46316bd8d57ae72fac695c9e884ec8`: nuevo caso PG17 sobre dos conexiones independientes del pool. Crea mesa abierta y visita válida en Docker efímero, retiene en la transacción A el lock de UPDATE que pausa la mesa, y lanza en la transacción B `createCatalogVisitContextRepository().lockContext`. La lectura de autorización debe esperar el lock, y tras COMMIT de la pausa debe devolver `authorized=false`, `canOrder=false`. Se comprueba estado persistido `paused`.
- Esta prueba comprueba el orden transaccional **pausa antes de autorización**, no todos los posibles interleavings ni una confirmación HTTP. La tabla fixture queda exclusivamente en contenedor PG17 desechable, sin producción.
- El gate de caducidad del commit `7dc21d08dc3662498482063d94d7f30caca1f06c` seguía en curso al comenzar este bloque. **Nuevo SHA pendiente de CI**. No atribuir SUCCESS sin consultar los resultados.

### Corrección tras fallo real de CI: restricción de duración de visita (2026-10-23)

- El HEAD `7dc21d08dc3662498482063d94d7f30caca1f06c` **falló** en Sabora CI `39940306394` y Bootstrap `39940306251` en el paso de driver PG17: `customer_table_visit_lifetime` (SQLSTATE `23514`). Las diez pruebas anteriores pasaron; falló la prueba nueva de expiración de visita.
- Fuente de verdad: migración `20261021240000_sabora_customer_table_visits_candidate.sql` exige `expires_at > granted_at`. El fixture intentaba escribir expiración anterior a `granted_at`, un estado imposible. Corregido en commit `1536a9e3df62d0788af1c5d94c48e5f7a45309a7`: modelar visita concedida hace dos horas y caducada hace un minuto, conservando el invariante. Sin alterar la migración ni el modelo.
- Se añadió en paralelo prueba de carrera pausa/autorización (commit `adb955220e46316bd8d57ae72fac695c9e884ec8`), aún no validada. Inspeccionar CI del nuevo HEAD antes de declarar gate verde.

### Segundo diagnóstico de CI: duración de sesión de cliente (2026-10-23)

- HEAD `0b5f44b8e3cd7d2b1cbbd314835b74be8fa3706a`: Sabora CI `39940617788` y Bootstrap `39940617773` fallaron en el mismo test de expiración, ahora por `customer_session_expiry_check` (SQLSTATE `23514`). **11 de 12 subtests PG17 pasaron**, incluida la carrera entre pausa y autorización.
- Commit `53966f7e7f52e102e4c1c38729028518f665a6b6`: el fixture de sesión caducada actualiza `created_at` a dos horas atrás y `expires_at` a un minuto atrás, sin relajar el esquema. Resultado CI del commit pendiente.

### Gate verde de expiración y concurrencia (2026-10-23)

- HEAD `3f79d4d87b9ee9664650ed548602e1b6ab135946`: **Sabora CI 39941886186 SUCCESS** y **Bootstrap 39941886176 SUCCESS** (GitHub Actions). Incluye 12 pruebas reales del driver PG17, entre ellas caducidad independiente de visita y bearer y carrera pausa/autorización.
- La solución respeta los constraints `customer_table_visit_lifetime` y `customer_session_expiry_check` sin cambios en migraciones. No hay despliegue, merge, alteración de Supabase operativo ni intervención sobre Fleetia.
- Próximo bloque: analizar los interleavings inversos y posibles puntos de integración con API sin tocar la interfaz administrativa asignada a Codex. Evitar presentar el gate PG17 como prueba HTTP extremo a extremo.

### Carrera inversa y fallo transitorio de Docker Hub (2026-10-23)

- HEAD `3f20be344d876211411e9c9a806db9a7991ad0ce`: Bootstrap `39942134392` **SUCCESS**, Sabora CI `39942134407` **FAILURE** en `Build isolated Sabora API image`, al consultar `node:22-alpine` desde Docker Hub (HTTP 502 de `registry-1.docker.io`). El log confirma pasos anteriores de PG17, tests y build correctos; **no es un fallo demostrado de la aplicación**. Se mantiene pendiente un gate CI completo verde.
- Commit `fca28b3b550a69bf334bb4e2e93a319f63a9515a`: prueba PostgreSQL 17 de orden inverso: transacción A mantiene el lock de autorización válido sobre mesa abierta; transacción B intenta pausar mesa y debe bloquearse; tras COMMIT A, B completa el cambio, y una nueva autorización debe resultar denegada. Fixture efímero; no prueba endpoint HTTP.
- El test inverso está pendiente de CI. No se cambió Dockerfile, infraestructura operativa ni el frontend de Codex. No hacer merge/despliegue.

### Recepción de Codex Desktop — PR #3, conciliación pendiente (2026-10-23)

- Codex declara terminado su trabajo de frontend administrativo: PR Draft [#3](https://github.com/jdlc86/CartaViva/pull/3), rama `feat/sabora-management-ui`, HEAD `f724753f9d89df58ef662737fec8c95126a3e057`. Informe de entrega: `docs/design/SABORA_ADMIN_UI_CODEX_HANDOFF.md` (en rama Codex).
- Se inspeccionaron metadatos y diff del PR #3: 17 archivos, exclusivamente `apps/management/**` y `docs/design/SABORA_ADMIN_UI_CODEX_HANDOFF.md`. No hay solapamiento de archivos con el bloque backend/CI que desarrolla el asistente principal.
- GitHub devuelve `mergeable=false` para el PR #3 con base `feat/sabora-pnpm-bootstrap`. Su base SHA observada `7dc21d08dc3662498482063d94d7f30caca1f06c` es anterior al HEAD actual. **No fusionar automáticamente**; primero conciliar historia y comprobar conflictos y CI del árbol integrado. Conservar PR Draft.
- El fallo PG17 `customer_session_expiry_check` descrito en el handoff de Codex correspondía a una versión anterior de la rama base. El commit `3f79d4d87b9ee9664650ed548602e1b6ab135946` pasó Sabora CI `39941886186` y Bootstrap `39941886176`. Un fallo posterior de Sabora CI `39942134407` correspondió a HTTP 502 de Docker Hub al resolver `node:22-alpine`, no al frontend.
- El frontend entregado es **no operativo**: mutaciones administrativas bloqueadas hasta existir contratos backend autorizados. No inventar endpoints ni activar botones. Mantener prohibición de despliegue, merge a rama principal, cambios en Supabase operativo o VPS sin autorización.

### Paralelismo autorizado con Codex, fase 2 Estudio de imágenes (2026-10-23)

- El usuario confirma que ha encargado a Codex la segunda fase visual del Estudio de imágenes. Hasta recibir su SHA e informe final, **no modificar `apps/management/**` ni conciliar/fusionar PR #3**.
- El desarrollo principal continúa en backend, pruebas PG17 y documentación de contratos existentes. Evitar implementar endpoints de imágenes o integrar Google sin diseño, autorización, aislamiento y presupuesto confirmados.
- Estado verificado de HEAD `6aa884920590b28009df1d965c5e6640326f6458`: Sabora CI `39942799320` SUCCESS y Bootstrap `39942799369` SUCCESS. El test de carrera inversa PG17 añadido en `fca28b3b` queda incluido en ese gate verde.
- Próxima conciliación tras Codex: verificar diff, actualizar base, resolver conflictos, validar contratos reales, probar CI del árbol integrado. No desplegar ni afectar Fleetia.

### Prueba concurrente de cierre de mesa (2026-10-23)

- Commit `88203fe0f019f173f8babb0885d9e3af9b13e70a`: añade a `scripts/ci/catalog-postgres17-driver-integration.test.mjs` la carrera inversa entre una autorización ya bloqueada en transacción A y el cierre de la mesa en B. Verifica que B espera, después cambia `session_id`, el trigger revoca la visita antigua y la autorización posterior falla.
- Usa PostgreSQL 17 desechable y credenciales de prueba efímeras; no introduce grants, endpoint runtime ni cambios operativos.
- **CI del nuevo test pendiente de confirmación**; no confundir con el gate verde previo de `6aa88492`. Codex sigue encargado del Estudio de imágenes; no tocar `apps/management/**` ni conciliar todavía.

### Revocación concurrente de bearer (2026-10-23)

- Gate verde confirmado del HEAD `2cacec3b60879a82738d5c24996a0934962fd4d1`: Sabora CI `39943441044` SUCCESS y Bootstrap `39943441049` SUCCESS, incluida la carrera de cierre de mesa.
- Commit `f7d79fa8f5e8f62433aafcc1e70953755bf0ae22`: test PG17 que retiene la autorización válida en transacción A mientras B intenta revocar el bearer de cliente. El `FOR SHARE OF s` debe hacer esperar la revocación hasta COMMIT A; después la sesión revocada debe negar la siguiente autorización, aunque la mesa continúe abierta. Nuevo gate CI pendiente.
- Este test prueba serialización SQL y no equivale a un endpoint de revocación operativo. No intervenir en interfaz de Codex ni en Supabase operativo.

### Gate verde de revocación y nueva carrera de rotación QR (2026-10-23)

- HEAD `b7fbca5036fb8d43ecaf34ac83716f35bc00d48f`: Sabora CI `39943795832` SUCCESS y Bootstrap `39943795827` SUCCESS; se acredita la carrera de revocación del bearer.
- Commit `a2cdcf2f2875eaaac358412fd53bba6a7eba9061`: test PG17 de rotación QR mientras una autorización de visita retiene el lock de mesa. Exige que la rotación espere, que el QR anterior sea rechazado y que la visita con versión anterior no funcione tampoco con el QR nuevo. Mantiene la mesa abierta. Gate del nuevo test pendiente.
- Todas estas son pruebas de candidato backend, no contratos HTTP desplegados. No modificar `apps/management/**` mientras Codex trabaja.

### Restricciones SQL de visitas y gate QR (2026-10-23)

- Gate del HEAD `2d980b6cded55047454a27169d99ce0a98f90ecd`: Sabora CI `39945296804` SUCCESS; Bootstrap `39945296830` SUCCESS. Carrera de rotación QR acreditada.
- Commit `dbdb11e6feb17612a2b183b460c43e32ceb08ddf`: regresión PostgreSQL 17 de restricciones `visit_key`, `actor_id` y `customer_table_visit_lifetime`, con SAVEPOINT y rollback parcial tras cada error SQL para comprobar que no quedan visitas inválidas. Gate de este commit pendiente.
- Mantener separadas las candidatas SQL y el runtime, y no tocar `apps/management/**` hasta entrega de Codex.

### Revocación selectiva de visita y gate de restricciones (2026-10-23)

- HEAD `592bfbc3a96f547f54d766a1834cfa2ef6a27b5b`: Sabora CI `39945657370` SUCCESS, Bootstrap `39945657379` SUCCESS, incluidas restricciones SQL de visitas y recuperación por SAVEPOINT.
- Commit `344d74272b16f901b8a3f7eecacb9523cb81f76a`: prueba PG17 de revocación selectiva; dos visitas válidas de la misma mesa y mismo cliente se autorizan independientemente, revocar la primera no revoca la segunda. El gate CI de esta nueva prueba queda pendiente.
- No se añade API de revocación ni grants. Continuar sin tocar la interfaz de Codex.

### Reapertura de mesa y frontera de ocupación (2026-10-23)

- Commit `28c1a89428c6c764b859d0dd5e17455096fc970b`: prueba PG17 de ciclo abierto → cerrado → abierto, con visita antigua inicialmente válida. Comprueba rotación de `session_id`, revocación duradera y rechazo de visita antigua incluso después de reabrir la mesa. No se crea writer HTTP ni grants.
- El gate del commit `9ec9b511300ea4c836bea3bdca5d97efd0291138` seguía `in_progress` en la última consulta; no atribuirle SUCCESS sin verificar. El nuevo test también necesita su propio gate.
- Continúa el aislamiento del trabajo de Codex en `apps/management/**`, sin conciliación prematura ni despliegues.

### Caducidades independientes de visita y bearer (2026-10-23)

- Commit `9f840d6dd497dffd49d86fb94bedc8fc49823717`: prueba PG17 con visita y sesión inicialmente válidas; primero caduca la visita mientras el bearer sigue vigente y se rechaza; después se restaura únicamente el vencimiento de visita en el fixture y caduca el bearer, comprobando rechazo independiente. No modifica el contrato ni expone endpoint.
- En la última consulta, Sabora CI `39946779829` y Bootstrap `39946779702` del commit `540532fb` seguían en ejecución; el nuevo test queda pendiente de su propio gate.
- Se conserva aislamiento de Codex y prohibición de despliegue.

### Corrección del gate PG17 de caducidad independiente (2026-10-23)

- CI de HEAD `83ff79a9c7fbacbdc46c6e55e9e31cb6e21d31d6` falló: 19/20 tests PG17 pasan; el test de caducidad independiente intentó retroceder `expires_at` de `customer_sessions` sin ajustar `created_at`, infringiendo `customer_session_expiry_check`. Bootstrap también figuraba FAILURE en ese SHA.
- Commit `7e322d5bbe9be492984410f862aa47a20d74449b` corrige únicamente el fixture: al simular sesión expirada se retrocede `created_at` dos horas, manteniendo `expires_at` un minuto en el pasado. **No se relaja ninguna restricción SQL**.
- Verificar el nuevo CI antes de declarar verde. Evitar ediciones concurrentes sin volver a leer SHA del archivo.
