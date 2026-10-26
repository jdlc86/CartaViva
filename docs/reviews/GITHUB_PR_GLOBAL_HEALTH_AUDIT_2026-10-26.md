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

## Bloque I — comparación semántica de siete archivos divergentes (2026-10-26)

Se leyeron ambos contenidos en las ramas originales y en HEAD #13 para los siguientes archivos:

| PR | Archivo | Cambio observado | Clasificación |
| --- | --- | --- | --- |
| #4 | `apps/api/src/order-operations-http.mjs` | El registro añade opción `transitionOnly=false`; modo positivo monta únicamente POST | Extensión de aislamiento, requiere regresión |
| #4 | `apps/api/src/order-operations-coordinator.mjs` | Sustituye preconsulta de membresía en mutaciones por capacidad firmada, verificada dentro del wrapper SQL; valida propiedades propias y respuestas de membresía para lecturas | Cambio deliberado de frontera de seguridad, no equivalencia literal |
| #4 | `apps/management/src/views/OrdersView.tsx` | Mantiene firma de gateway opcional; 204→224 líneas | Preservación de interfaz pública; detalle visual por verificar |
| #5 | `apps/management/src/main.tsx` | Conserva exportación `ManagementApp`; gateway de operaciones opcional y lectura administrativa desconectada por defecto | Composición extendida |
| #5 | `apps/management/src/style.css` | 456→498 líneas; contrato de tokens/breakpoints cubierto por test estático | Diferencia visual no cerrada |
| #8 | `apps/api/src/order-operations-identity-preflight.mjs` | Añade preflight explícito del lector de personal para modo de transición aislado | Refuerzo de mínimos privilegios |
| #8 | `apps/api/src/order-operations-repository.mjs` | Mantiene tres exportaciones públicas; 350→353 líneas | API preservada; semántica SQL pendiente de comparación |

**Hallazgo de seguridad clave:** el coordinador #4 llamaba `repository.verifyMembership(query, staff)` antes de `repository.transitionLine`. En #13, la transición genera `issueTransitionCapability` y delega la comprobación de membresía bajo lock al wrapper SQL. Mantener la consulta anterior requeriría permisos de lectura adicionales en el login de mutación, incompatibles con el aislamiento normativo. No se debe restaurar esa llamada por mera equivalencia textual.

**Alcance de evidencia:** inspección estática de interfaces y cambios clave, no una demostración exhaustiva de equivalencia semántica de siete archivos. Quedan diferencias adicionales y pruebas visuales pendientes; ninguna PR se cierra ni se fusiona.

## Bloque J — último estado de GitHub Actions conocido

Al inicio de esta revisión, #14 HEAD `385d80bb95a3977c9327920b9c1d34fe53d55c1b` tenía `Sabora CI` run **40290419763** en estado `in_progress`. No se registra como `success` hasta comprobar su conclusión. Los runs anteriores documentados sí terminaron en `success`.

## Bloque K — cierre dirigido de divergencia SQL en repositorio de operaciones (2026-10-26)

Comparación textual íntegra de `apps/api/src/order-operations-repository.mjs` entre #8 (`8818366c79893a8fd78dee6a089fd990a71a9c52`) y #13 (`5a24a1136f8cfefa5bf9344d7eae8b4318e3b17b`):

- Se mantienen las mismas tres exportaciones: `createOrderOperationsRepository`, `ORDER_OPERATION_STATUSES` y `ORDER_OPERATION_TARGETS`.
- `verifyMembership` conserva consulta parametrizada a `sabora.staff_members` y bloqueo `FOR SHARE`.
- `listBoard` conserva consulta SQL parametrizada, joins, orden, filtros por rol, límites y cursor; en #13, la validación de la fila adicional (`LIMIT limit+1`) se extiende a **todos** los campos antes de seleccionar las `limit` filas visibles. En #8 se validaban orden/identificadores de la fila extra, pero el resto de campos únicamente de las filas visibles.
- `transitionLine` mantiene la invocación a `sabora.transition_order_line_authorized_candidate` con nueve parámetros tipados y capacidad firmada; se mantienen las validaciones de transición y de respuesta.
- `listHistory` conserva la consulta parametrizada y validaciones de secuencia/eventos.

**Conclusión:** la divergencia de tres líneas en este archivo corresponde a un endurecimiento fail-closed de la fila de desbordamiento, sin indicios de pérdida de API o cambio de contrato SQL. Se considera **cerrada la revisión dirigida de este archivo**, no la auditoría integral de toda #8. No se han modificado SQL ni roles operativos.

## Bloque L — cierre de divergencias del registro operativo #8→#13 (2026-10-26)

Comparación de contenido de `order-operations-composition.mjs` e inspección de `order-operations-identity-preflight.mjs` en ambas ramas:

