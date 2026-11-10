# Sabora / CartaViva — S4: verificación técnica y preparación de cierre (sesión 33, 2026-11-10)

> **Clase: evidencia documental de sesión, NO normativa ni autorización.** Prevalecen [RF](../REQUISITOS_FUNCIONALES.md), [contrato consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [diseño](../DESIGN_SYSTEM_CONTRACT.md), contratos de identidad/seguridad y [matriz funcional/UI](../design/FUNCTIONAL_UI_COVERAGE.json). [Continuidad vigente sesión 33](../handoffs/SESSION_33_HANDOFF_2026-11-10.md) · [expediente 47/47 de sesión 32](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md) · [tablero](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).

## 1. Corte de hechos verificados en GitHub (10-11-2026)

- `GET pulls?state=open&per_page=100` devolvió **47 PR abiertos, 47 Draft** (#54…#1 según numeración existente). [#54](https://github.com/jdlc86/CartaViva/pull/54) sigue Draft, abierto, con `head=integration/sabora-s32-admin-waiter-sanitization-20261109`, `base=feat/sabora-cv014-waiter-calls-integral-20261109` (#53). La rama no es `main`; el último HEAD comprobado antes de comenzar sesión 33 era `082f502f826bad114f2390c76c8f3f2d83e19e13`. `main` conserva `42b46358a76162445fa9e0b20e7b87dd0a640b5b`.
- `pulls/54/reviews` devolvió **cero revisiones**. El expediente S32 confirma #52 con cinco `COMMENTED` del autor y cero `APPROVED`, y #53 sin revisiones. **Revisión independiente NO ACREDITADA**.
- La evidencia S3 no cambia: SHA **funcional** `5c31354e2fcededa4e3a78a33c2582cde6f2f742`, **6/6 CI SUCCESS** ([Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42712879943), [H6](https://github.com/jdlc86/CartaViva/actions/runs/42712880339), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/42712880301), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/42712879964), [dos PWA](https://github.com/jdlc86/CartaViva/actions/runs/42712880006), [UI](https://github.com/jdlc86/CartaViva/actions/runs/42712880078)). **No son tests ejecutados en sesión 33**; los nuevos commits documentales `[skip ci]` no heredan aceptación automáticamente.

## 2. Auditoría S33 de la discrepancia M3 (#5) — hallazgos de código, no prueba ejecutada

**Normativa textual RF «Carta y catálogo»:** categorías iniciales ENTRANTE/PRIMERO/SEGUNDO/POSTRE/BEBIDA y categorías adicionales configurables, compatibles con históricos e informes. El sistema visual aprobado sigue siendo obligatorio.

1. **Ruta de producción opt-in autenticada localizada:** `apps/management/src/main.tsx` (opción `enableM3Management`) crea `M3AuthenticatedManagementGateway`; `CatalogView.tsx` prioriza `managementGateway` y monta `M3CatalogManagementView`. El lector legado `CatalogReadView` y `catalog-read-model.js` tienen categorías fijas pero **no son el editor conectado en ese flujo**. Esto confirma la rectificación S32, no un defecto general de categorías.
2. **Editor real:** `apps/management/src/views/M3CatalogManagementView.tsx` recorre `catalog.categories`, ofrece `category_create`, `category_reorder` y `category_visibility`, y los platos seleccionan `categoryId` de las categorías no ocultas. `m3-catalog-management-model.js` valida identidad UUID/metadata y no una whitelist de nombres fijos. `apps/api/src/m3-management-repository.mjs` permite mutaciones solo a `admin/root` con capacidad firmada. `apps/api/src/m3-management-http.mjs` expone lectura/acciones HTTP bajo identidad administrativa.
3. **SQL efectivo:** `supabase/migrations/20261105150000_sabora_m3_management_candidate.sql` crea `catalog_categories_m3` con RLS `FORCE`, incluye los cinco tipos iniciales, concede mínimos privilegios, ofrece `read_admin_catalog_m3_candidate` y `manage_catalog_m3_candidate`; en `item_save` verifica categoría no oculta y construye snapshot de categoría nominal y `categoryId`; en `item_publish` exige declaración de alérgenos verificada y categoría vigente. No se halló motivo para restaurar la whitelist del lector legado.
4. **Evidencia de pruebas identificada y límites precisos:** `tests/m3-management-capability.test.mjs` cubre emisión/roles de la acción `catalog.category_create` contra repositorio simulado; `apps/management/tests/m3-management.test.mjs` valida estructura de categoría ENTRANTE y gateway. `scripts/ci/m3-management-postgres17.test.mjs`, pese al nombre genérico, contiene **un caso integral PG17 de MESAS**, no una creación/publicación dinámica de catálogo. `scripts/ci/management-authenticated-browser-smoke.mjs` se centra en cocina/camarero sobre fixture HTTP. En cambio `apps/client/e2e/client-premium.spec.ts` sí usa categoría pública adicional de fixture **«Especiales»** y ejercita UI cliente, pero no la crea/publica previamente vía M3/PG17. **No se ha localizado en estas suites una sola cadena que conecte categoría extra en SQL M3 → identidad administrativa HTTP → publicación → lectura cliente Chromium → continuidad histórica.** No afirmar ausencia absoluta de prueba en todo el repositorio a partir de esta selección de archivos.
5. **Dictamen S33:** implementación de categorías adicionales **evidenciada en código**; pruebas parciales existentes, pero **el E2E completo de esa categoría adicional no queda acreditado** con los scripts inspeccionados. PR #5 no se declara equivalente al 100 % ni se modifica una UI sin fallo reproducible. La compatibilidad de informes históricos no debe inferirse: CV-013 sigue condicionado por decisiones normativas independientes de atribución empresarial, permisos y retención.

**Próximo trabajo técnico con valor real, si no aparece evidencia equivalente adicional:** un **único escenario integrador M3** bajo PostgreSQL 17 desechable, login de mínimo privilegio y actor ADMIN con titularidad vigente, JWT/HMAC/Fastify, creación de categoría adicional, borrador/publicación, denegación a actor no autorizado, visibilidad en PWA gestión y cliente Chromium, persistencia de categoría en evidencia del pedido/histórico; aserciones de idempotencia y no publicación desde categoría oculta. Reutilizar el harness y pruebas existentes; no crear micropruebas repetitivas ni simular PG17 como producción. Solo introducirlo si resulta necesario para cerrar este requisito crítico.

## 3. Otras familias no ancestrales: estado preservado, sin falsa certificación adicional

| Familia | Evidencia heredada contrastable | Decisión S33 |
| --- | --- | --- |
| #4 — cocina/sala | [Conciliación histórica](SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md) distingue `picked_up`/«Voy a recoger» y «Cancelo» asignación, no comanda; SQL/CI han evolucionado | No restaurar una cancelación no normativa ni cerrar por coincidencia de rutas; aceptación visual y equivalencia integral no acreditadas |
| #8 — actor SQL | Firma, vinculación de identidad y expiración post-lock se endurecieron en cambios posteriores; pruebas PG17 de ownership integradas en #54 | No introducir roles/migraciones antiguos; custodia operativa de claves y conformidad M6 pendientes |
| #17 — HTTP estricto | Validadores estrictos para escalares, límites y cursores preservados; rechazo adicional de `picked_up` legado intencional | No degradar API ni asumir igualdad histórica de flujos solo por nombres de tests |
| #22 + #18–#21 — H3 | `apps/client/src/client-state.ts` mantiene `basketLineKey(itemId,selection)`, `configureBasketLine`, incidencias y aceptación expresa de precio; `tests/client-state.test.mjs` prueba dos variantes del mismo plato con rehidratación, edición, recotización y cantidad; `apps/client/e2e/client-premium.spec.ts` cubre sincronización entre pestañas, revisión de incidencias y cliente en Chromium | La brecha local de variantes del informe 06-11 **está corregida en código posterior**; no afirmar automáticamente equivalencia H3 completa ni orden económico PG17 para cada variante. Reutilizar la evidencia al emitir decisión |
| #5 — gestión | Modelo M3 y SQL de categorías dinámicas existentes; pruebas seleccionadas no demuestran E2E transaccional de nueva categoría | Mantener puerta técnica M3 anterior, más F28/R09 |

**Cuatro referencias documentales #14/#31/#40/#44:** el [dictamen S32 §2.1](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md) ya acredita preservación literal (prefijo, 20/20 líneas, 141/141 líneas y blob de informe idéntico); no repetir reconciliación ni crear un nuevo PR. **Elegibles para solicitud de decisión administrativa de cierre**, pero no cerradas por este registro.

**33 HEAD ancestrales:** están incorporados en la rama #54, **no** en `main`; no cerrar en bloque como «integrados». El propio #54 continúa Draft; la cadena de PR debe permanecer auditable hasta autorización y destino autorizado.

## 4. Plan decisional de cierre S4 — condicionado, no ejecutado

| Puerta | Acción preparada | Condición para ejecución |
| --- | --- | --- |
| A — 4 PR documentales (#14/#31/#40/#44) | Cerrar administrativamente con comentario individual y enlace a evidencia S32 que preserva el documento; sin cherry-pick de historia antigua | **Autorización explícita del propietario para esos cuatro cierres** y nueva comprobación de sus HEAD |
| B — 5 familias funcionales + H3 | Cerrar evaluación de equivalencia normativa/comportamental con evidencia M3 y revisiones del circuito actual, no con el porcentaje de blobs idénticos | E2E faltante si procede; aceptación visual humana separada; decisión individual documentada |
| C — #52/#54 y resto de ancestros | Revisión independiente de contenido, estrategia de integración en `main`, comparación de rama con `main`, plan de revert/rollback y gobernanza de protección | **Revisión independiente y autorización inequívoca de integración/cierre**; controles previos de CI y migraciones |
| D — producción | Mantener NO-GO hasta cumplir M4 sandbox real, M6, F28/R09 y requisitos normativos no resueltos | Autorización operativa distinta; aislamiento completo VPS/Supabase y protección de Fleetia |

**Prohibiciones vigentes:** no merge, close, rebase, retarget, eliminación de ramas ni cambio de protección/secretos por un documento de continuidad. Ninguna migración a Supabase operativo. No desplegar o reiniciar Sabora ni tocar Fleetia u otros contenedores del VPS.

## 5. Registro de ejecución real de sesión 33

- **Hecho:** lectura GitHub actual, código y suites existentes, rectificación del alcance M3, expediente S4 preparado para decisión y continuidad 33 enlazada.
- **No hecho:** nueva batería PG17/Chromium ni revisión independiente, aceptación visual, merge/cierre de PR, despliegue o modificación de `main`; no declarar resultados que no existen.
- **Estado:** S4 documental/lista de decisiones **actualizada**, saneamiento **administrativo NO FINALIZADO**. El siguiente cierre de hito exige o bien integrar una prueba crítica justificada o autorización expresa de las decisiones A/C, en ese orden apropiado.

## 6. Contraste de integración con `main`: amplitud real del cambio (sesión 33)

**Consulta GitHub `compare_commits(base=main, head=integration/sabora-s32-admin-waiter-sanitization-20261109)`, verificada tras publicar los dos documentos de sesión 33:** `status=ahead`, **ahead_by=4293**, **behind_by=0**, `merge_base_commit=42b46358a76162445fa9e0b20e7b87dd0a640b5b` (igual que HEAD de `main`). El servicio devolvió **300 entradas de archivo**, límite de la comparación: **no** usar estas 300 como inventario exhaustivo de cambios ni inferir que se han revisado todos. El árbol de la rama candidata contiene muchas más rutas y la genealogía integra numerosos PR encadenados.

**Implicación exacta:** la genealogía permite saber que `main` es antecesor de la rama candidata y que no hay commits de `main` ausentes en esa historia, **pero no** garantiza equivalencia normativa, gobernanza, aceptación visual ni migraciones seguras. El PR #54 ni siquiera tiene `main` como base declarada. No ejecutar un fast-forward o merge de 4.293 commits sin una revisión de la totalidad del árbol, plan de integración aprobada, preservación de la cadena, puertas críticas y reversión. El riesgo documental y de gobierno es material aun cuando 6/6 CI de la rama candidata haya superado el alcance probado.

**Recomendación de control antes de cualquier fusión autorizada:** fijar SHA exacto del árbol y de `main`, obtener inventario **completo** de archivos por árbol/commits sin depender del truncamiento de la API de comparación, comprobar migraciones irreversibles forward-only y operación de recuperación, aprobación independiente, compatibilidad de los orígenes y las dos PWA, y crear un acta de go/no-go separada para integración de código y para producción. Ninguna de estas aprobaciones se presume otorgada.

## 7. Implementación de prueba integradora de catálogo M3 — CI por resolver

**Commit de pruebas, sin cambio de producto:** `d568e8c5c6fc6f7557f602b88ed0e8c432b29c83`; en `scripts/ci/m3-management-postgres17.test.mjs`, sobre el harness PG17 desechable preexistente, se incorporó el recorrido **«PG17 M3 dynamic category authorizes, publishes, hides and restores real public snapshot»**. La verificación usa login PostgreSQL distinto con `SET ROLE sabora_m3_catalog_runtime`, capacidad HMAC firmada ligada al login y actor ADMIN titular; exige denegar camarero y otro ADMIN, crear `ESPECIALES` una vez e idempotentemente, guardar y publicar el plato con alérgenos verificados, comprobar la función `read_published_catalog`, ocultar/restaurar, reordenar, auditoría, bloqueo de SQL directo y limpieza aislada.

**Ejecuciones GitHub del SHA funcional exacto:** [Bootstrap PG17 #42778149335](https://github.com/jdlc86/CartaViva/actions/runs/42778149335), [H6 #42778149625](https://github.com/jdlc86/CartaViva/actions/runs/42778149625), [cliente #42778149337](https://github.com/jdlc86/CartaViva/actions/runs/42778149337), [gestión #42778149256](https://github.com/jdlc86/CartaViva/actions/runs/42778149256), [PWA independientes #42778149579](https://github.com/jdlc86/CartaViva/actions/runs/42778149579), [UI funcional #42778149302](https://github.com/jdlc86/CartaViva/actions/runs/42778149302). **Al registrar: ejecución conjunta no cerrada; no atribuir 6/6 a este SHA hasta comprobar todos los estados y logs**. Bootstrap estaba recorriendo migraciones PG17, H6 en aceptación consolidada. Hay ya SUCCESS en UI/PWA/gestión.

**Alcance de aceptación que se pretende:** SQL PG17 real+capacidad+autorización+publicación+proyección pública; **NO** incluye control real JWT/Fastify y dos navegadores conectados a la nueva categoría ni validación visual. Si esa última puerta es imprescindible para resolver #5, documentar un recorrido M3 HTTP/PWA completo antes de declarar equivalencia final. La aprobación independiente y S4 administrativos permanecen separadas.

## 8. Inventario exhaustivo de árboles frente a `main` y deltas normativos (sesión 33)

**Método:** se recuperaron `git/trees/main?recursive=1` y `git/trees/integration/sabora-s32-admin-waiter-sanitization-20261109?recursive=1`, ambos con `truncated=false`. Se compararon por ruta y SHA **todos los blobs**, no el recorte de 300 de `compare_commits`. Corte del árbol candidato **después del primer commit de prueba M3 y los primeros documentos S33**; antes del ajuste posterior de la aserción, que afecta contenido de un archivo existente y no altera las cuentas de rutas.

| Métrica | Resultado Git verificado |
| --- | ---: |
| Entradas totales de árbol en `main` (incluye carpetas) | 30 |
| Blobs (archivos) en `main` | 21 |
| Entradas de árbol de #54 (incluye carpetas) | 994 |
| Blobs (archivos) en #54 | 943 |
| Nuevos blobs/rutas de archivos respecto a `main` | **922** |
| Blobs modificados en rutas ya presentes en `main` | **3** |
| Archivos borrados respecto a `main` | **0** |
| Migraciones SQL nuevas bajo `supabase/migrations/` | **98** |
| Workflows de GitHub Actions nuevos | **6** |

**Los tres archivos comunes modificados son contratos normativos; no son meros cambios cosméticos:**

1. `docs/REQUISITOS_FUNCIONALES.md`: se sustituye una antigua frase que asociaba identidad de cliente a empresa y número de empleado por las reglas de alias, número ID generado por Sabora, empresa opcional y persistencia segura/passkey opcional. Diff de líneas: 1 retirada, 2 añadidas.
2. `docs/architecture/SABORA_CONTRACT_CONSISTENCY_V1.md`: se sustituye un pendiente de alcance de pago por el contrato de **cuentas de coste cero** (05-11-2026), más un pendiente residual para mesas con múltiples pagadores/caja. Diff de líneas: 1 retirada, 3 añadidas contando línea en blanco.
3. `docs/security/ADMIN_WRITE_OWNERSHIP_V1.md`: se elimina la duda histórica sobre bypass ordinario de ROOT y se añade una sección vinculante que establece **ROOT como gobierno, no escritor ordinario**, y prohibición de asumir titularidad. Diff: 1 retirada y 11 líneas añadidas, incluida separación.

**Precaución de gobierno:** los tres contenidos constan versionados en la rama candidata; este contraste **no prueba por sí solo el procedimiento histórico de aprobación** de tales cambios ni da permiso para reescribir la normativa. Antes de llevar a `main`, cotejar autoría y aceptación normativa con los contratos vigentes, sin fabricar consensos desde este expediente. Las 98 migraciones **no** son 98 operaciones ejecutadas en Supabase: solo archivos del árbol candidato, cuyo orden, idempotencia, rollback y alcance deben figurar en el acta de integración. La comparación de rutas **no certifica** equivalencia funcional o permiso de desplegar.

**Conclusión técnica para S4:** queda resuelta la insuficiencia del inventario de archivos del API `compare_commits`, con conteo exhaustivo de rutas y tres deltas normativos identificados; **permanece pendiente** revisión independiente de contenido, migraciones/operación, prueba final del SHA y autorización concreta de las acciones sobre PR y `main`.

## 9. Procedencia Git de las tres modificaciones normativas (no aprobación inferida)

La historia de commits de cada ruta normativa en la rama candidata identifica la **procedencia** de los cambios del §8, sin atribuirles una aprobación humana externa:
- Identidad del cliente en `REQUISITOS_FUNCIONALES.md`: [`515d6948c375`](https://github.com/jdlc86/CartaViva/commit/515d6948c375) («define customer alias, ID and optional company without corporate credentials»), seguido de [`548b1aab5246`](https://github.com/jdlc86/CartaViva/commit/548b1aab5246) («link approved persistent customer identity contract»), 21-10-2026.
- Cuenta de coste cero en `SABORA_CONTRACT_CONSISTENCY_V1.md`: [`2d22e917b888`](https://github.com/jdlc86/CartaViva/commit/2d22e917b888) («close resolved zero-cost accounts safely»), 05-11-2026.
- Rectificación ROOT/gobierno en `ADMIN_WRITE_OWNERSHIP_V1.md`: [`5ca337362ee3`](https://github.com/jdlc86/CartaViva/commit/5ca337362ee3) («harden ownership transactions»), 20-10-2026.

**Límite:** fecha y mensaje de commit **no son por sí mismos un acta de aprobación normativa**. No reescribir estas decisiones desde S4 ni retroceder a textos incompatibles sin confrontarlos con contratos vinculantes y decisiones versionadas. Revisión final de gobierno requerida antes de integrar `main`.

## 10. Primera CI del nuevo test M3: fallo causal de aserción, no funcionalidad

En `d568e8c5`, cuatro workflows rápidos finalizaron SUCCESS, pero [Bootstrap #42778149335](https://github.com/jdlc86/CartaViva/actions/runs/42778149335) y [H6 #42778149625](https://github.com/jdlc86/CartaViva/actions/runs/42778149625) fallaron por la misma causa localizada, línea 216 del test nuevo: la función `repo.manage(asWaiter,...)` **lanza `invalid_m3_catalog_request` sincrónicamente**, mientras se usaba `assert.rejects`, que requiere promesa; no se había alcanzado un defecto de SQL/cliente. Se corrigió **solo la aserción** a `assert.throws` en el SHA funcional de test [`7df6ae08fd29e26d9b25c91a1a87907dc415d8b4`](https://github.com/jdlc86/CartaViva/commit/7df6ae08fd29e26d9b25c91a1a87907dc415d8b4), sin deshabilitar la negativa de permisos. Se inició CI completa de seis workflows del nuevo SHA.

**Observación independiente en la segunda ronda:** [CV-012 #42778714129](https://github.com/jdlc86/CartaViva/actions/runs/42778714129) dio FAILURE porque el navegador veía `/sw.js` activado, pero `navigator.serviceWorker.controller` permanecía nulo tras recargar; error `cv012_service_worker_control_missing` después de 35 s. La causa todavía no está demostrada, **no** se atribuye al cambio de M3 ni se afirma que sea únicamente flakiness. Debe investigarse sin rebajar el gate de controlador o aumentar tiempo sin motivo. El estado final del resto de workflows del SHA `7df6ae08` aún debe consultarse antes de declarar aceptación del hito M3.

## 11. Cuatro cierres documentales: propuestas de motivación individual (NO publicadas ni ejecutadas)

**Metadatos reconfirmados por `fetch_pr`:** #14 (HEAD `613df3d3`), #31 (`86ba4542`), #40 (`03e874df`) y #44 (`43a8acaf`) permanecen **abiertos Draft** y con sus bases históricas originales. Solo si el propietario autoriza explícitamente el conjunto o cada PR, refrescar HEAD/base y registrar comentario de cierre motivado **sin ejecutar merge**. La fuente de preservación es [S32 S4 §2.1](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md).

| PR | Motivación propuesta de cierre administrativo, no fusión |
| --- | --- |
| [#14](https://github.com/jdlc86/CartaViva/pull/14) | Handoff 11 histórico preservado íntegro como prefijo del documento más reciente; sin delta de código necesario para el candidato. Cierre de expediente documental, no prueba de despliegue ni merge a `main`. |
| [#31](https://github.com/jdlc86/CartaViva/pull/31) | Brief H6 original conservado 20/20 líneas en orden, con advertencias sobre su carácter histórico añadidas. No reinstaurar instrucciones antiguas como normativa; no merge. |
| [#40](https://github.com/jdlc86/CartaViva/pull/40) | Handoff 15 histórico conservado íntegro como prefijo del actual y marcado con aviso de recuperación. No trasplantar su rama a `main` por motivo documental. |
| [#44](https://github.com/jdlc86/CartaViva/pull/44) | Handoff 22 conservado 141/141 líneas en orden; informe independiente de coste cero con blob idéntico; tablero posterior evolucionado. Cierre documental sin restaurar snapshots anteriores. |

**Precaución:** cada uno puede ser cerrado administrativamente solo tras consentimiento específico; su cierre no validará los 33 HEAD ancestros ni las cinco divergencias funcionales, y no reducirá las condiciones de revisión independiente y `main`. Mantener trazabilidad de los documentos y enlace a la motivación en cada cierre.

## 12. Segundo SHA del test integrado: M3 PASS; CV-012 dos intentos FAIL (10-11-2026)

**SHA de código de prueba realmente ejercitado:** [`7df6ae08fd29e26d9b25c91a1a87907dc415d8b4`](https://github.com/jdlc86/CartaViva/commit/7df6ae08fd29e26d9b25c91a1a87907dc415d8b4); los siguientes commits `[skip ci]` alteran solo docs y no aportan nueva CI.

**Resultado comprobado de [Bootstrap #42778714165](https://github.com/jdlc86/CartaViva/actions/runs/42778714165): `completed/success`.** El log del job `generate-lockfile` acredita las **2/2 pruebas M3 PG17 PASS**, en particular **«PG17 M3 dynamic category authorizes, publishes, hides and restores real public snapshot» = PASS**; persistencia, capacidad y autoría del usuario, restricción de SQL, publicación, ocultación/recuperación y proyección SQL pública. Es evidencia del test integrado SQL M3, **no** de recorrido visual autenticado HTTP/Chromium con categoría recién publicada ni de cumplimiento de informes corporativos CV-013.

**Resultados adicionales sobre ese SHA:** [UI funcional #42778714105](https://github.com/jdlc86/CartaViva/actions/runs/42778714105), [gestión Chromium #42778714122](https://github.com/jdlc86/CartaViva/actions/runs/42778714122) y [cliente Chromium #42778714295](https://github.com/jdlc86/CartaViva/actions/runs/42778714295) `completed/success`. **No mezclarlos** con el nuevo flujo M3 porque cada uno usa sus fixtures/cobertura propios.

**CV-012 bloqueo reproducido en [#42778714129](https://github.com/jdlc86/CartaViva/actions/runs/42778714129):** el job original **FAIL** y su rerun puntual (job `129704542418`) **FAIL** por el mismo error `cv012_service_worker_control_missing` en `scripts/ci/cv012-two-pwa-installation.mjs`. Ambos logs muestran registro de `/sw.js` correcto y en estado `activated`, pero `navigator.serviceWorker.controller=null` en la página raíz incluso después del reload y espera contractual de 35 s. No se rebajó el gate, no se amplió timeout ni se alteró código SW. El mismo workflow PWA había pasado en el SHA anterior `d568e8c5`, cuyo único delta funcional frente al segundo fue la **aserción del test SQL M3**; la causa de la variación no está demostrada, y no se declara un defecto PWA de producto ni meramente «flaky» por conjetura. **CV-012 NO-GO para esta ronda** hasta diagnóstico y corrección/validación reproducible.

**H6 consolidado del segundo SHA:** [#42778714384](https://github.com/jdlc86/CartaViva/actions/runs/42778714384) estaba `in_progress` en el corte de este registro. Actualizar solo después de consultar resultado final y logs. **No hay 6/6 del nuevo SHA; el baseline 6/6 de S32 pertenece a `5c31354e`, antes de esta nueva prueba M3.**

**Decisión:** un requisito crítico de M3 queda acreditado a nivel PG17, no aceptado por completo a nivel de interacción y conformidad humana. La consolidación administrativa S4 permanece NO EJECUTADA. Se requiere resolver la puerta CV-012 y la aceptación técnica del SHA candidato antes de plantear autorizaciones de fusión, y por separado revisión independiente y conformidad normativa de los tres deltas sobre `main`. Sin operaciones en Fleetia/VPS/Supabase operativo.

## 13. Corte actualizado: H6 completado, CI 5/6; bloqueo CV-012 confirmado

Consulta directa a GitHub sobre el SHA `7df6ae08fd29e26d9b25c91a1a87907dc415d8b4`: seis runs `completed`, **5 SUCCESS / 1 FAILURE**. El último que estaba pendiente, [H6 #42778714384](https://github.com/jdlc86/CartaViva/actions/runs/42778714384), terminó **SUCCESS**; su log `129703263805` muestra `PASS` Block 1, 2A, 2B (contratos, PostgreSQL 17 desechable y migraciones/privilegios, HMAC/concurrencia y Chromium). Bootstrap PG17 [#42778714165](https://github.com/jdlc86/CartaViva/actions/runs/42778714165) **SUCCESS** con 2/2 M3, y cliente, gestión, UI también SUCCESS. La única puerta roja es [CV-012 #42778714129](https://github.com/jdlc86/CartaViva/actions/runs/42778714129), **FAIL** inicial y al repetir job por controlador Service Worker ausente pese a `activated`; origen no demostrado.

Esta actualización **sustituye el estado temporal “H6 en curso” de §§10–12**; no sustituye ni oculta la evidencia de sus cortes históricos. El nuevo candidato no recupera 6/6 hasta resolver CV-012 y superar nuevamente todos los gates aplicables en un mismo SHA. Revalidado también: #54 Draft, 47 PR abiertos, cero reviews en #54, `main` en `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. No hubo alteración del código producto en esta comprobación, ni intervención operativa, cierre o fusión.

## 14. CV-012 corregido en harness: dos validaciones reales de instalación PWA

La investigación comparó [`scripts/ci/cv012-two-pwa-installation.mjs`](../../scripts/ci/cv012-two-pwa-installation.mjs), `apps/client/src/pwa.ts`, `apps/management/src/pwa.ts`, ambos `public/sw.js`, y [contrato CV-012 de PWAs](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md). `install` ya llamaba `skipWaiting` y `activate` ya llamaba `clients.claim`. Las observaciones anteriores mostraban SW activado pero ventana sin controlador tras `page.reload()`; el ensayo de registro/activación no se suavizó ni se cambió el runtime.

**Hito ejecutado:** SHA `b1419e863f960993bcb1e0728cf8aa4c646c5464`, único cambio funcional en **test de instalación CV-012**, reemplaza la recarga CDP por navegación normal del documento en el mismo origen/ámbito con `cv012-control-check=1`. La prueba **sigue exigiendo controlador verdadero** con ruta exacta; también mantiene la prueba de aislamiento de dos orígenes, cachés y offline.

**Resultados:** [workflow CV-012 #42795971048](https://github.com/jdlc86/CartaViva/actions/runs/42795971048), job original `129761119054` y repetición específica `129761744470`, **ambos SUCCESS**. El log original afirma: `CV-012 PASS: 2 installed scopes, bounded public caches, offline/online, same-origin SW routing and distinct-origin storage`. La corrección es compatible con la hipótesis de diferencia entre recarga del protocolo y navegación de usuario, pero **no se certifica causalidad interna del navegador**. Se verifican exactamente estos dos intentos, no estabilidad estadística ilimitada.

**Estado del SHA en este corte:** CI visual/UI, gestión Chromium, cliente Chromium, CV-012 SUCCESS; Bootstrap PG17 y H6 en curso. Mantener pendientes hasta comprobarlos; S4 administrativo no ejecutado. No se alteraron contratos normativos, otros PR, `main`, producción, VPS, Fleetia, Supabase operativo ni secretos.

## 15. Dictamen final del hito técnico CV-012, sobre un SHA funcional exacto (2026-11-10)

**Fuente verificada:** GitHub Actions, todos los workflows del commit funcional `b1419e863f960993bcb1e0728cf8aa4c646c5464` en estado `completed/success` (**6/6**, sin mezclar SHAs). [Bootstrap #42795971453](https://github.com/jdlc86/CartaViva/actions/runs/42795971453), [H6 #42795971006](https://github.com/jdlc86/CartaViva/actions/runs/42795971006), [cliente #42795971355](https://github.com/jdlc86/CartaViva/actions/runs/42795971355), [gestión #42795971044](https://github.com/jdlc86/CartaViva/actions/runs/42795971044), [dos PWA CV-012 #42795971048](https://github.com/jdlc86/CartaViva/actions/runs/42795971048), [UI #42795971402](https://github.com/jdlc86/CartaViva/actions/runs/42795971402).

**Evidencia concreta:** H6 job `129761119309` reporta `PASS` explícito Block 1, Block 2A y Block 2B (normativa y contratos, PG17 disposable/RLS, HMAC-concurrencia-Chromium). Bootstrap job `129761125773` ejecutó el nuevo caso PG17 M3 `dynamic category authorizes, publishes, hides and restores real public snapshot` y registra **2/2 M3 PASS**. CV-012 original job `129761119054` SUCCESS y rerun `129761744470` SUCCESS, ambos con aislamiento de ámbitos, cachés públicas y offline probado; **no** cambiaron los SW del cliente ni gestión.

**Resultado técnico exacto:** la barrera de CI causada por la recarga del harness CV-012 queda corregida y superada en GitHub Actions (ejecución repetida). Esta es una nueva validación automática más reciente que el histórico `5c31354e` de sesión 32. No atribuir el 6/6 a los commits de documentación `[skip ci]` posteriores al `b1419e86`.

**Puertas intencionadamente no cerradas:** revisión independiente externa del PR, aprobación visual humana F28/R09, homologación de dispositivos reales, escenario único M3 ADMIN-HTTP-PWA-cliente de nueva categoría, escenarios normativos CV-013/014 no resueltos, Stripe sandbox real M4, M6, política y autorización de integración/despliegue. En concreto **6/6 CI no equivale a paridad semántica global de los 47 PR ni a producción segura**.

**Tratamiento administrativo S4:** se mantienen propuestas individualizadas 47/47, con cuatro cierres documentales (#14/#31/#40/#44) listos *para solicitar autorización*, 33 HEAD ancestrales **solo dentro de #54 Draft**, 13 divergencias que requieren dictamen según alcance y #54 candidato. No cerrar, fusionar, retargetear ni borrar nada sin decisión explícita; no alterar `main` ni Fleetia/VPS/Supabase operativo.

## 16. Ejecución administrativa S4: anotaciones individuales y análisis de commits exclusivos

**Corte vivo GitHub, 10-11-2026:** 47/47 Draft abiertos. Inventario cotejado por SHA contra 47 filas del [expediente S32](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md): **46/46 HEAD históricos SIN CAMBIOS**; #54 avanza por su trabajo actual, con HEAD de comparación `9ddcfada72dfce70daf2ef986c5ef56d623ba8e4`. Rama `main` sin fusionar. Los ancestros #52 (`ahead=87, behind=0` respecto a su HEAD) y #53 (`ahead=141,behind=0`) se revalidaron contra #54. La nueva evidencia CI no cambia: SHA funcional `b1419e86`, **6/6 SUCCESS**, CV-012 dos ejecuciones SUCCESS.

**Reconocimiento de la diferencia entre PR apilado y compromiso exclusivo:** se consultó `pulls/{n}/files` y la comparación `merge-base(HEAD histórico, #54)..HEAD histórico`. Los PR #14/#31/#40/#44 muestran ficheros de código y workflows en el diff completo, ya que la base apilada no coincide con #54. Pero sus **commits exclusivos por genealogía** son uno por rama, y los archivos tocados exclusivamente son:

| PR | Commits detrás del candidato | Archivos de su delta exclusivo | Preservación |
| --- | ---: | --- | --- |
| [#14](https://github.com/jdlc86/CartaViva/pull/14#issuecomment-6766698609) | 1 | `docs/continuity/SESSION_11_HANDOFF.md` | Prefijo íntegro en #54 |
| [#31](https://github.com/jdlc86/CartaViva/pull/31#issuecomment-6766699322) | 1 | `docs/continuity/SESSION_13_H6_FULL_CODEX_BRIEF_2026-10-27.md` | 20/20 líneas preservadas con avisos posteriores |
| [#40](https://github.com/jdlc86/CartaViva/pull/40#issuecomment-6766700567) | 1 | `docs/handoffs/SESSION_15_HANDOFF_2026-10-30.md` | Prefijo íntegro en #54 |
| [#44](https://github.com/jdlc86/CartaViva/pull/44#issuecomment-6766701289) | 1 | `docs/handoffs/SESSION_22_HANDOFF_2026-11-04.md`; `docs/reviews/SABORA_H6_ZERO_COST_INDEPENDENT_REVIEW_2026-11-05.md`; `docs/tracking/SABORA_LIVE_PROJECT_TRACKER.md` | 141/141 líneas en orden; informe blob idéntico; tablero evoluciona |

**Conciliación de árboles 13/13:** todos los HEADs divergentes #4/#5/#8/#17/#18/#19/#20/#21/#22/#14/#31/#40/#44 se compararon vía árboles recursivos no truncados con #54. **Ningún HEAD antiguo contenía un path de archivo ausente del candidato**. No se confundió esta inclusión de rutas con contenido idéntico o funcionamiento equivalente: la mayoría de las ramas históricas tiene decenas o cientos de blobs posteriormente modificados. Los comparadores de commits devuelven `status=diverged` para las trece y `behind=1` para cada una de las cuatro documentales; cuatro casos de H3 en conjunto con #22 conservan divergencia funcional abierta.

**Escrituras efectivamente realizadas, todas fuera de código de producto:** comentario de disposición específico en los 13 PR divergentes, con marcador `S4-PR-SANITATION-2026-11-10`; los **cuatro documentales** constan en la tabla anterior; los **nueve funcionales/H3** están enlazados en [#4](https://github.com/jdlc86/CartaViva/pull/4#issuecomment-6766719440), [#5](https://github.com/jdlc86/CartaViva/pull/5#issuecomment-6766720157), [#8](https://github.com/jdlc86/CartaViva/pull/8#issuecomment-6766720801), [#17](https://github.com/jdlc86/CartaViva/pull/17#issuecomment-6766721486), [#18](https://github.com/jdlc86/CartaViva/pull/18#issuecomment-6766722219), [#19](https://github.com/jdlc86/CartaViva/pull/19#issuecomment-6766722914), [#20](https://github.com/jdlc86/CartaViva/pull/20#issuecomment-6766723585), [#21](https://github.com/jdlc86/CartaViva/pull/21#issuecomment-6766724205), [#22](https://github.com/jdlc86/CartaViva/pull/22#issuecomment-6766724916). [Matriz escrita en el propio PR #54](https://github.com/jdlc86/CartaViva/pull/54#issuecomment-6766738523) cubre las 47 candidaturas y explica por qué no se archivan los 33 ancestrales.

**Acción de cierre todavía NO ejecutada:** el procedimiento S32/S33 exige autorización específica del propietario para cerrar PR, incluso si solo son documentos históricos. Cuatro candidatos propuestos **#14/#31/#40/#44**, sin cherry-pick ni merge de código; esperar esa decisión concreta. Los otros 43 PR Draft quedan bajo sus respectivas puertas, independientes de CI/Stripe/piloto. Se conservan las ramas y `main`; no hay cambios operativos externos. El comentario del autor no es revisión independiente.

## 17. Acta de ejecución S4-P1: cuatro cierres sin fusión expresamente autorizados (2026-11-10)

Tras consentimiento específico del propietario para **cerrar sin fusionar únicamente #14/#31/#40/#44**, se verificaron inmediatamente antes de escribir sus estados: los cuatro `open` / `draft=true` / `merged=false` y los HEAD del expediente S32. Mediante actualización administrativa GitHub se cerraron individualmente y cada respuesta acreditó `closed` **y `merged=false`**: [#14](https://github.com/jdlc86/CartaViva/pull/14) HEAD `613df3d38a854e1faa890ab67e9bc05aeefc5d56`, [#31](https://github.com/jdlc86/CartaViva/pull/31) HEAD `86ba45425d4dae12771fae394fc621819dd57502`, [#40](https://github.com/jdlc86/CartaViva/pull/40) HEAD `03e874dff4b4fe3c2084e7cc962fb90a03c1615b`, [#44](https://github.com/jdlc86/CartaViva/pull/44) HEAD `43a8acaf95baeeffae8625cc9068b30c6dbf3bb0`.

**Base del dictamen, no inferencia a partir del título:** cada uno tenía **un commit exclusivo divergente**, con delta solo documental desde `merge-base`, preservado íntegramente o evolucionado en el árbol completo actual de #54 conforme a §§2, 16. El diff apilado completo contenía también código de base y no debe describirse como diff PR exclusivamente documental. El cierre **no es un merge** ni reconocimiento de equivalencia funcional total de todas las bases.

**Verificación posterior:** REST `pulls?state=open` = **43**, `draft=true` para los 43. PR #54 abierto Draft sobre #53, sin integración en `main`. HEAD de `main` = `42b46358a76162445fa9e0b20e7b87dd0a640b5b` sin cambio. Los 43 restantes incluyen **33 PR ancestrales solo dentro de #54 Draft**, **9 divergentes funcionales/H3** (#4/#5/#8/#17/#18/#19/#20/#21/#22) y **el candidato #54**. No se cerró ni fusionó ninguno de ellos. No se ha alterado ninguna rama histórica ni realizado despliegue, migración o cambio operativo de Supabase/VPS/Fleetia.

**Alcance terminado:** cierre administrativo trazable de exactamente cuatro casos, autorizado y efectuado. **S4 global NO CERRADO:** los nueve divergentes siguen necesitando verificación de equivalencia conforme a normativa; los 33 ancestros aún no son historia integrada en `main`; revisión independiente y autorización expresa para merge/integración siguen pendientes. Ninguna CI se ejecutó por este cierre; los `6/6` de §15 son del SHA funcional `b1419e86`, no de la documentación `[skip ci]` posterior.
