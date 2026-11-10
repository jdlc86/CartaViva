# Sabora / CartaViva — sesión 34: dictamen de conciliación funcional de nueve PR divergentes (2026-11-10)

> **AUDITORÍA DE CÓDIGO Y EVIDENCIA, NO NORMA NI AUTORIZACIÓN DE CIERRE.** La fuente de verdad es la normativa versionada. El cotejo de nombres de tests, rutas o SHA acredita preservación identificable; no certifica que cada aserción o recorrido haya conservado exactamente su semántica. No sustituye revisión independiente o aceptación visual/humana. No se han ejecutado pruebas nuevas en este hito; las ejecuciones CI referenciadas son históricas y están acotadas al SHA.
>
> **Continuidad viva:** [sesión 34](../handoffs/SESSION_34_HANDOFF_2026-11-10.md). **Sesión anterior:** [33](../handoffs/SESSION_33_HANDOFF_2026-11-10.md). **Tablero:** [SABORA_LIVE_PROJECT_TRACKER.md](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). **Matriz:** [FUNCTIONAL_UI_COVERAGE.json](../design/FUNCTIONAL_UI_COVERAGE.json). **Saneamiento S32:** [plan](SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md), [dictamen de 47 PR](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md), [conciliación S32](SABORA_S32_SEMANTIC_RECONCILIATION_AND_COMBINED_CANDIDATE_2026-11-09.md), [conciliación histórica S27](SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md), [evidencia S33](SABORA_S33_S4_COMPLETION_EVIDENCE_2026-11-10.md).
>
> **Candidato auditado:** PR [#54](https://github.com/jdlc86/CartaViva/pull/54), rama `integration/sabora-s32-admin-waiter-sanitization-20261109`, HEAD al comenzar la auditoría `bc2b48e73568112b4e5aefee24ddb12d5f2ebecb` (dos commits documentales de apertura S34 posteriores al corte inicial de S33). **Última CI automática 6/6 de producto/pruebas:** `b1419e863f960993bcb1e0728cf8aa4c646c5464`, no el HEAD documental. `main` permanece en `42b46358a76162445fa9e0b20e7b87dd0a640b5b`.

## 1. Método y alcance de este hito

1. Se consultaron **directamente en GitHub** el HEAD y metadatos de los nueve PR abiertos #4/#5/#8/#17/#18/#19/#20/#21/#22 y la lista de archivos modificados de cada uno (23/20/21/3/4/4/4/4/5, respectivamente). Se examinaron parches exclusivos, módulos actuales, suites de prueba originales y el código del candidato #54. El inventario topológico de 47 PR y comparación de árboles completos **ya existía** en S32/S33 y no se vuelve a presentar como descubrimiento.
2. Se contrastó la precedencia de [requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato de operaciones cocina/sala](../architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md), [contrato ROOT/ADMIN](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [contrato de diseño](../DESIGN_SYSTEM_CONTRACT.md) y [matriz funcional/UI](../design/FUNCTIONAL_UI_COVERAGE.json). Los módulos de un PR antiguo no derogan decisiones normativas posteriores: se evalúa la **garantía requerida hoy**, no reproducción literal de UI/estados obsoletos.
3. Se efectuó una **comparación nominal de pruebas** en las ramas históricas y el candidato; donde cambió un nombre no se contabilizó falsamente como igual. Se revisaron explícitamente los componentes y rutas montadas, no solo la existencia de archivos.
4. **No** se ha clonado ni ejecutado una suite desde este hito; no hay entorno PostgreSQL 17 local, servicio Fastify real ni dispositivo físico ensayado ahora. El 6/6 de [Actions de S33](SABORA_S33_S4_COMPLETION_EVIDENCE_2026-11-10.md#15-dictamen-final-del-hito-técnico-cv-012-sobre-un-sha-funcional-exacto-2026-11-10) representa evidencia previa del SHA funcional. **No declarar validación nueva a partir de lectura de código.**

### Dictamen ejecutivo

| PR histórico | Materia exclusiva | Código del candidato cotejado | Preservación contrastada | Dictamen S34 | Puerta que impide cierre inmediato |
| --- | --- | --- | --- | --- | --- |
| [#4](https://github.com/jdlc86/CartaViva/pull/4) | Cocina/sala y estados | Coordinador, SQL, HTTP, PWA gestión, tareas de recogida H6 | 6/7 nombres de test Node originales; 5/6 nombres en pruebas gestión, con cambios semánticos explicables | **Evolucionado; equivalencia total no certificada** | Contrastar integralmente el modelo aprobado «Voy a recoger»/«Cancelo» frente al antiguo `picked_up`, roles y flujo económico/operativo |
| [#5](https://github.com/jdlc86/CartaViva/pull/5) | Lectura de catálogo/mesas, gestión | Modelos, enrutamiento `CatalogView` → M3 autenticado, SQL categorías dinámicas | 6/6 nombres de test catálogo, 4/4 mesas, 2/2 navegación (12/12); modelo de catálogo test idéntico por blob | **Evolucionado; evidencia PG17 M3 parcial válida** | Un único recorrido categoría nueva ADMIN → HTTP → PWA cliente; aceptación visual humana |
| [#8](https://github.com/jdlc86/CartaViva/pull/8) | Actor firmado en SQL | Capacidad HMAC y migración PostgreSQL con revalidación tras locks | Archivo de test `order-operation-capability.test.mjs` **SHA idéntico**, 3/3 nombres | **Garantía crítica retenida y reforzada en código; sin aval independiente global** | Revisar la rama frente al contrato vigente y aprobar disposición administrativa |
| [#17](https://github.com/jdlc86/CartaViva/pull/17) | Rechazo estricto de parámetros GET | `order-operations-http.mjs`, rechazo tipo escalar y ruta de historial | **25/25 títulos** de `tests/order-operations.test.mjs` conservados, archivo evolucionado | **Control esencial visible y ensayado previamente; no paridad total** | Evaluación independiente de ruta efectiva y alcance H4/H6 |
| [#18](https://github.com/jdlc86/CartaViva/pull/18) | Integridad local y favoritos | `client-state.ts`, favoritos case-insensitive, validación de cesta | Original 9 tests Node; todos están entre los 14 actuales | **Preservado/evolucionado en familia H3** | Reconciliación integrada de #18–#22 y uso real |
| [#19](https://github.com/jdlc86/CartaViva/pull/19) | Agotados/retirados | `basketIssues`, bloqueo de pedido, retiro específico | Original 10 tests Node; conservados en los 14 actuales | **Preservado/evolucionado en familia H3** | Lectura pública real y circuito cliente |
| [#20](https://github.com/jdlc86/CartaViva/pull/20) | Consentimiento de precio | Snapshot local; `acceptBasketPrice` explícito por variante | Original 11 tests Node; conservados | **Preservado/evolucionado en familia H3** | Confirmación HTTP con nueva cotización y autorización del cliente |
| [#21](https://github.com/jdlc86/CartaViva/pull/21) | Revisión conjunta de incidencias | `basketIssues`, `canRequestTableOrder`, panel de revisión | Original 12 tests Node; conservados | **Preservado/evolucionado en familia H3** | Misma puerta de H3; no contar cinco homologaciones separadas |
| [#22](https://github.com/jdlc86/CartaViva/pull/22) | Cesta entre pestañas y familia H3 completa | Evento `storage`, identidad de variante, UI y tests | **13/13 títulos Node y 8/8 títulos Chromium** originales preservados; actuales 14 y 20 respectivamente | **Conservación funcional identificable, no aceptación E2E SQL completa** | Escenario único integrador real de catálogo/precio/QR/confirmación y review visual |

La matriz es una **disposición diagnóstica 9/9**, no dictamen de que nueve PR estén listos para cierre. El censo posterior al cierre S33 sigue siendo **43 Draft abiertos**: nueve de esta matriz, 33 ancestrales y #54. No se ha dado autorización para cerrar ninguno adicional.

## 2. PR #4 — operación cocina/sala: no recuperar semántica antigua

**Histórico auditado:** HEAD `bd268c67d8c47fb64c3367663cb85d46d569c2f0`, [diff original](https://github.com/jdlc86/CartaViva/pull/4/files). Introdujo transición por línea `confirmed → preparing → ready → picked_up`, aviso durable, rol cocina/camarero y recuperación desde SQL. El antiguo [contrato de operaciones](../architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md) así lo describe; no sustituye el [contrato funcional vigente](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), sección «Coordinación de recogida en sala».

**Evidencia actual de código:** [HTTP de operaciones](../../apps/api/src/order-operations-http.mjs) restringe cuerpos y roles, y [m2-restaurant-candidate.mjs](../../apps/api/src/m2-restaurant-candidate.mjs) registra esa ruta con `legacyPickupDisabled:true`; el [OrdersView](../../apps/management/src/views/OrdersView.tsx) ya usa `claimPickup`, `cancelPickup` y `correctReady` con identidad de tarea y versión. El contrato actual distingue **«Voy a recoger» (asignación)**, **«Cancelo» (renuncia a asignación)** y recogida física; la API histórica `picked_up` no debe reactivarse por cerrar una rama. [Repositorio SQL](../../apps/api/src/order-operations-repository.mjs) diferencia `pickup_task_id` y proyección H6 de entregas. Se conserva trazabilidad en [tests/order-operations.test.mjs](../../tests/order-operations.test.mjs) y [tests de gestión](../../apps/management/tests/order-operations-behavior.test.mjs).

**Cotejo concreto de regresión:** el PR antiguo contiene siete títulos de `tests/order-operations.test.mjs` y seis de `order-operations-behavior.test.mjs`; en el candidato coinciden literalmente **6/7** y **5/6**, respectivamente. Las excepciones nominales son `coordinator revalidates current membership inside every transaction` y `connected view blocks duplicate clicks and keeps delivery and cancellation unavailable`: la responsabilidad de membresía se trasladó al límite SQL firmado y ahora existen acciones de recogida/cancelación de tarea. **El cambio de título no demuestra pérdida ni demuestra sustitución completa**. Requiere contraste positivo/negativo integrado con política aprobada, concurrencia y permisos, no forzar el contrato obsoleto.

**Disposición:** `RETENER — EVOLUCIÓN NORMATIVA Y PARIDAD INTEGRAL PENDIENTE`.

## 3. PR #5 — gestión: M3 dinámico no se confunde con lector legado

**Histórico auditado:** HEAD `6fbff90597d0e3e8b5b63cc5613b390b3b5029c2`, [diff](https://github.com/jdlc86/CartaViva/pull/5/files). El candidato conserva modelos `catalog-read-model`, `tables-read-model` y `navigation-model`. Se compararon títulos: catálogo 6/6, mesas 4/4, navegación 2/2, todos identificables ahora. El archivo de tests de catálogo es blob idéntico.

**Ruta montada verificada:** [`apps/management/src/main.tsx`](../../apps/management/src/main.tsx) suministra `catalogManagementGateway` cuando `enableM3Management` está habilitado; [`CatalogView.tsx`](../../apps/management/src/views/CatalogView.tsx) deriva a `M3CatalogManagementView` y deja el `CatalogReadView` de categorías fijas como respaldo legado. [`M3CatalogManagementView.tsx`](../../apps/management/src/views/M3CatalogManagementView.tsx) muestra categorías cargadas, permite crearlas, ocultarlas, restaurarlas y ordenarlas, y guarda/publica platos por categoría. La prueba PostgreSQL 17 [`m3-management-postgres17.test.mjs`](../../scripts/ci/m3-management-postgres17.test.mjs) añade `ESPECIALES`, aplica rol ADMIN titular, rechaza camarero y ADMIN ajeno, publica/oculta/restaura y consulta `sabora.read_published_catalog()`; **M3 2/2 PASS** en [Bootstrap #42795971453](https://github.com/jdlc86/CartaViva/actions/runs/42795971453).

**Límite:** lo anterior **no es** un único recorrido real `ADMIN + HTTP Fastify + PWA de gestión + SQL + GET catálogo + PWA cliente` con categoría nueva. Tampoco acredita conformidad visual humana de la pantalla contra referencias aprobadas. No reabrir equivocadamente el diagnóstico de `CatalogReadView` fijo como fallo demostrado de M3.

**Disposición:** `RETENER — EVIDENCIA SQL VÁLIDA, CADENA E2E PENDIENTE`.

## 4. PR #8 — actor SQL: garantías reforzadas, no degradadas

**Histórico auditado:** HEAD `8818366c79893a8fd78dee6a089fd990a71a9c52`, [diff](https://github.com/jdlc86/CartaViva/pull/8/files). [`order-operation-capability.mjs`](../../apps/api/src/order-operation-capability.mjs) sigue emitiendo HMAC SHA-256 acotado a `actorId`, `lineId`, transición, correlación, audiencia, expiración y rol SQL técnico. El test [`order-operation-capability.test.mjs`](../../tests/order-operation-capability.test.mjs) coincide **por SHA idéntico**, con 3/3 títulos originales.

**Refuerzo posterior verificado:** [migración de capacidad SQL](../../supabase/migrations/20261024190000_sabora_order_operation_actor_capability_candidate.sql), en torno a las secciones de comprobación de `v_now`, `FOR SHARE`, advisory lock y `FOR UPDATE`, **revalida** `clock_timestamp()`, vencimiento del token y de la clave **después de esperas de bloqueo**, no solo antes. Revalida membresía/rol del actor en SQL y rechaza `actor_not_authorized` o `role_not_allowed_for_line_transition`. [Coordinador](../../apps/api/src/order-operations-coordinator.mjs) evita tomar membresía desde datos de cuerpo HTTP e invoca el wrapper firmado. [PG17 identidad actor](../../scripts/ci/order-operations-identity-postgres17.test.mjs) y suites H6 forman parte de CI anterior.

**Límite:** igualdad de tres tests y endurecimiento observados no prueban que todos los escenarios históricos sean equivalentes ni sustituyen revisión independiente de seguridad. No regenerar un `FOR SHARE` directo que reabra bypass del login restringido.

**Disposición:** `RETENER HASTA REVISIÓN INDEPENDIENTE — GARANTÍA CRÍTICA IDENTIFICADA`.

## 5. PR #17 — rechazo estricto de consultas de operaciones

**Histórico auditado:** HEAD `518638b18052c7c1455ef5b76c64e6ad897092b9`; [cambios originales](https://github.com/jdlc86/CartaViva/pull/17/files) sobre `GET /api/v1/operations/order-lines` y `GET /api/v1/operations/orders/:orderId/history`.

**Evidencia actual:** [`order-operations-http.mjs`](../../apps/api/src/order-operations-http.mjs) exige objetos planos permitidos, `status` string válida, `limit` escalar string de dígitos positivos, cursor coherente `afterConfirmedAt/afterOrderId/afterLineNumber`; rechaza arrays/objetos inválidos y filtra por rol. La ruta de historial también rechaza `limit` no escalar. La comparación de las suites [`tests/order-operations.test.mjs`](../../tests/order-operations.test.mjs) devuelve **25/25 nombres originales aún presentes**, aunque el archivo y las implementaciones se han ampliado. La misma composición M2 registra `legacyPickupDisabled:true`.

**Límite:** no confundir los 25 nombres con afirmación de 25 aserciones byte a byte iguales ni con prueba independiente de todas las rutas H4/H6 en un Fastify operativo final. Registros CI existentes avalan los recorridos ejecutados, no más.

**Disposición:** `RETENER HASTA REVISIÓN/DECISIÓN — VALIDACIÓN ESTRICTA CONSERVADA`.

## 6. PR #18–#22 — una línea H3 acumulativa, con variantes modernas

**Genealogía:** [#18](https://github.com/jdlc86/CartaViva/pull/18) `c29ebc9` → [#19](https://github.com/jdlc86/CartaViva/pull/19) `951991e` → [#20](https://github.com/jdlc86/CartaViva/pull/20) `9189c95` → [#21](https://github.com/jdlc86/CartaViva/pull/21) `d3875c0` → [#22](https://github.com/jdlc86/CartaViva/pull/22) `4fc4f62`. Son cinco PR con aportes propios, pero una **sola familia acumulativa** de cliente que se compara contra #54, no cinco versiones que deban restaurarse juntas.

**Cotejo nominal nuevo de cada HEAD histórico frente a [`tests/client-state.test.mjs`](../../tests/client-state.test.mjs) del candidato:**

| PR | Tests Node en ese HEAD | Nombres del HEAD todavía presentes en el candidato |
| --- | ---: | ---: |
| #18 | 9 | 9/9 |
| #19 | 10 | 10/10 |
| #20 | 11 | 11/11 |
| #21 | 12 | 12/12 |
| #22 | 13 | 13/13 |

El candidato contiene **14 tests Node** de estado de cliente. El [E2E cliente Chromium](../../apps/client/e2e/client-premium.spec.ts) conserva **8/8 títulos** existentes en #22 y ahora declara **20**; su catálogo inicial y respuestas en muchos casos son mocks mediante Playwright `page.route`, por lo que no deben presentarse como PostgreSQL real.

**Funciones hoy inspeccionadas:**

- [`client-state.ts`](../../apps/client/src/client-state.ts) mantiene validación fail-closed de persistencia, favoritos case-insensitive, cantidades acotadas, reconciliación sin aceptar automáticamente precio nuevo, incidencias `unpublished`/`sold_out`/`price_changed`, aceptación explícita, y sincronización de cesta por evento `storage` en [`App.tsx`](../../apps/client/src/App.tsx).
- A diferencia de la brecha descrita por el expediente de 06-11, hoy `basketLineKey` diferencia **UUID de producto + opciones y extras canónicos**; `configureBasketLine` permite variantes del mismo plato y ediciones que solo fusionan configuraciones idénticas. `changeBasket`, `removeBasketLine` y `acceptBasketPrice` admiten `lineKey`, y [la UI del carrito](../../apps/client/src/App.tsx) pasa esa clave al editar/retirar/aceptar. [Test Node de variantes](../../tests/client-state.test.mjs) cubre persistencia, precio, edición y totales. Esto es **código implementado y test existente**, no aceptación de todos los recorridos HTTP.
- [`App.tsx`](../../apps/client/src/App.tsx) calcula `issues` y bloquea el avance a pedido hasta resolverlas; el panel muestra el precio por línea y exige consentimiento. No inferir que el snapshot que llega al servidor deja de necesitar cotización autorizada: el backend decide en el momento de confirmar.

**Límites decisivos para una disposición S4 definitiva:** una prueba de selección UI con mocks no acredita en un mismo ciclo `publicación de categoría/precio por ADMIN → lectura HTTP pública → cliente con dos variantes → cambio de disponibilidad/precio → consentimiento por variante → QR/visita real → cotización/confirmación servidor → invariantes de cuenta/comanda`. El requisito de reserva anticipada sigue apareciendo deshabilitado en la UI; su ausencia no debe ocultarse ni adjudicarse falsamente a la historia del PR #22. Falta aceptación visual humana F28/R09.

**Disposición individual:** #18 `RETENER—integridad`; #19 `RETENER—incidencias`; #20 `RETENER—consentimiento`; #21 `RETENER—revisión`; #22 `RETENER—sincronización/familia completa`. En los cinco existe conservación nominal de pruebas, pero **ninguno está autorizado para cierre ni declara paridad total E2E**.

## 7. Puertas de decisión y siguiente bloque integrador

**Resultado de la conciliación estática S34:** **9/9 PR con análisis semántico individual y referencias de código/test. 0/9 con aprobación independiente final. 0/9 cerrados, fusionados, retargeteados o borrados.** Se refuerza el expediente previo, no se reinicia S1. Estado S4 sigue **NO FINALIZADO**.

Para convertir la evidencia actual en aceptación de escenarios **sin micropruebas aisladas**, la siguiente unidad integral será:

1. **M3→cliente + H3 con cambios de catálogo:** en PostgreSQL 17 desechable, un ADMIN titular autenticado administra categoría adicional y producto/variantes; Fastify publica y PWA cliente los consume, mantiene dos configuraciones independientes, gestiona precio/agotado explícitos y conserva identidad de línea desde la cotización hasta su confirmación autorizada. Reutilizar el harness integrador PG17/Fastify/Chromium disponible y sus identidades mínimas; no usar Supabase operativo. Verificar que la prueba se corresponde de verdad con la PWA montada, no solo un lector SQL.
2. **Operaciones cocina/sala y seguridad:** sobre ese pedido (o escenario equivalente realmente conectado), comprobar rol/actor HMAC al límite SQL, transición cocina, aviso `ready`, claim exclusivo «Voy a recoger», «Cancelo», concurrencia e idempotencia; validar los rechazos GET de parámetros mal tipados y la ausencia de transición antigua `picked_up` habilitada. Reutilizar suites H6/PG17 que ya garantizan estos invariantes si cubren el flujo y documentar expresamente cualquier intervalo no ejecutado.

**No es propuesta de ejecutar tests duplicados indiscriminadamente:** primero mapear los escenarios existentes contra el circuito único, incorporar únicamente el bloque integrador realmente ausente y reejecutar la batería completa en el SHA resultante. Si falta política normativa para una conducta, registrar la brecha; **nunca inventarla**. Si no se puede ejecutar CI, diferenciar `implementado` de `probado`.

**Decisión administrativa:** solamente tras resultado comprobado, revisión independiente de #54 y de los deltas históricos, aceptación visual cuando aplique y autorización **específica** del propietario cabe proponer cierres sin merge o integración. Los **33 PR ancestrales** permanecen hasta integración formal validada en `main` o decisión individual, y el propio [#54](https://github.com/jdlc86/CartaViva/pull/54) sigue Draft. Los cuatro PR documentales #14/#31/#40/#44 ya se cerraron **sin merge** por autorización explícita en S33; no convertir ese precedente en permiso general.

## 8. Límites operativos y declaración de ejecución

- **Implementado identificado:** código de cliente variante por configuración; actor y rol SQL firmados; consultas HTTP estrictas; modelo nuevo de tareas H6; catálogo M3 dinámico con autorización.
- **Pruebas ejecutadas en este hito S34:** **ninguna**. Se verificaron mediante lectura documental y de código las pruebas existentes. **Última CI ajena a este hito:** 6/6 SUCCESS en `b1419e86`, no en el commit documental de este informe.
- **Validación independiente:** ninguna nueva; #54 sigue sin revisión independiente aprobatoria. **Producción:** no autorizada.
- **Escritura realizada por S34:** solo documentación de auditoría/continuidad/seguimiento en rama del PR #54. No modificar `main`, ni migrar/desplegar Supabase operativo o VPS compartido; **Fleetia y sus contenedores permanecen fuera de alcance**.