- La función privada `registerOrderOperationsFromPools` y el export `registerVerifiedOrderOperationsFromPools` permanecen con la misma composición de pools, hooks de autenticación, transacción y preflight negativo. La rama #13 **añade**, sin sustituir la interfaz previa, `registerVerifiedOrderTransitionsOnlyFromPools`.
- La función añadida comprueba aislamiento de pools y roles, issuer de capacidad, presencia y ausencia de duplicación de ruta POST, y cableado JWT/JWKS antes de abrir conexiones SQL. Después inspecciona el lector de personal y el mutador por separado, construye hooks/coordinador y monta únicamente POST mediante `transitionOnly:true`.
- El preflight #13 añade el parámetro `allowStaffReader` y la función `preflightOrderTransitionStaffIdentity`. Requiere exactamente el conjunto de columnas de lectura `user_id, role, state` y ausencia de privilegios de escritura/columnas extra sobre `staff_members`; para el mutador conserva el permiso positivo exclusivamente sobre la RPC autorizada.
- El bootstrap `server.mjs` continúa sin importar estas funciones. La composición de transición sigue siendo opt-in, no desplegada.

**Clasificación:** divergencia #8 en estos dos archivos explicada por incorporación de una ruta de transición aislada y un preflight de lector de mínimos privilegios. No hay evidencia estática de regresión de interfaz; la verificación de comportamiento está cubierta por pruebas CI #13 documentadas. El gate de lectura de tablero/historial continúa cerrado por decisión normativa.

**Limitación:** este cierre es de archivos concretos, no certificación integral de todas las diferencias de #8 ni autorización de activación operativa.

## Bloque M — CI de #14 y alcance residual de #8 (2026-10-26)

- GitHub Actions `Sabora CI` run **40291024568**, ejecutado sobre HEAD #14 `e47c1e2218cbbe9dbb272393461ba610708c5687`, finalizó **completed/success**.
- Inventario reproducible de árboles Git para #8 `8818366c79893a8fd78dee6a089fd990a71a9c52` frente a #13 `5a24a1136f8cfefa5bf9344d7eae8b4318e3b17b`: se observaron **27 rutas compartidas con SHA de blob diferente**. Esto no significa 27 regresiones: incluye workflows, documentación normativa, pruebas, migración SQL y código.
- De las 27 rutas divergentes, seis son módulos API de operaciones (`composition`, `coordinator`, `http`, `identity-preflight`, `repository` y `package.json`); las cinco primeras ya cuentan con comparación dirigida en los bloques I–L. **No se da por cerrada** la equivalencia de las restantes, en particular la migración SQL y las pruebas de identidad y concurrencia.
- El siguiente gate de aceptación debe contrastar la migración `20261024190000_sabora_order_operation_actor_capability_candidate.sql` y las pruebas PG17 de ambos árboles, separando ampliaciones de cobertura de posibles cambios de semántica. CI verde acredita la rama auditada, no una equivalencia exhaustiva con PR #8.

**Decisión:** mantener #8 y #14 Draft; no cerrar, fusionar ni activar operaciones.

## Bloque N — migración SQL de capacidad y regresión PG17 #8→#13 (2026-10-26)

Inspección directa de los blobs de #8 (`8818366c79893a8fd78dee6a089fd990a71a9c52`) y #13 (`5a24a1136f8cfefa5bf9344d7eae8b4318e3b17b`):

| Artefacto | #8 | #13 | Hallazgo |
| --- | ---: | ---: | --- |
| `supabase/migrations/20261024190000_sabora_order_operation_actor_capability_candidate.sql` | 400 líneas | 409 líneas | Conserva roles, RLS, políticas, grants y RPC autorizada; añade comprobación de expiración **después de obtener el bloqueo de línea** |
| `scripts/ci/order-operations-identity-postgres17.test.mjs` | 529 líneas, 12 tests declarados | 789 líneas, 18 tests declarados | Añade casos de lector exacto, drift de CREATE, expiración bajo lock de línea, Fastify con login restringido, concurrencia de actores y JWT real |
| `scripts/ci/order-operations-postgres17-integration.test.mjs` | 273 líneas, 6 tests declarados | 375 líneas, 8 tests declarados | Añade expiración de capacidad tras espera de lock y ciclo Fastify/PG17 de cocina→camarero con notificación, replay e historial |

**Frontera temporal:** ambas versiones verifican la capacidad antes y después de esperar el lock de clave/membresía. La versión #13 repite `clock_timestamp()` y rechaza `p_expires_at_ms <= v_now_ms` o `v_key_expires_at <= v_now` tras `FOR UPDATE` sobre la línea. Evita ejecutar una transición si la capacidad caducó durante esa última espera.

**Conclusión de esta comparación dirigida:** el cambio SQL identificado es un endurecimiento de seguridad temporal; la cobertura PG17 aumenta de 12→18 y de 6→8 tests declarados en los dos archivos revisados. Las cantidades son recuentos estáticos de declaraciones `test(...)`, no resultados de ejecución de estas ramas. El CI de #14 sobre HEAD previo `e47c1e2218cbbe9dbb272393461ba610708c5687` terminó SUCCESS (run 40291024568).

