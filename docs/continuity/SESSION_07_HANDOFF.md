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
