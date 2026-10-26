# Auditoría global de PR y plan de saneamiento — 2026-10-26

**Ámbito:** únicamente `jdlc86/CartaViva`. Auditoría de metadatos, topología Git, listados de archivos y ejecuciones GitHub Actions. **No** es equivalencia semántica ni revisión exhaustiva de código.

## Snapshot verificado

- Diez PR abiertas, todas Draft: #1, #2, #4, #5, #7, #8, #10, #11, #12 y #13.
- Doce ramas, incluida `main`; HEAD de `main`: `42b46358a7`.
- PR #13: HEAD `5a24a1136f8cfefa5bf9344d7eae8b4318e3b17b`, base `integration/sabora-order-management-review` (#7). Este HEAD incluye un commit documental posterior a la revisión independiente del snapshot de código `c1dceba1cb8f8975a3c13c6c56a263f8352d0c81`.
- Últimos workflows para HEAD #13: Sabora CI `40266420041` SUCCESS y Bootstrap lockfile `40266420109` SUCCESS.
- PR #2: 1789 commits y 367 archivos cambiados según metadatos GitHub. El listado de archivos consultado fue paginado y **no** acredita por sí solo el origen de todos los commits.
- Mergeability observada: #4, #8 y #11 `dirty`; #2, #7, #12 y #13 `clean`; #1, #5 y #10 `unknown`. Estos estados pueden cambiar.
- `main` figura `protected=false` en listado de ramas. La lectura del endpoint de protección devolvió HTTP 403 para la integración; el endpoint de rulesets visibles devolvió `[]`. No se ha alterado ninguna configuración.

## Grafo de bases de PR

- #1 -> `main`.
- #2 -> rama de #1.
- #4 y #5 -> rama de #2.
- #7 -> rama de #2.
- #8, #10, #11 y #13 -> rama de #7.
- #12 -> rama de #11.

**Advertencia:** `mergeable=true` solo se refiere a la base declarada, **no** acredita que la cadena completa se pueda integrar en `main` sin conflictos ni autoriza hacerlo.

## Matriz de inclusión por ancestros (comparaciones GitHub)

Comparación `PR origen...HEAD #13`:

| Origen | Estado Git | Ahead de #13 | Behind de #13 | Interpretación |
| --- | --- | ---: | ---: | --- |
| #4 | diverged | 688 | 4 | Los 4 commits de #4 no son ancestros de #13 |
| #5 | diverged | 485 | 11 | Los 11 commits de #5 no son ancestros de #13 |
| #8 | diverged | 278 | 2 | Los 2 commits de #8 no son ancestros de #13 |
| #10 | ahead | 260 | 0 | HEAD #10 es ancestro de #13 |
| #11 | ahead | 82 | 0 | HEAD #11 es ancestro de #13 |
| #12 | ahead | 62 | 0 | HEAD #12 es ancestro de #13 |

**Importante:** la ausencia de ancestralidad de #4, #5 y #8 **no prueba** que falte su funcionalidad. Puede haber cherry-picks, reimplementación o reconciliación. Tampoco la ancestralidad demuestra que no existan regresiones posteriores. No cerrar ni eliminar esas ramas sin una matriz de equivalencia por comportamiento y pruebas.

## Saneamiento por bloques completos

### Bloque A — equivalencia funcional verificable
1. Contrastar archivos y comportamiento de #4/#5 con #7/#13 (operaciones, tablero, historial, catálogo, mesas, permisos y pruebas). Registrar cada delta: preservado, reemplazado con evidencia, ausente o pendiente.
2. Contrastar #8 con #13 (capacidad HMAC, binding del actor, seguridad SQL, RLS y denegaciones), incluyendo diferencias de migraciones y pruebas reales PostgreSQL 17.
3. Confirmar que las aportaciones de #10/#11/#12, aunque ancestrales, siguen funcionando en #13, y revisar cobertura del trabajo de UI de #3 si ya fue cerrado.
4. Revisar el historial y tamaño de #2 contra su base, sin reescritura destructiva.