**Limitación:** no afirmar equivalencia exhaustiva de todos los archivos ni activación aprobada de operaciones. Mantener #8 y #14 Draft.

## Bloque O — reconciliación de interfaz administrativa #5→#13 (2026-10-26)

Se contrastaron los contenidos de `apps/management/src/main.tsx`, `views/OrdersView.tsx` y `style.css` entre #5 (`6fbff90597d0e3e8b5b63cc5613b390b3b5029c2`) y #13 (`5a24a1136f8cfefa5bf9344d7eae8b4318e3b17b`).

- `ManagementApp` conserva los parámetros `tablesGateway` y `catalogGateway`, la navegación a `CatalogView`/`TablesView` y el indicador de lectura parcial/no operativa. Añade `operationsGateway?: OrderOperationsGateway` y lo pasa a `OrdersView`; el montaje normal continúa `<ManagementApp/>`, sin conectar ninguna operación.
- `OrdersView` pasa de 75 a 224 líneas: de pantalla desconectada a lectura de tablero, transiciones, historial, recarga y estados de error **condicionados** a un gateway inyectado. En ausencia de gateway, se conserva explícitamente el estado `Canal operativo sin conectar` y no se simulan datos.
- `style.css` pasa de 456 a 498 líneas y conserva los media queries de 1180, 900, 700 y 460 px, `:focus-visible` y `prefers-reduced-motion: reduce`. Las diferencias visuales exactas no quedan certificadas por la lectura estática.
- Inventario de árboles: #5 tiene 16 rutas compartidas modificadas frente a #13; entre código de aplicación/pruebas las divergencias se concentran en `apps/api/package.json`, `main.tsx`, `style.css`, `OrdersView.tsx` y `tests/postgres-transaction.test.mjs`. Catálogo y mesas mantienen sus modelos y vistas con SHA idéntico, según el inventario previo.

**Clasificación:** integración funcional del gateway de comandas como ampliación opt-in, sin evidencia de activación implícita. Pendiente regresión visual real (capturas/navegador) y contraste de reglas CSS añadidas; no afirmar equivalencia visual completa.

## Bloque P — inventario residual de #4

Árbol #4 (`bd268c67d8c47fb64c3367663cb85d46d569c2f0`) frente a #13: 40 rutas compartidas con blobs diferentes. Entre ellas: confirmación cliente, repositorios de catálogo/visita, cliente React, primitivas/vistas de administración, API de operaciones y pruebas. Esto excede la mera pantalla cocina/camarero; exige evaluación por dominio antes de decidir disposición del PR #4.

**Estado de CI:** al inicio de este bloque, HEAD #14 `e0127e6c63b5852653c41eb1e4fdca4c3f5dd068` tenía run `40291548926` en progreso; no se registra como éxito hasta verificar conclusión.

## Bloque Q — confirmación cliente y catálogo #4→#13 (2026-10-26)

Comparación directa de cuatro módulos de API en PR #4 `bd268c67d8c47fb64c3367663cb85d46d569c2f0` y #13 `5a24a1136f8cfefa5bf9344d7eae8b4318e3b17b`:

| Archivo | Evidencia observada | Disposición |
| --- | --- | --- |
| `catalog-confirmation-coordinator.mjs` | Conserva `createCatalogConfirmationCoordinator`, `withTransaction` y las cinco operaciones obligatorias del repositorio: `lockContext`, `lookupIdempotency`, `lockCatalog`, `loadPreviousQuote`, `persist`; 156→170 líneas | Contrato estructural preservado, revisar diferencias internas restantes |
| `catalog-visit-context-repository.mjs` | Conserva `createCatalogVisitContextRepository`, `lockContext`, comprobaciones de QR/visita/sesión no revocados ni caducados; 71→72 líneas | Contrato estructural preservado |
| `customer-order-confirmation-http-candidate.mjs` | Conserva `registerCustomerOrderConfirmationRoute`, candidato opt-in no registrado en `server.mjs`, validación de respuesta y HTTP 409 por conflicto de idempotencia; añade `failureCode` y validación de estado; 46→82 líneas | Extensión de validación/errores, verificar correspondencia exacta de códigos |
| `verified-isolated-customer-composition-candidate.mjs` | Conserva `registerVerifiedIsolatedCustomerRoutes` y el preflight de identidades PostgreSQL; añade `assertIsolatedCustomerSqlCapabilities` antes del montaje; 37→41 líneas | Endurecimiento de privilegios de composición |

La CI de #14 en `6d510e512af4d5025a5d72dde5e9af6c9841dbe8` completó **SUCCESS**, run `40291716568`.

**Alcance:** este bloque establece preservación de interfaces y guardas principales; no acredita equivalencia de todos los caminos de confirmación ni las pruebas de concurrencia por sí solo. Continúan pendientes los detalles internos y la validación funcional del resto de #4. Ningún despliegue ni merge.
