# Sabora — conciliación funcional de las ramas históricas #4, #5, #8, #17 y #22 (06-11-2026)

**Clase:** auditoría independiente de preservación, **no normativa**, sin aprobación de interfaz, producto o producción. **Rama candidata:** PR [#49](https://github.com/jdlc86/CartaViva/pull/49), árbol comparado en `5eb42a216daafcff7ed8760328ceb9a38b9a4713`. **Último SHA funcional validado automáticamente:** `380a4777cad82ee359cc487b58a9f030b62596c3`. No se han ejecutado tests nuevos durante esta auditoría estática.

## Precedencia y método

Prevalecen [requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato de diseño](../DESIGN_SYSTEM_CONTRACT.md), las decisiones visuales aprobadas y la matriz F/R; las continuidades solo aportan contexto. Se comparó, para cada HEAD histórico, su `merge-base` respecto de #49, los archivos introducidos o modificados desde ese ancestro y sus blobs actuales. Se revisaron escenarios originales por nombre, aserciones y puntos concretos de implementación. Se contrastó con la ejecución integrada real [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/42253454494), [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42253454770), [cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42253454758), [gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42253454543) y [CV-012 dos PWA](https://github.com/jdlc86/CartaViva/actions/runs/42253454564), **5/5 SUCCESS exclusivamente sobre SHA `380a4777`**.

**Límite de inferencia:** nombres de tests, coincidencia de texto de aserciones, existencia de rutas, CI del candidato y presencia de un blob histórico prueban cosas distintas. Ninguna de ellas, por separado ni combinadas sin análisis de las diferencias, acredita la equivalencia semántica completa de una rama divergente.

## Matriz de conciliación de los cinco HEAD terminales históricos

| PR y HEAD fuente | Paths cambiados en su rama desde `merge-base` | Blobs idénticos en #49 | Paths fuente ausentes | Conciliación funcional y estado |
| --- | ---: | ---: | ---: | --- |
| [#4](https://github.com/jdlc86/CartaViva/pull/4) `bd268c67` — operación cocina/sala | 23 | 2 | 0 | Migración de operaciones y contrato SQL idénticos; Node, UI y repositorio evolucionados; **compatibilidad parcial evidenciada, no paridad completa** |
| [#5](https://github.com/jdlc86/CartaViva/pull/5) `6fbff905` — gestión lectura | 20 | 11 | 0 | Modelos, componentes base y tres suites de lectura/navegación idénticos; acciones M3 nuevas cambian el contrato visual y permisos; **preservación de lectura evidenciada, revisión visual pendiente** |
| [#8](https://github.com/jdlc86/CartaViva/pull/8) `8818366c` — actor SQL | 21 | 3 | 0 | Módulo de capacidades y su test idénticos; migración reforzada contra expiración tras lock; **protección histórica verificada por código y pruebas, activación operativa NO-GO** |
| [#17](https://github.com/jdlc86/CartaViva/pull/17) `518638b1` — validación HTTP | 3 | 1 | 0 | Validador estricto HTTP original conservado y ampliado con veto opcional a recogida antigua; **contrato de rechazo evidenciado, no equivalencia total certificada** |
| [#22](https://github.com/jdlc86/CartaViva/pull/22) `4fc4f623` — cesta/incidencias H3 | 9 | 5 | 0 | Cinco informes originales idénticos, test H3 conservado por escenarios; datos de selección evolucionados; **preservación de escenarios evidenciada, contrato RF de variantes sigue PENDIENTE** |

**Total de comparación:** 76 entradas de paths modificados **contadas por rama**, con 22 blobs idénticos y 54 evolucionados (las rutas pueden repetirse entre PR). Ningún path de esas cinco ramas terminales falta en #49. Esto **no** implica que los commits de las ramas sean ancestros ni que las 54 evoluciones sean equivalentes.

## PR #4 — operaciones cocina/sala

- Blob intacto de `supabase/migrations/20261023225024_sabora_kitchen_waiter_operations_candidate.sql` y `tests/order-operations-sql.test.mjs` (3 casos originales). En `scripts/ci/order-operations-postgres17-integration.test.mjs` se mantienen los seis nombres de escenarios originales y existen ocho actualmente: integración PG17 evolucionada, no traslado textual directo.
- `tests/order-operations.test.mjs`: seis de siete nombres originales se mantienen; el original «coordinator revalidates current membership inside every transaction» se reemplazó por «coordinator binds a transition capability and leaves membership revalidation to SQL». El modelo antiguo leía pertenencia directamente en Node en cada operación; el actual liga una capacidad verificable y delega revalidación a la frontera SQL. **No restaurar el patrón antiguo de autorización** sin volver a evaluar el modelo P0 y los privilegios SQL.
- `apps/management/tests/order-operations-behavior.test.mjs`: cinco de seis títulos antiguos siguen; el sexto cambia de «delivery and cancellation unavailable» a «final delivery unavailable», y se añaden pruebas de SSE, tarea de recogida y recuperación. El contrato normativo consolidado §«Coordinación de recogida en sala» (27-10-2026) distingue **«Cancelo» = renuncia a la asignación**, nunca cancelación de la comanda ni constancia de entrega. La evolución es **intencionada y compatible con el contrato**, no motivo para reintroducir los bloqueos antiguos. Deben mantenerse controles efectivos de duplicación/reintento y roles.
- **No certificado:** equivalencia de todos los flujos históricos de transición y de la UI visual; ni pruebas de operación productiva.

## PR #5 — modelos de gestión y pantalla de catálogo/mesas

- Son idénticos por SHA los archivos `catalog-read-model.js/.d.ts`, `latest-read-task.js/.d.ts`, `navigation-model.js/.d.ts`, `components/Icon.tsx`, `components/Primitives.tsx`, así como los tres tests de catálogo, última lectura y navegación.
- `apps/management/tests/tables-read-model.test.mjs` mantiene los cuatro casos originales y añade uno; las 21 líneas originales con aserción siguen presentes. En `apps/management/tests/ui-contract.test.mjs`, seis de nueve títulos originales permanecen y tres se sustituyen **deliberadamente**: «sin red» por red en gateway autenticado; «todas las mutaciones/QR bloqueados» por mutaciones M3 autorizadas; «catálogo sin escrituras» por lectura legada más gestión M3 opt-in. Se mantienen nueve pruebas UI, con 54 de 59 líneas históricas de aserción idénticas por texto.
- **La equivalencia de la pantalla no se deduce** de tests de contratos de texto. El contrato de diseño requiere conservar la dirección visual aprobada, accesibilidad, breakpoints y aprobación humana; los permisos se derivan del servidor. La compatibilidad M3 por rol fue ejercitada en el E2E PG17 + Fastify + Chromium de `380a4777`, sin que ello apruebe baselines visuales.
- **No restaurar sin más** la indisponibilidad histórica de acciones, que dejaría inoperante M3.

## PR #8 — vinculación de actor en PostgreSQL

- Identidad exacta de `apps/api/src/order-operation-capability.mjs` y `tests/order-operation-capability.test.mjs` (3/3 casos, 8/8 líneas de aserción iguales). `tests/order-operations-identity-preflight.test.mjs` retiene los siete nombres iniciales (ahora 16) y sus 21/21 aserciones originales por línea. `scripts/ci/order-operations-identity-postgres17.test.mjs` conserva sus 12 nombres iniciales (ahora 18), con 44/44 líneas originales de aserción idénticas.
- En la migración `20261024190000_sabora_order_operation_actor_capability_candidate.sql`, el código actual añade explícitamente **465 caracteres** entre el bloqueo `SELECT ... FOR UPDATE` y la mutación: recalcula `clock_timestamp()` y deniega si la capacidad o la clave HMAC caducaron **mientras esperaba el lock**. No reponer el blob antiguo: la diferencia es una protección más estricta y coincide con la [decisión técnica P0](../security/SABORA_P0_ACTOR_SQL_BINDING_DECISION.md), que ya documenta dicha comprobación.
- **NO-GO de activación:** la decisión P0 conserva pendientes el modelo operativo HMAC/pgcrypto, custodia/rotación de claves y logins mínimos. Una suite PG17 desechable no demuestra estas condiciones en Supabase de operación.

## PR #17 — lectura HTTP con parámetros estrictos

- El código original de `apps/api/src/order-operations-http.mjs` valida objetos exactos, tipo escalar de `limit`, `status` permitido, tripleta de cursor válida, límites numéricos y filtrado por rol. Esas reglas permanecen en el candidato. La adición posterior es el parámetro explícito `legacyPickupDisabled` y su rechazo `409` para una transición heredada `picked_up`; la validación de lectura original no se ha relajado.
- Los **25 nombres originales** de `tests/order-operations.test.mjs` del HEAD #17 permanecen en #49. Coinciden literalmente 80/81 líneas originales con aserción; un punto ha evolucionado con la implementación. Se conserva también el informe histórico de validación HTTP con blob idéntico.
- No se afirma equivalencia de todos los resultados del repositorio, pues su SQL y las transiciones han evolucionado para evitar confundir tarea de recogida con estado físico.

## PR #22 — integridad de cesta, incidencias y sincronización local

- Los **cinco informes H3** del PR #22 son blobs idénticos en #49. `tests/client-state.test.mjs` mantiene 13/13 casos por nombre, con 57/61 líneas de aserción idénticas. `apps/client/e2e/client-premium.spec.ts` contiene 18 casos, incluidos 8/8 históricos por nombre; 29/36 líneas de comprobación antiguas coinciden literalmente. Cada caso histórico conserva su cantidad de comprobaciones, aun cuando algunas expectativas cambiaron.
- `apps/client/src/client-state.ts` mantiene todos los exports originales y añade `configureBasketLine`. La app conserva los flujos de resolución de incidencias, consentimiento de precio y sincronización local; el modelo también incorpora selección de opciones y extras. El recuento de menciones y los nombres de tests **no prueban** un flujo de extremo a extremo equivalente ni aceptación visual.
- **Brecha normativa confirmada por inspección, no atribuida a pérdida del PR #22:** `docs/REQUISITOS_FUNCIONALES.md`, §«Contrato funcional: configuración única del plato y edición desde el carrito» (18-10-2026), exige que dos variantes personalizadas del mismo plato formen líneas independientes. `configureBasketLine`, `changeBasket`, `validBasketLines` y el índice de selección actual usan `itemId` como identidad única y reemplazan/fusionan esas variantes. **Pendiente implementar el hito funcional completo**, con contrato de datos, edición por línea, cotización/confirmación de backend e integradora Node+PG17+PWA, antes de marcar el requisito satisfecho.

## Dictamen y próxima puerta

1. **Preservación auditada dentro del alcance, NO equivalencia semántica completa** de las cinco ramas. Las diferencias detectadas en actor SQL, permisos M3, recogida y HTTP tienen justificación posterior concreta; **no existe motivo técnico para cherry-picks automáticos** de esas versiones anteriores.
2. **No cerrar, mergear ni convertir a ancestro** #4/#5/#8/#17/#22 basándose solo en esta revisión. Los 13 HEAD divergentes siguen siendo historia pendiente de una decisión de consolidación; la cadena de PR debe revisarse antes de cualquier integración hacia `main`. No confundir los 42 PR Draft con 42 hitos aún por desarrollar.
3. **Pendientes reales:** conformidad visual contra referencias aprobadas, pruebas de producto en dispositivos reales, requisito RF de líneas personalizadas independientes, matriz completa F/R, pagos Stripe sandbox/caja, M6 y operaciones protegidas. `server.mjs` permanece `health-only`.
4. **Pruebas ejecutadas en esta intervención:** ninguna suite nueva; la evidencia CI publicada de `380a4777` corresponde a código anterior a los commits documentales. Las comparaciones de blobs y escenarios son observaciones de GitHub. **Producción NO-GO.**
5. **Límites:** únicamente PR #49 Draft y docs de revisión/tracking/continuidad; sin modificación de normativa, runtime, SQL, `main`, otros PR, Supabase operativo, VPS, Fleetia ni despliegue.
