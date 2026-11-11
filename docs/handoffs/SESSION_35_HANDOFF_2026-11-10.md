# Sabora / CartaViva — continuidad operativa de la sesión 35 (2026-11-10)

> **ARCHIVADA PARA NUEVOS HITOS (11-11-2026).** La continuidad operativa vigente es [**sesión 36**](SESSION_36_HANDOFF_2026-11-11.md), que recoge el estado definitivo de CI del PR #56 y el siguiente bloque. Los registros S35-0 a S35-10 se conservan como historia de las evidencias de sus respectivos SHA.

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA.** Su propósito es preservar el contexto, los SHA y el siguiente bloque de ejecución. La fuente de verdad normativa son los contratos versionados en este repositorio. No supone aprobación de equivalencia funcional, revisión independiente, aceptación estética, autorización de merge, cierre de PR, migración ni despliegue. Los resultados de CI se atribuyen **solo a los SHA exactos ensayados**. **Este es el documento vivo de continuidad a partir de la sesión 35**: los nuevos hitos relevantes se añaden aquí, sin continuar ampliando la sesión 34.

## 1. Navegación y fuentes obligatorias

- **Continuidad inmediatamente anterior:** [sesión 34](SESSION_34_HANDOFF_2026-11-10.md), especialmente hitos S34-13, S34-14 y S34-15.
- **Contexto de estabilización:** [sesión 33](SESSION_33_HANDOFF_2026-11-10.md) y [sesión 32](SESSION_32_HANDOFF_2026-11-09.md).
- **Tablero vivo y estado de hitos:** [SABORA_LIVE_PROJECT_TRACKER.md](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), §§84–86.
- **Plan de saneamiento:** [SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md](../reviews/SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md).
- **Conciliación de nueve PR, actualizada después del merge:** [SABORA_S34_NINE_DIVERGENT_FUNCTIONAL_RECONCILIATION_2026-11-10.md](../reviews/SABORA_S34_NINE_DIVERGENT_FUNCTIONAL_RECONCILIATION_2026-11-10.md), especialmente §9.
- **Preflight y acta de integración/cierre:** [SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md), §§11–13.
- **Prueba M3→H3 previa:** [SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md](../reviews/SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md).
- **Matriz funcional/UI:** [FUNCTIONAL_UI_COVERAGE.json](../design/FUNCTIONAL_UI_COVERAGE.json).
- **PR integral de pruebas ya fusionado:** [#55 merged](https://github.com/jdlc86/CartaViva/pull/55), solo pruebas (véase S35-1/S35-5). **PR abiertos actualmente: 0** (S35-6).
- **CI de ese PR:** [Bootstrap PG17 #42900656103](https://github.com/jdlc86/CartaViva/actions/runs/42900656103) · [Sabora CI #42900656064](https://github.com/jdlc86/CartaViva/actions/runs/42900656064) · [cobertura/UI #42900656026](https://github.com/jdlc86/CartaViva/actions/runs/42900656026).

### Precedencia normativa — no inventar ni reinterpretar

- [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md) y [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md).
- [Contrato cocina/sala](../architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md) con las decisiones vigentes del contrato consolidado «Voy a recoger» / «Cancelo»; no reinstaurar mecánicamente la antigua transición `picked_up`.
- [ROOT/ADMIN escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [contrato operativo de titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md) y [ADMIN_WRITE_OWNERSHIP_V1](../security/ADMIN_WRITE_OWNERSHIP_V1.md). Las solicitudes de cesión se dirigen al titular **resuelto en servidor**, nunca a un destinatario seleccionado arbitrariamente por el cliente.
- [Dos PWA independientes CV-012](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md).
- [Contrato de diseño](../DESIGN_SYSTEM_CONTRACT.md) y [auditoría del estilo visual aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md). La conformidad visual humana sigue separada del CI.

## 2. Fotografía comprobada al abrir la sesión 35 — 10-11-2026

**Repositorio exclusivo:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva). Lectura directa de GitHub al abrir esta continuidad:

| Dimensión | Estado comprobado | Consecuencia |
| --- | --- | --- |
| `main` | `7891b3050181134a958b06de008e81e38f6a4788` | HEAD con documentación posterior al merge funcional; no confundir con el SHA probado |
| Merge integral de desarrollo | [PR #54 merged](https://github.com/jdlc86/CartaViva/pull/54), commit `a91867fbacb9319d16496b04a5fe237739c31837` | Código acumulado ya incorporado a `main` |
| 32 PR ancestrales | **32 cerrados sin merge individual**, previa comprobación de que sus HEAD son ancestros de `main` | S4 de la familia ancestral finalizado |
| PR históricos restantes | **Nueve Draft abiertos:** #4/#5/#8/#17/#18/#19/#20/#21/#22 | Divergencias no homologadas ni cerradas |
| PR nuevo de integración | [#55](https://github.com/jdlc86/CartaViva/pull/55), abierto/Draft, base `main`, HEAD `7b6cd8d5db390d36b9302181b64a7fc2a0ed87c4` | **Total de PR abiertos: 10**. GitHub API: `mergeable=true`, `mergeable_state=clean` al corte; no implica autorización de merge |
| Modificación #55 | Un único archivo: `scripts/ci/customer-production-postgres17.test.mjs` (**55 adiciones, 0 eliminaciones**) | Test integrador ampliado; **ningún cambio de runtime, SQL, UI ni contratos normativos** |
| CI #55 | **3/3 workflows disparados: completed/success** en el HEAD `7b6cd8d5...` | Éxito automático acotado a los workflows que efectivamente se dispararon |
| Aceptación visual final | `skipped` en el workflow de cobertura | **No** equivale a aceptación humana |
| Estado de explotación | Propietario declara sin usuarios ni producción activa | No supone que Supabase esté vacío ni autoriza acceso operativo |

**Evidencia especial de la nueva prueba conectada, verificada en el log del job Bootstrap `generate-lockfile`, ID `130125437191`:**

```text
# S34 M3 owner PWA -> restricted PG17 -> public HTTP publication PASS
# S34 published withdrawal -> H3 blocked -> ADMIN restore PASS
ok 1 - real PG17 and Chromium complete the restricted H3/H4 full-stack flow
# tests 1
# pass 1
# fail 0
```

El test corresponde al [run Bootstrap #42900656103](https://github.com/jdlc86/CartaViva/actions/runs/42900656103) del commit **`7b6cd8d5`**. [Sabora CI #42900656064](https://github.com/jdlc86/CartaViva/actions/runs/42900656064) también `completed/success`; [cobertura funcional/UI #42900656026](https://github.com/jdlc86/CartaViva/actions/runs/42900656026) `completed/success`. Son **tres workflows de PR** activados por los filtros de rutas, **no** una nueva ejecución de los seis workflows históricos de `d49ee05b`.

## 3. Qué está implementado, qué está probado y qué NO está validado

### Implementado en `main` y probado previamente

- Identidad y límites de actor SQL/HMAC, permisos y roles, ADMIN titular escritor único, PWA cliente y gestión independientes, operaciones H3/H4, M3 dinámico, H6 y sus módulos integrados según las evidencias y limitaciones de [S34](SESSION_34_HANDOFF_2026-11-10.md) y [preflight](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md).
- E2E con categoría administrada desde PWA real, variantes Suave/Picante, precio publicado cambiado, consentimiento individual, cotización, confirmación, instantáneas SQL, idempotencia y líneas independientes en cocina; 6/6 workflows históricos sobre `d49ee05b` con base `main` y Sabora CI `success` post-merge sobre `a91867fb`.

### Implementado en PR #55 y comprobado en GitHub Actions (todavía no fusionado)

- ADMIN titular publica un plato con dos variantes en un PostgreSQL 17 desechable. Desde la PWA de gestión lo retira; el endpoint real de catálogo deja de servirlo.
- En la misma PWA cliente, ambas variantes sobreviven en la cesta, aparecen como retiradas y bloquean el checkout, sin emitir nueva cotización ni pedido.
- ADMIN republica el borrador; la PWA cliente conserva las dos variantes, y el circuito integral existente continúa con cambio de precio y consentimiento explícito hasta la confirmación y las instantáneas SQL.
- **Resultado:** log del escenario conectado **PASS 1/1** en Bootstrap, más tres workflows de PR `SUCCESS` en el mismo HEAD. **Esto prueba esa ruta**, no todos los supuestos de catálogo, pago y sala.

### No acreditado / puertas autónomas

- La composición integral final M3/H3–H6 con todos los opt-ins y el modelo H6 de `claimPickup`/ `cancelPickup`/ `correctReady` no queda homologada **por el solo** E2E de #55; revisar las suites H6 existentes antes de añadir otro escenario.
- La sincronización entre pestañas H3 ya tiene pruebas Chromium con mocks, pero no se ha convertido automáticamente en prueba SQL del mismo circuito de #55.
- Nueve PR históricos siguen **`diverged`** frente a `main`; en la auditoría S34-14 sus **88 menciones de archivos por PR** se distribuyen en **19 blobs idénticos, 69 evolucionados, ninguna ruta desaparecida**. Eso no demuestra paridad semántica ni que sus HEAD sean ancestros.
- Sin revisión independiente aprobatoria ni aceptación visual humana final F28/R09. Stripe remoto M4, CV-013, CV-014 pendiente normativo, recuperación M6/PITR y despliegue son puertas de activación posteriores, no pretexto para bloquear el desarrollo de código sin usuarios.

## 4. Bloque de arranque histórico de sesión 35 — reemplazado por la decisión post-S4 S35-7

**B35-A: culminación del circuito integrado existente y resolución de disposición de los nueve PR.** Evitar abrir un PR por cada asunto. La secuencia lógica es:

1. **Tomar #55 como un solo cambio integrador ya probado.** Inspeccionar logs definitivos y contenido del diff, comparar HEAD y base actuales, confirmar invariantes de retirada/republicación y el estado Git real; revisar si alguna brecha contractual exige corrección. Evaluar su incorporación a `main` **solo tras autorización de merge**, no confundir Draft/CI verde con permiso.
2. **Resolver las divergencias como familias:**
   - **#18–#22 (H3):** integridad local, agotados/retirados, cambios de precio, consentimiento por variante y sincronización. La ruta SQL/HTTP/Chromium de #55 y suites existentes refuerzan la prueba, pero no prueban todos los casos de borde; decidir sustitución o brecha concreta por contrato.
   - **#5 (M3/mesas):** categorías/pedidos ya conectados; contrastar gestión/readiness/QR y roles con los contratos y pruebas existentes.
   - **#4 (sala/cocina):** el antiguo `ready → picked_up` no sustituye la asignación «Voy a recoger», renuncia «Cancelo» ni corrección de cocina del H6 vigente. Revisar exclusión, concurrencia y denegaciones del flujo moderno.
   - **#8 (SQL/actor):** proteger HMAC, revalidación tras locks, expiración, suplantación, revocación y permisos mínimos. Requiere dictamen especialmente estricto por ser frontera de seguridad.
   - **#17 (HTTP GET):** validar tipos escalares, cursores y errores denegados en la ruta efectiva. El control figura en `order-operations-http.mjs`.
3. **Emitir un único dictamen de disposición nominal, con contrato, delta exclusivo, ruta actual y prueba exacta.** Clasificar por PR: `equivalencia demostrada`, `sustituida conforme a norma`, `brecha concreta` o `no verificada`. Solo tras esa decisión y autorización específica proceder a cierres **sin merge** de ramas históricas que se resuelvan; no restaurar commits antiguos de manera automática.
4. **Cerrar el hito con las baterías integradoras existentes**, de PostgreSQL 17/HTTP/Chromium y seguridad pertinentes. Pruebas aisladas nuevas únicamente para diagnosticar un fallo o proteger un requisito crítico, nunca como sustituto de la integración. Registrar por separado: código implementado, tests realmente ejecutados, validación independiente, decisión de merge/cierre.

**Objetivo operativo:** cerrar S4 con menos PR redundantes y garantías verificadas, conservando el alcance un solo restaurante, sin mezclar saneamiento administrativo con activación productiva. La ausencia de usuarios reduce barreras productivas de datos, **no** las exigencias de seguridad funcional.

## 5. Límites, permisos y disciplina documental

- **Solo** se permite actuar en `jdlc86/CartaViva`. Fleetia es otro proyecto y comparte VPS: **prohibido tocar sus repositorios, contenedores, datos, recursos, volúmenes o redes**; desplegar, reiniciar o eliminar Sabora no debe detener, modificar ni depender de contenedores ajenos.
- No desplegar ni ejecutar migraciones/roles en Supabase operativo ni intervenir en el VPS por la existencia de CI. Toda actuación de despliegue requiere permiso **expreso** y aislamiento.
- Los merges de nuevos PR, cierres de las nueve divergencias, modificaciones de protección de `main` y despliegues son decisiones distintas. La autorización histórica para integrar #54 y cerrar 32 ancestrales **no** se amplía automáticamente.
- Fuente de verdad: **documentos normativos de GitHub**. La continuidad y el tablero sirven para contexto y evidencias con su fecha, no para crear reglas nuevas.
- **Desde este punto, el documento vivo de continuidad es esta sesión 35**. Añadir hitos significativos aquí con enlaces a commit/PR/workflows y resultado comprobado; actualizar el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) cuando se cierre un hito, sin reescribir ni engordar la continuidad 34. No lanzar suites redundantes para simples commits `[skip ci]`.

## 6. Registro vivo de sesión 35

### S35-0 — apertura y revalidación de la prueba integradora

**Realizado:** creación de esta continuidad en `main`, con enlaces a S34, contratos, tablero, matriz, conciliación de nueve divergentes, PR #55 y acciones concretas. Se reconsultaron **10 PR abiertos** (9 históricos + #55), `main@7891b305`, PR #55 `7b6cd8d5` Draft/base `main` con `mergeable_state=clean` y sus **tres workflows `completed/success`**. El log Bootstrap confirma explícitamente `S34 published withdrawal -> H3 blocked -> ADMIN restore PASS` y escenario PostgreSQL 17/Chromium **1/1 PASS**.

**No realizado por esta apertura:** modificación de código producto, ejecución manual nueva de pruebas, revisión independiente, merge de #55, cierre de los nueve PR, cambios de protección, despliegue, migración Supabase operativa ni acción sobre VPS/Fleetia.

**Siguiente hito:** revisión final del alcance del PR #55 ya probado, decidir integración de desarrollo de manera explícita y resolver la matriz semántica de nueve PR en bloques completos; **S4 sigue NO FINALIZADO**.


### S35-1 — integración de desarrollo del PR #55 en `main` (10-11-2026)

**Autorización y ámbito:** el propietario indicó «Okkk adelante» para la evaluación/integración del PR #55 y la continuación de la conciliación. Se confirmó **antes del merge**: PR abierto/Draft, un único commit `7b6cd8d5db390d36b9302181b64a7fc2a0ed87c4`, un archivo modificado `scripts/ci/customer-production-postgres17.test.mjs` (**+55/−0**), `mergeable_state=clean`, y 3/3 workflows `completed/success` sobre el HEAD, incluyendo recorrido PG17/HTTP/dos PWA/Chromium **1/1 PASS** de retirada/restauración H3. `main` avanzó solo con cuatro commits documentales no contenidos en la rama desde su base, y el cotejo `compare(main,...HEAD)` mostró **una única ruta de código diferente** y ningún conflicto; no se alteraron runtime/SQL/UI.

**Acciones realmente ejecutadas:** #55 pasó de Draft a Ready for Review, y se fusionó con el método `merge` preservador de historial y `expected_head_sha=7b6cd8d5...`. Resultado GitHub [#55 merged](https://github.com/jdlc86/CartaViva/pull/55), [commit `b41713d8318622f204cf96162d03a6eaa6454a76`](https://github.com/jdlc86/CartaViva/commit/b41713d8318622f204cf96162d03a6eaa6454a76); la rama anterior es ancestro directo: `compare(base=7b6cd8d5...,head=b41713d8...)` devolvió `status=ahead`, `behind_by=0`, `merge_base=7b6cd8d5...`. `main` reconsultado en ese SHA. Censo posterior: **nueve PR abiertos**, #4/#5/#8/#17/#18–#22; **#55 cerrado por merge**. Ninguno de los nueve fue cerrado o fusionado.

**Nueva ejecución de `main`**: [Sabora CI push #42907471778](https://github.com/jdlc86/CartaViva/actions/runs/42907471778) disparada sobre `b41713d8`, **`in_progress` en el primer corte**; no declararla PASS hasta observar su final. Las tres pruebas históricas ya verdes del PR corresponden solo a `7b6cd8d5`.

**Gobierno:** no se hizo revisión independiente aprobatoria ni aceptación visual humana final; la integración es únicamente de código de desarrollo. No se usaron recursos de Supabase operativo, no se desplegó, y no se actuó sobre el VPS ni Fleetia. La resolución administrativa de los **nueve PR divergentes** queda separada y requiere dictamen semántico verificable, no suposición de genealogía o autorización retrospectiva del merge de #55.


### S35-2 — conciliación semántica integrada de nueve PR y propuesta administrativa (10-11-2026)

**Informe nuevo, versionado:** [SABORA_S35_POSTMERGE_NINE_PR_DISPOSITION_2026-11-10.md](../reviews/SABORA_S35_POSTMERGE_NINE_PR_DISPOSITION_2026-11-10.md). Se revalidaron directamente los HEAD de los **nueve PR Draft abiertos** (números #4/#5/#8/#17/#18–#22) tras el merge de #55, se consultaron las rutas efectivamente montadas y se cotejaron las suites integradoras existentes con los **logs reales de [Bootstrap PG17 #42900656103](https://github.com/jdlc86/CartaViva/actions/runs/42900656103)** en el commit `7b6cd8d5`. No se lanzaron suites nuevas para rehacer pruebas ya existentes.

**Nueva evidencia específica de H6:** [`scripts/ci/order-operations-read-postgres17.test.mjs`](../../scripts/ci/order-operations-read-postgres17.test.mjs), subtest `ok 8 - Chromium + real JWT + one Fastify listener closes H4 ready, H6 pickup and durable SSE`, recorre **PWA gestión Chromium → JWT → Fastify real → PostgreSQL 17**, con claim/cancel desde botones «Voy a recoger»/«Cancelo», ID compacto del camarero, SSE, carrera entre dos camareros (HTTP 200/409), replay idempotente y denegación de rol. [`scripts/ci/h6-postgres17.test.mjs`](../../scripts/ci/h6-postgres17.test.mjs) añade pruebas de exclusividad, renuncia sin cancelar pedido/pago y corrección de cocina solo tras liberar tarea. Esto reduce una incertidumbre sobre #4 que antes figuraba como no integrada; **no acredita aprobación visual final**.

**Otras evidencias explícitas de logs:** `ok 1` M3 mesas (roles mínimos, rollback, replay y paginación), `ok 2` M3 categorías dinámicas publicadas/ocultadas/restauradas, `ok 6` SQL incapaz de suplantar actor mediante UUID/GUC/rol/RPC antigua y `ok 3` lectura SQL incapaz de ampliar permisos, burlar expiración o reutilizar actor. El #55 añade la retirada/restauración de un producto en una PWA real con la cesta H3 bloqueada y dos variantes conservadas.

**Propuesta de lote único**, todavía **sin autorización específica de cierre ni acción de cierre**: #18/#19/#20/#21/#22 (H3), #5 (M3), #17 (validación HTTP GET) y #4 (cocina/sala sustituida por H6 vigente) como **ocho candidatos a cerrar sin merge** al estar sustituidas sus obligaciones históricas; conservar **#8 abierto** hasta revisión independiente de la frontera HMAC/actor SQL, o aceptación explícita y documentada del riesgo residual. El dictamen **no confunde** pruebas con garantía total, ni equivalencia semántica con ancestro Git, ni cierre documental con aceptación visual/activación.

**Acciones:** documento S35 de conciliación creado, ningún PR divergente cerrado, ninguna modificación adicional de runtime/SQL. La nueva [CI push de `main` #42907471778](https://github.com/jdlc86/CartaViva/actions/runs/42907471778) sigue pendiente de cierre concluyente en este corte, en SHA `b41713d8`. Continuidad activa **35**; sesión 34 inalterada. Ninguna operación en Supabase operativo, VPS o Fleetia.


### S35-3 — cierre administrativo en lote de ocho PR históricos, sin merge (10-11-2026)

**Decisión de ejecución:** continuación expresa del usuario inmediatamente después de la propuesta documentada de cerrar **ocho candidatos**, manteniendo #8 sin cerrar. Antes de actuar se reconsultaron GitHub y la CI del merge, se verificaron los mismos HEAD históricos y su divergencia frente a `main`. La diferencia Git no se trató como un permiso automático: la base funcional fue [el dictamen S35](../reviews/SABORA_S35_POSTMERGE_NINE_PR_DISPOSITION_2026-11-10.md) y los ensayos PG17/Chromium ya confirmados.

**Operaciones realizadas y verificadas:** se publicó **un comentario razonado en cada PR**, con enlace al dictamen S35, al merge #55 y al [Bootstrap PG17 #42900656103](https://github.com/jdlc86/CartaViva/actions/runs/42900656103), así como el alcance y las pruebas específicas de la sustitución. A continuación se cerraron por GitHub, **sin merge individual ni borrado de ramas**:

| PR | Familia sustituida | Resultado confirmado |
| --- | --- | --- |
| [#4](https://github.com/jdlc86/CartaViva/pull/4) | Recogida sala/cocina histórica → H6 actual | `closed / merged=false` |
| [#5](https://github.com/jdlc86/CartaViva/pull/5) | M3 mesas/catálogo | `closed / merged=false` |
| [#17](https://github.com/jdlc86/CartaViva/pull/17) | Validación HTTP de lecturas/cursor | `closed / merged=false` |
| [#18](https://github.com/jdlc86/CartaViva/pull/18) | Integridad de selección H3 | `closed / merged=false` |
| [#19](https://github.com/jdlc86/CartaViva/pull/19) | Incidencias de cesta H3 | `closed / merged=false` |
| [#20](https://github.com/jdlc86/CartaViva/pull/20) | Precios/consentimientos H3 | `closed / merged=false` |
| [#21](https://github.com/jdlc86/CartaViva/pull/21) | Revisión de incidencias H3 | `closed / merged=false` |
| [#22](https://github.com/jdlc86/CartaViva/pull/22) | Multitab/variantes H3 | `closed / merged=false` |

**Verificación independiente del resultado administrativo (lectura GitHub posterior al cierre):** el listado `pulls?state=open` contiene **únicamente [#8](https://github.com/jdlc86/CartaViva/pull/8)**, Draft, HEAD `8818366c79893a8fd78dee6a089fd990a71a9c52`. No se ejecutó ningún merge en estos ocho. **Se redujeron nueve PR abiertos a uno**. S4 histórico está saneado en 8/9, pero **S4 global NO FINALIZADO** hasta dictamen/decisión #8; ningún check funcional nuevo se infiere del cierre de PR.

**CI relacionada, estado al corte:** [Sabora CI push post-merge #42907471778](https://github.com/jdlc86/CartaViva/actions/runs/42907471778) en `b41713d8` aún `in_progress`; no atribuir `SUCCESS` hasta leer GitHub. El `main` reconsultado tras los commits de documentación era `cb2c44bc32edf8cf3518c5804a4cee73a5b006b3`. Sin modificaciones de runtime, SQL, UI, secretos, Supabase operativo, VPS o Fleetia.

**Próximo bloque:** resolver la revisión de seguridad de #8 sin denominar «revisión independiente» a un análisis propio; cerrar su alcance y riesgo documentados, después evaluar un saneamiento S4 definitivo. Además verificar CI post-merge con SHA exacto.


### S35-4 — preflight de seguridad del único PR abierto #8 y rectificación probatoria (10-11-2026)

**Auditoría técnica adicional, no independiente:** se releyeron [#8](https://github.com/jdlc86/CartaViva/pull/8), sus dos comentarios, las revisiones formales registradas (ninguna) y los blobs originales frente a `main`. El [dictamen S35 §6](../reviews/SABORA_S35_POSTMERGE_NINE_PR_DISPOSITION_2026-11-10.md#6-preflight-técnico-específico-del-único-pr-pendiente-8--s35-4-10-11-2026) conserva el detalle, rutas, versiones y límites.

**Rectificación necesaria:** la documentación histórica del **candidato original de #8 sí afirma que se hizo una revisión independiente** y que corrigió dos hallazgos: uso inseguro de `NULL` SQL y validación tardía del rol owner. El comentario del PR registra CI positiva del SHA antiguo `8818366c...`. No hay `APPROVED` formal en GitHub para ese PR. **No significa que nunca hubo revisión**; la que falta para decidir #8 es una evaluación independiente **del código vigente en `main`**, donde el emisor HMAC conserva exactamente el blob, pero migración SQL, preflight, repositorio y pruebas PG17 son versiones evolucionadas. No extrapolar revisión de un candidato histórico a otra versión sin examinar cambios.

**Evidencia actual, sin pruebas nuevas:** el SQL sigue con firma HMAC y `session_user`, rechazo `NULL`, comparación `IS DISTINCT FROM`, vencimiento revalidado tras locks y control de owners; el test PG17 actual prueba falsificación, revocación, carreras y denegación SQL. La semántica `picked_up` legada solo existe tras un contrato histórico y la ruta pública candidata monta `legacyPickupDisabled:true`; debe comprobarse cualquier otro acceso al wrapper para no rehabilitar ese estado por privilegios. Seguridad independiente, claves operativas/rotación y activación son controles distintos.

**Estado:** [#8](https://github.com/jdlc86/CartaViva/pull/8) sigue el **único PR abierto**, Draft, sin merge ni cierre; ocho PR históricos ya cerrados sin merge y con comentarios de justificación. No se hizo revisión externa nueva ni se ejecutaron migraciones o despliegues. **S4 global NO FINALIZADO** hasta decisión y evidencia de seguridad aplicable a `main`.


### S35-5 — CI de `main` posterior al merge #55: SUCCESS (10-11-2026)

**Resultado definitivo, reconsultado en GitHub:** [Sabora CI push #42907471778](https://github.com/jdlc86/CartaViva/actions/runs/42907471778) sobre `b41713d8318622f204cf96162d03a6eaa6454a76` figura **`completed / success`**, con job `validate` `completed / success` y ninguna etapa con `failure`. La ejecución terminó según GitHub el **2026-11-10 21:56:57 UTC**. Es una verificación **post-merge** separada de las tres ejecuciones SUCCESS que habían validado el HEAD del PR #55.

**Comparación de alcance:** `compare(b41713d8... → d9205f59...)` = `ahead`, `behind=0`, **10 commits únicamente documentales**, con tres rutas tocadas: continuidad S35, dictamen S35 y tablero vivo. Ningún cambio de aplicación/SQL/UI desde el merge. Los commits documentales posteriores `[skip ci]` **no tienen ejecución CI propia** y no la requieren para atribuir al código funcional probado el resultado anterior.

**Cierre de fotografía S35:** código de desarrollo de #55 integrado y validado después del merge, ocho PR históricos cerrados sin merge ni borrado de ramas, **único PR abierto #8**. S4 pendiente únicamente del dictamen y decisión de seguridad del estado actual. Esta validación no sustituye aceptación visual final, revisión independiente actual, Stripe remoto, claves operativas/recuperación ni despliegue. Sin cambios en Supabase operativo, VPS o Fleetia.


### S35-6 — conciliación definitiva del PR #8 y cierre de S4 administrativo (10-11-2026)

**Expediente técnico de este hito:** [SABORA_S35_PR8_ACTOR_SQL_CONSOLIDATION_2026-11-10.md](../reviews/SABORA_S35_PR8_ACTOR_SQL_CONSOLIDATION_2026-11-10.md). El cotejo de **los 21 archivos** del HEAD histórico `8818366c...` vs. `main` muestra **21 rutas presentes**, **3 blobs idénticos**, **18 evolucionados**, **0 faltantes**. El emisor HMAC conserva exactamente el blob original; la migración SQL de transición conserva las **400 líneas anteriores** como subsecuencia ordenada e introduce **9 líneas** de revalidación de expiración después de adquirir el lock de la línea. Se comprobaron **56/56 títulos originales** de seis suites de seguridad en `main`, a los que se añaden **25 títulos nuevos**. Conservar títulos no demuestra por sí solo equivalencia de todos los cuerpos; se contrastó con la ejecución real [Bootstrap PG17 #42900656103](https://github.com/jdlc86/CartaViva/actions/runs/42900656103) (`ok 6,7,10,11,12,14` en su harness de seguridad), con la [CI posterior al merge #42907471778](https://github.com/jdlc86/CartaViva/actions/runs/42907471778) `completed/success` sobre `b41713d8` y con el montaje actual del candidato M2 (`legacyPickupDisabled:true`).

**Decisión técnica de alcance:** la versión histórica del PR #8 no aporta un archivo o control de seguridad ausente que requiera merge o cherry-pick. Se reconoce **revisión independiente histórica documentada**, pero **no se ha realizado revisión independiente nueva del runtime acumulado de `main`**. Esta auditoría de la misma sesión es un **preflight de conciliación**, no certificación.

**Acción administrativa realmente ejecutada:** se publicó en [PR #8](https://github.com/jdlc86/CartaViva/pull/8#issuecomment-6780618504) el dictamen con los límites y después se cerró por GitHub. La respuesta directa confirmó `state=closed` y `merged=false`; **la rama no se borró**. El endpoint GitHub `pulls?state=open` se reconsultó después: **0 PR abiertos** en `jdlc86/CartaViva`. La secuencia de saneamiento: 32 PR ancestrales cerrados sin merge individual durante S34, #54 integrado como único bloque principal, ocho divergentes cerrados por sustitución durante S35, #55 integrado como prueba de regresión y #8 cerrado por sustitución con expediente de seguridad.

**Estado del hito:** **S4 — SANEAMIENTO ADMINISTRATIVO DEL REPOSITORIO FINALIZADO** (**cero PR abiertos**; cambios de código integrados y sus pruebas CI registradas). **No confundir con S4 de aceptación integral o GO operativo**: la **revisión independiente de la seguridad de `main`** continúa abierta como puerta propia y no queda satisfecha por el cierre histórico, igual que la aceptación visual humana F28/R09, claves/rotación, Stripe sandbox remoto, pruebas de instalación/recuperación y permiso de despliegue. Sin certificación de producción.

**Operaciones prohibidas/no realizadas:** no se lanzó CI nueva por este cierre documental, no se cambió código aplicativo, SQL ni normas, no se otorgaron claves o grants operativos, no se accedió a Supabase operativo y no se tocó el VPS compartido ni Fleetia. Desde esta sesión solo actualizar **la continuidad 35** y el tablero con futuros hitos; no reabrir ramas antiguas sin necesidad contractual concreta.

**Próximo bloque de valor:** reordenar la hoja de ruta técnica post-saneamiento con sus gates separados (seguridad independiente actual, conformidad visual frente a referencia aprobada, pruebas integrales restantes y preparación de activación) y cerrar hitos completos, no abrir nuevos PR únicamente para representar pruebas ya existentes.


### S35-7 — revisión integral post-saneamiento y elección del siguiente bloque funcional (10-11-2026)

**Evidencia documentada y versionada:** [SABORA_S35_POST_S4_PRODUCT_READINESS_2026-11-10.md](../reviews/SABORA_S35_POST_S4_PRODUCT_READINESS_2026-11-10.md). Se consultaron de nuevo GitHub (`main@9d7d7fa385726566bf197cd6d0c68638932cbc71` al comenzar el corte, árbol recursivo `truncated=false` con **952 blobs**, **0 PR abiertos**) y las ejecuciones [3/3 #55](https://github.com/jdlc86/CartaViva/pull/55) más [CI push #42907471778](https://github.com/jdlc86/CartaViva/actions/runs/42907471778) `completed/success` del SHA de merge `b41713d8`. Los commits documentales posteriores **no son ensayos funcionales nuevos**.

**Matriz de ejecución actual contrastada:** [F/R §40](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) sigue siendo la fuente de trazabilidad de 38 filas; F20 y R03–R05 dependen de Stripe sandbox real, F28/R09 de aceptación visual humana. M2/M3 tienen circuitos completos **opt-in** de PG17+Fastify+dos PWA; `apps/api/src/server.mjs` **continúa health-only**. CV-014 anuncios (con imagen opcional) y llamada a sala disponen de candidato funcional, pero reservas anticipadas exigen decisiones temporales/límites no cerradas en RF; CV-013 Excel necesita política empresarial/retención, y M6 seguridad externa e infraestructura autorizada. No inventar estas condiciones ni llamar «CERRADO» a una fila por haber saneado GitHub.

**Hallazgo nuevo concreto para programación:** `apps/api/src/m3-management-http.mjs` devuelve `verifiedTablePermissions` **por rol, no por titularidad** (`configure/qr=true` para un ADMIN no titular, `readiness/occupancy=true` para ROOT), y `apps/management/src/views/TablesView.tsx` habilita la interfaz conforme a esa proyección. PostgreSQL, mediante `verify_management_capability_m3` de la migración `20261108121000...`, **niega** escrituras administrativas a ADMIN no titular/ROOT y solo exceptúa acciones operativas de camarero. **Brecha observable de veracidad UI/autorización representada; no se ha probado bypass de SQL ni realizado un E2E nuevo.** Los tests actuales sí cubren denegación SQL y transferencia, pero no la coherencia UI con el titular vigente.

**Siguiente bloque íntegro H35-P1 seleccionado, todavía no implementado:** capacidades efectivas calculadas en frontera servidor/SQL con titular durable actual, aplicadas a PWA gestión Mesas/QR, Catálogo y Configuración/anuncios; transferencia ADMIN A→B, revocación del permiso viejo y recuperación por evento; roles ROOT/camarero, reintentos, auditoría y fallos sin escritura parcial. Validación **en una sola suite PG17 desechable + JWT/HMAC + Fastify + PWA gestión/cliente Chromium**, seguridad SQL y diseño aprobado. No crear tests diminutos o PR por cada pantalla. La normativa de único escritor y prohibición de polling sigue siendo la autoridad.

**Actualización ejecutada de seguimiento:** el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) ya abre con **estado S35 vigente** en lugar del encabezado histórico engañoso «#54 Draft/47 PR abiertos» y enlaza informe post-S4 y hito H35-P1. El histórico permanece identificable como antecedente. Se publicó el informe, pero **no hubo cambios de código, migraciones, interfaz ni ejecución de pruebas en este hito documental**. S4 administrativo finalizado; **H35-P1 por desarrollar**, seguridad independiente, aceptación humana y activación por resolver. Sin operación de Supabase operativo, VPS, Fleetia o despliegues.


### S35-8 — H35-P1 en PR único #56: permisos efectivos del ADMIN titular (10-11-2026)

**Hito de implementación significativo, NO declaración de validación:** [PR #56 Draft](https://github.com/jdlc86/CartaViva/pull/56), única rama `feat/sabora-s35-effective-admin-write-permissions-20261110`, base `main`. SHA de código **`d60b68afe74a6abe3da0971f171d78f6ba42b4ab`** al registrar este corte. Implementación sigue en PR, **no** en `main`, y **no ha sido fusionada ni desplegada**.

**Contratos fuente de verdad:** [RF](../REQUISITOS_FUNCIONALES.md), [ROOT/ADMIN escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [titularidad y cesión](../security/ADMIN_WRITE_OWNERSHIP_V1.md), [aprobación de diseño](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [normativa de hitos completos](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md). Hallazgo y alcance precisos: [auditoría de selección S35](../reviews/SABORA_S35_POST_S4_PRODUCT_READINESS_2026-11-10.md).

**Código IMPLEMENTADO en el candidato, no probado por inferencia:**
1. Nueva migración versionada `20261110232000_sabora_m3_effective_management_permissions_candidate.sql`. Sustituye las lecturas SQL restringidas ya existentes de mesas M3 y anuncios M5 sin añadir endpoints anónimos ni titulares expuestos. Computa `permissions` efectivas de ADMIN titular, ADMIN no titular, ROOT y camarero; usa el singleton `admin_write_ownership` protegido por RLS, verifica capacidad firmada HMAC/rol y preserva los gates de escritura SQL. **Orden de locks rectificado**: primero `admin_write_ownership FOR SHARE`, después firma/keyring/empleado, consistente con transferencia `FOR UPDATE`; no reintroduce deadlocks por adquirir locks en orden inverso.
2. `m3-management-http.mjs` **eliminó** la proyección HTTP falsa de permisos `role==='admin'` y exige campos exactos originados en PostgreSQL; `tables-read-model.js` admite la proyección fail-closed (cuatro booleanos) de no titular y ROOT. `m3-authenticated-management-gateway.js` conserva el permiso firmado de Comunicaciones y tipado coherente en `m5-communications-model.ts`.
3. `main.tsx` y las vistas Mesas/QR, Catálogo y Comunicaciones muestran edición solo cuando la lectura específica acredita el permiso vigente; la PWA conserva consulta para no titular y operaciones independientes de camarero, y actualiza por navegación/foco/retorno y decisión local de titularidad, **sin polling periódico**. M5 puede funcionar aunque su módulo no tenga la lectura M3 montada, sin permiso por rol inventado.
4. Integración ampliada en **un test PG17 ya existente** `scripts/ci/ownership-governance-postgres17.test.mjs`: misma base desechable, JWT real, HMAC, Fastify, dos PWA Chromium; M3 Mesas/Catálogo y M5 Comunicaciones conectados, titular y no titular, ROOT/camarero, transferencia/recuperación forzada, revocación visual y POST antiguo denegado, con restauración del propietario del escenario. El test PG17 M3 existente también compara permisos A→B y replays. **Este código está escrito; no confundirlo todavía con resultado PASS observado**.
5. Registro individual de auditoría de la nueva migración en `scripts/ci/migration-audit.mjs`; pin de los 6 workflows a `ubuntu-24.04` porque `ubuntu-latest` pasó a Ubuntu 26.04, incompatible con Playwright 1.56.1. **No se desactivaron tests ni se degradó su cobertura**.

**Resultados de GitHub verificados al corte:** primeras ejecuciones sobre `d04c3986` fallaron por migración ausente de inventario y Chromium en Ubuntu 26.04; segundo corte `e7b0815` alcanzó cuatro workflows de UI/PWA SUCCESS, pero CV-014 integrado desveló acoplamiento indebido de Comunicaciones al lector de mesas; corregido con su propia proyección SQL firmada. El corte `d558dc2` pasó tests Node pero detectó tipo TypeScript ausente en la PWA; corregido. **El SHA actual `d60b68a` está bajo CI**, runs [Sabora CI #42919142494](https://github.com/jdlc86/CartaViva/actions/runs/42919142494), [Bootstrap PG17 #42919142482](https://github.com/jdlc86/CartaViva/actions/runs/42919142482), [gestión #42919142474](https://github.com/jdlc86/CartaViva/actions/runs/42919142474), [CV-012 #42919142508](https://github.com/jdlc86/CartaViva/actions/runs/42919142508), [cliente #42919142441](https://github.com/jdlc86/CartaViva/actions/runs/42919142441) y [UI coverage #42919142562](https://github.com/jdlc86/CartaViva/actions/runs/42919142562). **No asignar 6/6 PASS mientras existan jobs en curso**; hay SUCCESS confirmados en los gates rápidos de gestión, CV-012 y cobertura funcional, pero falta cierre PostgreSQL/cliente/CI del mismo SHA.

**Pendiente para llamar al hito candidato técnicamente validado:** verificar logs completos de PG17 con la prueba nueva y la regresión CV-014, tres roles y cambio de titularidad; comprobar CI 6/6 del mismo SHA, corregir fallos dentro del **mismo PR**, sin abrir PR redundantes. La convalidación visual humana, seguridad independiente y activación siguen siendo puertas separadas. No se ha usado Supabase operativo, desplegado en VPS, modificado Fleetia ni consumido Stripe real.



### S35-9 — comprobación de CI final del PR #56 (11-11-2026)

**Corte contrastado directamente con GitHub, corrige la afirmación temporal «CI en curso» de S35-8.** Único PR abierto: [#56 Draft](https://github.com/jdlc86/CartaViva/pull/56), no fusionado y no desplegado. HEAD del PR y último SHA sometido a seis workflows: **`d60b68afe74a6abe3da0971f171d78f6ba42b4ab`**, ocho commits de implementación/corrección. En la consulta el `main` era **`88106b10a0f048035a087bcbc637cce6633dd6c0`**; la rama del PR estaba **8 commits por delante y 1 por detrás** de `main` (`compare` = `diverged`). No asumir que el SHA del PR esté en `main`, ni rebasar/mergear antes de validar.

**Estado definitivo de las seis ejecuciones del mismo HEAD `d60b68a`:**

| Workflow | Run | Estado |
| --- | --- | --- |
| Sabora functional UI coverage and deferred visual acceptance | [#42919142562](https://github.com/jdlc86/CartaViva/actions/runs/42919142562) | **SUCCESS** |
| Sabora CV-012 independent PWA installability | [#42919142508](https://github.com/jdlc86/CartaViva/actions/runs/42919142508) | **SUCCESS** |
| Sabora management browser visual smoke | [#42919142474](https://github.com/jdlc86/CartaViva/actions/runs/42919142474) | **SUCCESS** |
| Sabora client browser conformance | [#42919142441](https://github.com/jdlc86/CartaViva/actions/runs/42919142441) | **SUCCESS** |
| Sabora CI — H6 consolidated acceptance | [#42919142494](https://github.com/jdlc86/CartaViva/actions/runs/42919142494), job `130189235350` | **FAILURE** |
| Bootstrap Sabora lockfile — «Exercise real Node pg driver against disposable loopback-only PostgreSQL 17» | [#42919142482](https://github.com/jdlc86/CartaViva/actions/runs/42919142482), job `130189235117` | **FAILURE** |

**Diagnóstico observado en los logs, sin atribuir causa no probada:** ambos workflows rojos llegan al **mismo escenario conectado** `scripts/ci/cv014-communications-postgres17.test.mjs`, test «CV-014: actual PostgreSQL17 → signed Fastify → two Chromium PWAs → published notices, scheduling, roles, events and audit», **línea 235**. Tras guardar un borrador desde la PWA ADMIN y publicar expresamente, la prueba consulta la proyección pública y exige **2 anuncios**, pero devuelve **1**: `AssertionError: 1 !== 2` (`expected:2, actual:1`). En el test consta la validación previa de un borrador duradero y del cuerpo formateado; **el fallo se manifiesta en la proyección pública posterior a la publicación**, sin demostrar todavía si la raíz está en programación/horario, consulta, refresco, permisos, datos de preparación o regresión. No es correcto declararlo meramente «fallo de CI», ni afirmar que el componente de titularidad ya está probado de extremo a extremo. El job Bootstrap ha ejecutado previamente otras suites PG17 con PASS, pero su resultado global sigue siendo FAILURE.

**Qué se ha implementado frente a qué se ha validado:**
- **Implementado en rama**: migración SQL versionada de permisos efectivos vinculados al titular ADMIN; API de mesas fail-closed; propagación a las PWA de gestión de Mesas/QR, Catálogo y Comunicaciones; invalidación tras navegación/foco/cesión; integración ampliada de PG17/JWT/HMAC/Fastify y Chromium en el test de titularidad; registro de la migración en inventario auditado y compatibilidad de runner de Playwright con Ubuntu 24.04. **Esto no equivale a validación funcional íntegra.**
- **Pruebas realmente terminadas PASS**: cuatro workflows del mismo SHA, entre ellos instalación de dos PWA, smoke visual automatizado, conformidad de cliente y cobertura funcional automatizada. No es aprobación humana del aspecto visual.
- **Pruebas realmente terminadas FAIL**: dos gates integradores, ambos cortados por CV-014 en la comprobación 1/2 de anuncios publicados; por tanto **NO-GO** para dar por terminado H35-P1, revisar formalmente para merge o integrar en `main`. No atribuirle 6/6 ni esconder el escenario fallido.

**Secuencia de commits del PR, contrastada con GitHub:** `563a2af900c6` (SQL/API/mesas), `d04c3986dbe2` (vistas gestión), `e7b0815154c7` (auditoría y runner), `f50707f3ed2c` (escenario integral de titularidad), `d558dc2c542a` (independencia de M5), `088eeeba5a0c` (tipos M5), `4bf5294bd5e4` (reconciliación ROOT recuperado), `d60b68afe74a` (orden de locks de titularidad antes de clave/empleado). **Último trabajo de código verificado: `d60b68a`; esta actualización es solo documental en `main`.**

**Siguiente paso operativo — un solo bloque, no micro-PRs:** diagnosticar el recorrido real CV-014 completo **publicación→proyección pública→PWA cliente**, corregir el defecto en la **misma rama y PR #56** sin falsear la aserción ni introducir anuncios de prueba adicionales para que pase; reejecutar y comprobar los **seis workflows sobre un único SHA final** incluyendo el test de titularidad. Solo entonces evaluar `merge` con evidencia y contrato normativo. Mantener revisión independiente de seguridad y aprobación visual humana como puertas separadas. No se modificaron Supabase operativo, servidores VPS ni Fleetia; ningún despliegue fue realizado o autorizado en este corte.

**Estado S35-9: continuidad actualizada; H35-P1 IMPLEMENTADO EN RAMA, NO VALIDADO, PR DRAFT, CI 4 SUCCESS / 2 FAILURE.**



### S35-10 — corrección CV-014 y desacoplamiento real del editor de Catálogo (11-11-2026)

**Seguimiento activo único:** [PR #56 Draft](https://github.com/jdlc86/CartaViva/pull/56), rama `feat/sabora-s35-effective-admin-write-permissions-20261110`. Commit candidato al corte **`1137ed8d3dde81f97e33cb5a26e4caef12e03ef3`**; aún **sin merge ni despliegue**. S35-9 contiene el corte anterior y **no debe tratarse como estado CI actual**.

**Incidencia CV-014 reproducida y causa diagnosticada (no regresión de publicación):** el [log de CI #42919142482](https://github.com/jdlc86/CartaViva/actions/runs/42919142482) fallaba en `scripts/ci/cv014-communications-postgres17.test.mjs:235`, con **1 anuncio público observado frente a 2 esperados**. A las `2026-11-10T22:59:52Z` eran las **23:59:52 Europe/Madrid**; el test publicaba la segunda noticia para `00:00–23:59` y el lector PG17 considera **`time_local < time_until`** (límite final exclusivo). El SQL devolvió correctamente 1. **Corrección versionada en `673e180d39cc`**: mismo test integrado, sin quitar aserciones, selecciona de forma determinista una zona IANA `Etc/GMT±N` cuyo horario local está alrededor de las 12:00 para el instante UTC, pone explícitamente `Fecha desde` y comprueba que se conservan la zona/fecha en PostgreSQL, manteniendo anuncio programado, publicación, imagen, SSE y dos PWA reales. El nuevo escenario CV-014 dio **PASS** durante Bootstrap PG17 de [#42997077436](https://github.com/jdlc86/CartaViva/actions/runs/42997077436), pero **el workflow global falló después** por otra suite.

**Fallo posterior genuino H3/H4 identificado con el log [#42997077592](https://github.com/jdlc86/CartaViva/actions/runs/42997077592):** el test `customer-production-postgres17.test.mjs:941` esperaba la cabecera «Editor de carta» y expiraba. La composición H3/H4 incluye lector/escritor SQL M3 de Catálogo **pero deliberadamente no activa la lectura de Mesas**. La proyección añadida inicialmente en H35-P1 habilitaba Catálogo a partir del permiso de **Mesas**, por lo que el editor quedaba en consulta aun para ADMIN titular válido. Es una dependencia cruzada errónea que afecta al producto, **no se corrige silenciando el test o concediendo escritura por rol**.

**Corrección integral de esa dependencia en `1137ed8d3dde`:**
- Se amplía la **misma migración candidata** `20261110232000_sabora_m3_effective_management_permissions_candidate.sql` con `CREATE OR REPLACE sabora.read_admin_catalog_m3_candidate(jsonb)`, preservando función/owner/EXECUTE exactos, RLS y validación de la capacidad HMAC. Bajo `admin_write_ownership FOR SHARE` **antes** de keyring/staff (orden de lock de gobierno), calcula `permissions.manage` booleano para el ADMIN titular actual. No expone UUID del propietario ni necesita lector de Mesas, LOGIN nuevo o permisos ampliados.
- `m3-catalog-management-model.js/.d.ts` exigen respuesta exacta y booleana, conservan su carácter inmutable y niegan autorizaciones implícitas ante ausencia/error. `M3CatalogManagementView.tsx` usa la **lectura propia** de Catálogo para editar o mostrar solo lectura; refresca por foco/visibilidad (sin polling) y revoca visualmente controles ante un `403` de titularidad obsoleta. `CatalogView.tsx`/`main.tsx` ya **no** usan `tablesGateway` para habilitar Catálogo. **Comunicaciones conserva** su permiso firmado independiente.
- Los tests existentes de Catálogo incorporan respuesta firmada de propietario, ADMIN no titular, proyección inválida/extra y cesión A→B con denegación de escritura del antiguo titular, dentro de `m3-management-postgres17.test.mjs`. El registro auditado de la misma migración se actualiza para reflejar también el lector de Catálogo.
- Se ha mantenido **un solo PR** y el SQL queda en migración **candidata**, no en Supabase operativo. No se ha modificado Fleetia ni el VPS.

**Fallo adicional independiente detectado tras pasar CV-014:** [Bootstrap #42997077436](https://github.com/jdlc86/CartaViva/actions/runs/42997077436) avanzó hasta `scripts/ci/staff-invitation-outbox-postgres17.test.mjs:1113`, donde el test 22 encontró `40P01 deadlock detected` al aplicar el script de función de despacho de invitaciones. En ese SHA, **no** se tocaron funciones del outbox ni código de invitación. **La causa de ese interbloqueo todavía no está demostrada**: no declararlo flakiness inofensiva ni modificar con reintentos a ciegas; comprobar reproducibilidad y locks en la ejecución final.

**CI vigente en el corte:** [Bootstrap #42998849822](https://github.com/jdlc86/CartaViva/actions/runs/42998849822), [Sabora CI #42998849963](https://github.com/jdlc86/CartaViva/actions/runs/42998849963), [gestión #42998849917](https://github.com/jdlc86/CartaViva/actions/runs/42998849917), [CV-012 #42998849858](https://github.com/jdlc86/CartaViva/actions/runs/42998849858), [cliente #42998850140](https://github.com/jdlc86/CartaViva/actions/runs/42998850140), [cobertura #42998849949](https://github.com/jdlc86/CartaViva/actions/runs/42998849949), **todos sobre SHA `1137ed8d`**. **Los cuatro de interfaz/instalación/cobertura han finalizado SUCCESS.** Bootstrap y Sabora CI **seguían en ejecución** al escribir esta línea; **no atribuirles PASS** ni dar H35-P1 por validado hasta verificar los seis.

**Próximo control:** recuperar resultados de ambas CI largas; si fallan, leer log y corregir defecto concreto dentro de **#56**, ejecutando la batería del SHA final. Solo con prueba integradora de Catálogo standalone y outbox/H6 en verde considerar revisión/merge; no confundir eso con seguridad independiente, aceptación humana o activación.


---

_Este documento fue la continuidad activa de la sesión 35; [sesión 36](SESSION_36_HANDOFF_2026-11-11.md) es la vigente. La [sesión 34](SESSION_34_HANDOFF_2026-11-10.md) queda como antecedente histórico y no debe recibir los nuevos hitos de trabajo._