### Bloque B — consolidación Git
1. Mantener la cadena #1 -> #2 -> #7 -> #13 hasta aprobar un plan de incorporación a `main`; evitar cambiar bases sin validar la nueva comparación.
2. Proponer cierre **sin borrado** de PR redundantes solo cuando se demuestre equivalencia; conservar enlaces, SHA, trazabilidad y evidencia.
3. Si hay deltas faltantes, implementarlos en rama dedicada, con pruebas y revisión independiente, antes de cerrar su PR original.
4. No confundir la documentación normativa con documentos de continuidad; no inventar decisiones para desbloquear funcionalidades.

### Bloque C — gobierno y verificación
1. Proponer a la persona propietaria protección de `main` y checks requeridos; no aplicar cambios de configuración sin confirmar capacidades y autorización.
2. Ejecutar CI y PostgreSQL 17 desechable sobre cualquier commit de consolidación.
3. Actualizar este informe con matriz de equivalencia, resultados y decisiones de cierre; mantener Draft y gates operativos.

## Puertas no superadas

No hay autorización para merge, despliegue, activación de endpoints, grants positivos, claves de producción ni cambios en Supabase operativo. Prohibido modificar Fleetia, VPS y recursos de otros proyectos. La revisión Codex de #13 cubrió el SHA de código `c1dceba1cb`, no esta rama documental ni un futuro código reconciliado.

## Bloque A — inventario de blobs verificado (2026-10-26)

Se consultaron los árboles Git completos (`git/trees?recursive=1`) de HEAD #4, #5, #8 y del snapshot de integración #13 `5a24a1136f`, junto con los archivos cambiados por cada PR respecto a su base. **No** se comparó solo el diff de #13: ese diff excluye archivos heredados de su base y produciría falsos «ausentes».

| PR origen | Archivos cambiados en PR | Mismo blob SHA en #13 | Presentes pero modificados en #13 | Ausentes de árbol #13 |
| --- | ---: | ---: | ---: | ---: |
| #4 | 23 | 6 | 17 | **0** |
| #5 | 20 | 17 | 3 | **0** |
| #8 | 21 | 4 | 17 | **0** |

**Resultado:** los 64 archivos afectados por esas tres PR existen en el árbol de #13. No se ha demostrado equivalencia de comportamiento de los archivos modificados; tampoco se ha identificado pérdida de archivos.

### Evidencia de igualdad exacta

- #4: `order-operations-gateway.{js,d.ts}`, `order-operations-model.{js,d.ts}`, migración `20261023225024_sabora_kitchen_waiter_operations_candidate.sql` y `tests/order-operations-sql.test.mjs` tienen el mismo blob.
- #5: 17/20 blobs iguales, incluidos modelos de lectura de mesas/catálogo, vistas `CatalogView.tsx` y `TablesView.tsx`, componentes `Icon`/`Primitives` y sus tests. Difieren `main.tsx`, `style.css` y `SABORA_ADMIN_UI_CODEX_HANDOFF.md`.
- #8: 4/21 blobs iguales, entre ellos `order-operation-capability.mjs` y `tests/order-operation-capability.test.mjs`; 17 archivos de frontera SQL/operaciones cambiaron posteriormente.

### Pendientes que impiden cerrar PR

1. #4: comprobar comportamiento actual de `OrdersView.tsx`, transiciones, permisos y contratos de SQL, y que los cambios respecto al origen son endurecimientos compatibles.
2. #5: comprobar integración de navegación/estilos en `main.tsx` y `style.css`, incluida experiencia responsive y guardias de lectura.
3. #8: demostrar que el actor SQL y las capacidades HMAC conservan el contrato, con pruebas de suplantación, caducidad y revocación en PostgreSQL 17.
4. #10/#11/#12: la ancestralidad ya está verificada; validar regresiones sobre HEAD final antes de cualquier cierre.
5. #2: auditar la razón de los 1789 commits y la integración a `main` sin reescribir historia ni fusionar.

**CI de la rama documental del PR #14:** Sabora CI run `40267068061` terminó SUCCESS. Esta prueba no sustituye el análisis semántico pendiente.

**Decisión:** conservar todas las PR existentes en Draft. Ninguna se cierra o fusiona basándose exclusivamente en esta matriz.

## Bloque B — verificación dirigida de integración de interfaz y controles (2026-10-26)

Se inspeccionó el contenido real de `apps/management/src/main.tsx` en #5 y #13:

- La estructura de navegación, `parseManagementArea`, `toManagementHash`, `tablesGateway`, `catalogGateway`, `CatalogView` y `TablesView` se conservan en #13.
- #13 incorpora adicionalmente el tipo `OrderOperationsGateway`, la propiedad opcional `operationsGateway` y el paso de esa propiedad a `OrdersView`. El montaje por defecto sigue llamando a `<ManagementApp/>` sin inyectar ningún gateway; por tanto **no acredita activación operativa**.
- Las vistas `CatalogView.tsx` y `TablesView.tsx` y sus pruebas de modelos de lectura tienen blob idéntico al #5. La hoja `style.css` es distinta, y la regresión visual responsive no queda certificada por una comparación de SHA.
- En #4 frente a #13, los módulos de transporte y modelo de operaciones son idénticos, mientras que `OrdersView.tsx` y las capas HTTP/SQL se modificaron. El cambio exige prueba de comportamiento, no copia directa del código antiguo.
- En #8 frente a #13, la implementación de `order-operation-capability.mjs` y su test de capacidad conservan SHA idéntico. El preflight SQL y las composiciones posteriores difieren; el gate normativo de activación sigue cerrado.

### Estado de la evidencia automatizada

- El HEAD documental #14 `33611ec1c6fe447d132153c135fdc66d0901fef3` pasó Sabora CI run `40267579456`.
- La suite completa PostgreSQL 17 (87/87) y el check raíz (895/895) corresponden al snapshot de código #13 `c1dceba1cb`, según el informe de cierre; no se han vuelto a ejecutar localmente en esta auditoría.
- **No** se declara equivalencia funcional completa, ni se cierran PR #4, #5 o #8 por estas pruebas documentales.

### Conclusión operativa

La integración de navegación y lectura de #5 está preservada a nivel de código inspeccionado; las interfaces de operaciones de #4 están presentes, pero su comportamiento modificado requiere pruebas. El contrato de capacidad de #8 conserva su módulo base exacto, pero el preflight SQL debe mantenerse sujeto a revisión y pruebas de seguridad. Antes de archivar PR se requiere la matriz final de casos de aceptación y una revisión de diferencias semánticas de los archivos no idénticos.

## Bloque C — genealogía de integración y tamaño de PR #2 (2026-10-26)

Comparaciones de GitHub entre SHA de base y cabeza de la cadena:

| Tramo | `ahead_by` | `behind_by` | Estado |
| --- | ---: | ---: | --- |
| `main` -> #1 | 26 | 0 | ahead |
| #1 -> #2 | 1789 | 0 | ahead |
| #2 -> #7 | 247 | 0 | ahead |
| #7 -> #13 | 234 | 0 | ahead |

Los cuatro tramos son linealmente descendientes según el servicio de comparación: **no existe divergencia de ancestros en esta cadena**, aunque esto no garantiza aprobación normativa ni ausencia de conflictos futuros tras cambios en `main`.

El endpoint de commits de PR #2 expuso páginas de 100, 100 y 50 commits, y la cuarta página vacía. Esta enumeración de 250 commits **no concuerda con el contador de 1789** informado por el recurso PR y por la comparación GitHub. No se asume que los 250 sean el historial completo; la discrepancia puede deberse a un límite de enumeración del proveedor y queda registrada como **limitación de evidencia**. Las muestras visibles son commits temáticos de implementación, pruebas y documentación (aislamiento de pools, confirmación de comandas, transporte cliente, regresiones PostgreSQL). No se ha demostrado que los 1789 commits sean ajenos al proyecto ni que deban reescribirse.

### Reglas de integración propuestas

- Conservar la cadena de bases actual hasta completar revisión del contrato normativo, CI y cobertura de equivalencia.
- No hacer squash, rebase, force-push ni merge de #2 por su tamaño sin decisión explícita y un plan de preservación de trazabilidad.
- Separar los **bloqueos por conflictos de merge** (#4/#8/#11) de los **bloqueos por gates de producto** (#13), que tienen causas distintas.
- El saneamiento documental no autoriza cerrar PR redundantes: falta aún evidencia de equivalencia funcional y de seguridad para las 37 rutas con blobs distintos de #4/#5/#8.

## Bloque D — inspección de código de las puertas operativas (2026-10-26)

Se inspeccionaron las implementaciones actuales de `order-operations-composition.mjs`, `order-operations-http.mjs` y `OrdersView.tsx` del HEAD #13, contrastándolas con el gate normativo `SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md` y la decisión `SABORA_P0_ACTOR_SQL_BINDING_DECISION.md`.

**Confirmaciones de código:**

1. `registerOrderOperationsFromPools` es función privada del módulo; el registro público `registerVerifiedOrderOperationsFromPools` exige `issueTransitionCapability` y preflight SQL de ambos pools.
2. Existe además `registerVerifiedOrderTransitionsOnlyFromPools`, que valida aislamiento, autenticación y preflight de personal/operaciones antes de montar exclusivamente la ruta POST de transición. No registra tablero ni historial.
3. `order-operations-http.mjs` registra GET de tablero/historial solo cuando `transitionOnly=false`. El POST valida UUID, estado destino, correlación, cuerpo exacto de dos campos y rol verificado; usa `verifiedIdentity` y `verifiedStaff`, no un actor enviado por el cliente.
4. La PWA `OrdersView` acepta gateway opcional; sin gateway no carga datos operativos y muestra canal sin conectar. No hay un montaje automático de gateway en `ManagementApp` por defecto.
5. La documentación normativa de operaciones conserva el alcance `confirmed -> preparing -> ready -> picked_up`, sin confundir recogida con entrega ni habilitar cancelaciones.

**Punto de revisión abierto:** `registerVerifiedOrderOperationsFromPools` continúa siendo una exportación pública que puede montar GET/POST completos después de preflight de identidad. El documento normativo exige además grants/RLS y contrato de lectura autorizada antes de habilitar esa composición. **No se afirma que exista un bypass explotable**: se requiere comprobar si la validación de privilegios de lectura y el aislamiento del login son suficientes en todas las rutas y si existe alguna importación de producción. La existencia de la exportación no autoriza su uso.

**Estado:** evidencia estática de controles y fail-closed, no prueba dinámica de equivalencia ni autorización de producción. Se mantienen pendientes pruebas PostgreSQL 17 y revisión de la superficie de lectura.

## Bloque E — resolución del interrogante sobre el gate de lectura/operación (2026-10-26)

Se inspeccionaron los predicados de `apps/api/src/order-operations-identity-preflight.mjs` (líneas 177-209 y 226-254) y el registro de rutas en `order-operations-composition.mjs` y `order-operations-http.mjs`.

**Hallazgo de diseño, verificado estáticamente:**

- `registerVerifiedOrderOperationsFromPools` llama a `preflightOrderOperationsIdentities`, que inspecciona los dos pools con `allowAuthorizedTransition=false` y `allowStaffReader=false` por defecto.
- En ese preflight se exige `authorized_rpc_execute === false`, `accessible_private_tables === 0` y `accessible_private_definer_routines === 0` para cada principal. Por tanto, esta vía **no puede superar su propio preflight con un login que ya tenga el permiso positivo de transición**. Puede registrar rutas tras un preflight negativo, pero no constituye una vía autorizada de mutación operativa.
- `registerVerifiedOrderTransitionsOnlyFromPools` usa dos inspecciones explícitas: el lector de personal con `allowStaffReader=true` y el escritor de operaciones con `allowAuthorizedTransition=true`. Después registra únicamente POST con `transitionOnly=true`, sin tablero ni historial.
- El POST comprueba rol autenticado, forma exacta del cuerpo, línea, destino y correlación; no admite `actorUserId` ni rol del cliente.
- `server.mjs` no importa estos módulos, comprobación que también figura en `tests/order-operations-activation-gate.test.mjs`.

**Conclusión delimitada:** el riesgo inicial de una ruta completa con permisos positivos de transición queda mitigado por los predicados de preflight y la separación del registro de transición. No se certifica que el preflight negativo sea una frontera de lectura operativa completa ni se autoriza activar rutas. El contrato normativo sigue requiriendo diseño de lectura, grants/RLS, aprobación de claves y ensayos en PostgreSQL 17.

### Próxima aceptación necesaria

1. Ejecutar sobre PostgreSQL 17 desechable pruebas negativas de ambos modos de registro y verificar que la ruta de lectura no obtiene datos con el login de transición.
2. Validar que los roles no cambian entre preflight y uso del pool y que no existen permisos concedidos por otras vías.
3. Confirmar con pruebas de UI la no exposición de acciones sin gateway y la conservación de filtros/historial.
4. Mantener #4/#5/#8 en Draft hasta completar equivalencia semántica de archivos divergentes.

## Bloque F — trazabilidad de pruebas dinámicas existentes (2026-10-26)

Se inventariaron los nombres y aserciones de los tests de código del HEAD #13, **sin volver a ejecutarlos en esta sesión**:

- `tests/order-operations-composition.test.mjs`: 11 tests declarados; cubren rechazo temprano de pools/roles compartidos, falta de issuer, wiring criptográfico inválido, fallos de preflight de ambos principales y montaje solo después de verificar.
- `tests/order-operations-transition-only-http.test.mjs`: 3 tests declarados; comprueban que el modo `transitionOnly` monta POST sin GET de tablero/historial y que la opción exige booleano.
- `tests/order-operations-activation-gate.test.mjs`: 5 tests declarados; verifican ausencia de importación en `server.mjs`, capacidad SQL firmada y denegación de permisos indebidos.
- `scripts/ci/order-operations-identity-postgres17.test.mjs`: 18 tests declarados de PostgreSQL 17, incluidos suplantación SQL previa, preflight positivo del wrapper, rol de lectura exacto, caducidad tras locks, revocación, concurrencia, denegación de tablas, integración Fastify + login restringido y **denegación de tablero**.
- `scripts/ci/order-operations-postgres17-integration.test.mjs`: pruebas de ciclo completo, aviso de recogida, idempotencia, concurrencia, rollback y suspensión durante mutación.

**Distinción de evidencia:** existencia y lectura de estos tests es un hecho verificado en GitHub; los resultados `87/87` PG17 y `895/895` raíz son evidencia registrada en el cierre previo del SHA de código `c1dceba1cb`, no una ejecución nueva en esta auditoría. La CI de la rama documental #14 no equivale a repetir PostgreSQL 17 localmente.

### Decisión de saneamiento

La preocupación del bloque D sobre ausencia de pruebas del modo de transición está **parcialmente resuelta por pruebas ya existentes**, con casos de autenticación real y denegación de lectura. Se mantienen abiertos: equivalencia completa de los 37 archivos divergentes, evidencia visual responsive, revisión de cambios futuros respecto a SHA #13 y aprobación del contrato de lectura. Ninguna PR queda autorizada a cerrar por este inventario.

## Bloque G — equivalencia de interfaz y gates de UI (2026-10-26)

Inspección de `apps/management/tests/ui-contract.test.mjs` y `apps/management/tests/order-operations-behavior.test.mjs` en el HEAD #13:

- El contrato de UI tiene **9 tests declarados** que comprueban las cinco áreas, ausencia de fixtures operativos, red/persistencia/Google no autorizados, lectura explícita y descarte de respuestas obsoletas, navegación profunda, mesas/QR bloqueados, catálogo publicado de solo lectura, acciones privilegiadas deshabilitadas, estudio de imágenes local y tokens visuales con breakpoints `900px`/`460px`, foco y reducción de movimiento.
- El comportamiento de operaciones tiene **7 tests declarados**: agrupación de líneas y avisos durables, política de transiciones cocina/camarero, POST mínimo, recuperación tras recarga sin persistencia navegador, respuestas inválidas fail-closed, doble clic/cancelación/entrega bloqueados y correlación conservada ante resultado ambiguo.
- Estos tests comprueban propiedades estructurales y funcionales del código, **no constituyen una captura o inspección visual en navegador real**. No se atribuye una certificación responsive que no se ha realizado.
- Para #5, `CatalogView.tsx`, `TablesView.tsx`, sus modelos y tests conservan blobs idénticos a #13; `main.tsx` añade el gateway opcional de operaciones sin alterar navegación ni los gateways de lectura. `style.css` difiere y sigue pendiente una comprobación visual de regresión.

### Matriz de disposición segura por PR

| PR | Evidencia acumulada | Disposición recomendada ahora |
| --- | --- | --- |
| #4 | 23/23 rutas presentes; 6 blobs idénticos; 17 evolucionados; suite de operaciones disponible | **Mantener Draft** hasta cerrar equivalencia semántica |
| #5 | 20/20 rutas presentes; 17 blobs idénticos; navegación/gateways inspeccionados; 3 evolucionados | **Mantener Draft** hasta regresión visual y documentación |
| #8 | 21/21 rutas presentes; 4 blobs idénticos; preflight/SQL evolucionados y suite PG17 existente | **Mantener Draft** hasta contraste completo de seguridad |
| #10/#11/#12 | HEAD de cada PR ancestro de #13 según comparación GitHub | Candidatos a supersedidos, **no cerrar** sin decisión explícita |
| #13 | Consolidación de código y gates, CI previa favorable | **Mantener Draft**, sin merge/despliegue |
| #14 | Auditoría documental sobre #13 | **Mantener Draft**, sin cambios operativos |

No se han realizado cierres ni fusiones, ni se ha accedido a recursos de Fleetia o VPS.

## Bloque H — aceptación CI ejecutada y verificada (2026-10-26)

Se verificaron directamente en GitHub Actions los trabajos de la cabeza de integración #13 (`5a24a1136f8cfefa5bf9344d7eae8b4318e3b17b`):

- `Sabora CI` run **40266420041**: `completed/success`. Job `validate`: `success`. Steps `Test`, `Test Sabora migrations in disposable PostgreSQL 17`, `Exercise real Node pg driver against disposable loopback-only PostgreSQL 17`, `Build`, `Build isolated Sabora API image` y `Smoke-test API container without host port or shared network`: todos `success`.
- `Bootstrap Sabora lockfile` run **40266420109**: `completed/success`.
- Auditoría #14, commit `239415c36405a9ac9df4b0d44856d85d9be8c944`: `Sabora CI` run **40290117384**: `completed/success`.
- Auditoría #14, commit `223483f12cb2f33172cf0191b722cf28d5b1aa13`: `Sabora CI` run **40289942999**: `completed/success`.

**Alcance exacto:** son ejecuciones de CI reales y exitosas de GitHub, incluida PostgreSQL 17 desechable en #13. No se ejecutó ninguna migración contra Supabase operativo, ni se probó una activación en producción. Las pruebas de UI declaradas siguen sin equivaler a una inspección visual de navegador. La aprobación del contrato de lectura y la disposición final de PR #4/#5/#8 siguen pendientes.

Enlaces de evidencia:
- https://github.com/jdlc86/CartaViva/actions/runs/40266420041
- https://github.com/jdlc86/CartaViva/actions/runs/40266420109
- https://github.com/jdlc86/CartaViva/actions/runs/40290117384
