# Sabora / CartaViva — continuidad operativa de la sesión 34 (2026-11-10)

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA.** La fuente de verdad son los contratos normativos de GitHub. Esta apertura no constituye aprobación de código, equivalencia semántica, revisión independiente, aceptación visual, autorización para fusionar/cerrar PR ni permiso de despliegue. Todo estado del repositorio es un corte temporal, y las evidencias de CI pertenecen al SHA ensayado.

## Navegación y documentación enlazada

- **Continuidad inmediatamente anterior:** [sesión 33](SESSION_33_HANDOFF_2026-11-10.md), especialmente §§11–13 y el último hito **S33-8**.
- **Contexto de integración previo:** [sesión 32](SESSION_32_HANDOFF_2026-11-09.md).
- **Tablero vivo obligatorio de proyecto:** [SABORA_LIVE_PROJECT_TRACKER.md](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), especialmente §§71–73.
- **Matriz funcional y de PWA:** [FUNCTIONAL_UI_COVERAGE.json](../design/FUNCTIONAL_UI_COVERAGE.json).
- **Plan de saneamiento S1–S4 originado en sesión 32:** [SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md](../reviews/SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md).
- **Expediente vivo de evidencia y decisiones de sesión 33:** [SABORA_S33_S4_COMPLETION_EVIDENCE_2026-11-10.md](../reviews/SABORA_S33_S4_COMPLETION_EVIDENCE_2026-11-10.md), en especial §§15–17.
- **Dictamen individual histórico de los 47 PR:** [SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md](../reviews/SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md). Su censo de 47 es previo a los cuatro cierres autorizados.
- **Antecedentes de genealogía y semántica:** [grafo de estabilización](../reviews/SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md) · [reconciliación funcional histórica](../reviews/SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md) · [cierre técnico delimitado](../reviews/SABORA_REPOSITORY_STABILIZATION_CLOSURE_2026-11-06.md).
- **Candidato principal, sin merge a `main`:** [PR #54 Draft](https://github.com/jdlc86/CartaViva/pull/54), con [matriz comentada de los 47 PR históricos](https://github.com/jdlc86/CartaViva/pull/54#issuecomment-6766738523).

## 1. Punto de partida comprobado al abrir sesión 34 — 10-11-2026

**Repositorio autorizado exclusivamente:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva). Rama donde se abre esta continuidad: `integration/sabora-s32-admin-waiter-sanitization-20261109`, la misma del [PR #54](https://github.com/jdlc86/CartaViva/pull/54), con base `feat/sabora-cv014-waiter-calls-integral-20261109` (#53), **no `main`**.

Se ha consultado GitHub antes de abrir el documento:

| Indicador | Corte verificado | Interpretación |
| --- | --- | --- |
| PR abiertos | **43, todos Draft** | S4 aún incompleto; no cerrar por antigüedad |
| PR #54 | **abierto/Draft**, HEAD previo a este documento `b9c9968dd3bb15e56603f29ba3fb603447238c62` | Rama candidata, sin integración autorizada |
| Reviews de #54 | **0** en consulta a `pulls/54/reviews` | Ninguna aprobación independiente acreditada |
| `main` | `42b46358a76162445fa9e0b20e7b87dd0a640b5b` | Sin incorporación de la rama candidata |
| Protección reportada de `main` | `protected=false` | Riesgo de gobierno, no permiso para cambiar ajustes |
| Cierres autorizados en S33 | **#14, #31, #40 y #44**, `closed/merged=false` | Cierre documental, con ramas e historia preservadas |
| Resto abierto | **33 ancestros** contenidos solo en #54 + **9 divergentes funcionales/H3** + **#54** | No se han convertido en historia fusionada de `main` |

**Último SHA funcional probado:** `b1419e863f960993bcb1e0728cf8aa4c646c5464`, con **6/6 GitHub Actions SUCCESS** confirmados en sesión 33: [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42795971453), [H6](https://github.com/jdlc86/CartaViva/actions/runs/42795971006), [cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42795971355), [gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42795971044), [instalación CV-012](https://github.com/jdlc86/CartaViva/actions/runs/42795971048) y [cobertura UI](https://github.com/jdlc86/CartaViva/actions/runs/42795971402). El escenario PG17 M3 de categoría adicional obtuvo **2/2 PASS**; CV-012 volvió a SUCCESS también en repetición puntual. **Esas pruebas no corresponden necesariamente a commits documentales posteriores y no certifican producción.**

**Hitos heredados:** S1 genealogía levantada con brechas semánticas; S2 integración aislada de titularidad ADMIN #52 y llamada al camarero #53 en #54; S3 CI integrado terminado para el SHA anterior; **S4 parcial**: 4 cierres administrativos de 47 propuestos, sin merge. No repetir inventarios o baterías anteriores sin una razón concreta ni reclamar equivalencias por simple conservación de archivos.

## 2. Objetivo prioritario sesión 34 — cerrar el dictamen funcional de las nueve divergencias

La siguiente fase **no** consiste en cerrar los 43 PR por volumen, sino en resolver con pruebas y contratos la paridad de las **nueve divergencias de código todavía abiertas**:

1. **Seguridad/operación:** [#8 — vinculación del actor SQL](https://github.com/jdlc86/CartaViva/pull/8) y [#17 — validación estricta de consultas H4](https://github.com/jdlc86/CartaViva/pull/17). Comparar garantías de seguridad, roles efectivos, límites HTTP/SQL y casos negativos en el candidato #54 contra lo exigido normativamente.
2. **Cocina y gestión:** [#4 — cocina/camarero](https://github.com/jdlc86/CartaViva/pull/4) y [#5 — mesas/catálogo](https://github.com/jdlc86/CartaViva/pull/5). Analizar los cambios exclusivos de las ramas y demostrar, o declarar pendiente, equivalencia de estados, permisos, persistencia y flujos reales. Reutilizar M3 PG17/Chromium sin confundir una prueba parcial con la ruta completa.
3. **Selección H3 en cliente:** [#18](https://github.com/jdlc86/CartaViva/pull/18), [#19](https://github.com/jdlc86/CartaViva/pull/19), [#20](https://github.com/jdlc86/CartaViva/pull/20), [#21](https://github.com/jdlc86/CartaViva/pull/21) y [#22](https://github.com/jdlc86/CartaViva/pull/22). Tratar la familia en conjunto: integridad local, incidencias de disponibilidad, consentimiento ante cambios de precio, revisión de selección y sincronización en dispositivo, comprobando rutas conectadas y comportamientos, no solo `basketLineKey` ni coincidencia de archivos.

**Método y producto esperado:** utilizar el [expediente S33](../reviews/SABORA_S33_S4_COMPLETION_EVIDENCE_2026-11-10.md) y la [conciliación histórica](../reviews/SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md) para no volver a investigar los mismos 13 HEAD desde cero. Elaborar **un dictamen verificable por familia/PR**, con: contrato normativo aplicable; delta exclusivo y línea de procedencia; ruta realmente implementada; evidencias integradoras actuales; equivalencia `demostrada`, `sustituida con garantía equivalente`, `brecha` o `no verificada`; y propuesta de disposición administrativa. Las rutas preservadas y los blobs evolucionados **no** equivalen a paridad semántica.

**Restricción de acción:** el dictamen es diagnóstico. No cerrar ni fusionar los nueve PR, ni los 33 ancestros ni #54, sin la autorización concreta que corresponda. El cierre de cuatro documentales en sesión 33 **no** extiende permisos al resto.

## 3. Puertas independientes después de la conciliación

- **M3 extremo a extremo:** el PG17 2/2 comprueba categoría adicional y políticas SQL; no demuestra todavía un **único circuito ADMIN autorizado → Fastify/HTTP → PWA cliente** con la nueva categoría. Verificar integradamente si la normativa exige ese recorrido; no abrir micropruebas por inercia.
- **Revisión independiente:** revisar #54 y el gobierno ADMIN #52, incluyendo el contrato de titularidad, los permisos reales, límites HTTP/SQL y el comportamiento combinado. La revisión del propio autor o comentarios de seguimiento no sustituyen una aprobación externa.
- **Gobierno de integración a `main`:** según S33, el candidato estaba **4293 commits ahead y 0 behind** respecto a `main` y el compare GitHub truncaba archivos a 300; la comparación exhaustiva de árboles encontró **922 archivos nuevos, 3 preexistentes modificados, 0 eliminados, 98 migraciones SQL nuevas**. Reutilizar ese inventario y cotejar los cambios normativos por sus fuentes; preparar revisión de diff real, plan de reversión y decisión expresa. `main` no protegida no autoriza escritura unilateral.
- **Otras puertas de producto:** aceptación visual humana **F28/R09** según identidad aprobada; Stripe remoto sandbox **M4**; M6 de seguridad, observabilidad y recuperación; CV-013 de atribución/privacidad; reservas CV-014 sin política completa; pruebas de dispositivos reales, piloto y producción. Cada una necesita evidencia propia, sin suponer GO por CI verde.

## 4. Normativa obligatoria (no inferir reglas desde la continuidad)

- [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md) y [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md).
- [Sistema de diseño](../DESIGN_SYSTEM_CONTRACT.md), [auditoría de estilo visual aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [cobertura funcional/UI](../design/FUNCTIONAL_UI_COVERAGE.json).
- [Contrato ROOT/ADMIN escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [contrato operativo de titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md) y [ADMIN_WRITE_OWNERSHIP_V1](../security/ADMIN_WRITE_OWNERSHIP_V1.md). La solicitud de cesión/escritura se dirige al titular vigente **resuelto por servidor**, sin selector de destinatario inventado.
- [Contrato CV-012 de dos PWA independientes](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md).

**Invariantes de trabajo:** Sabora/CartaViva opera para **un solo restaurante**; PWA cliente y gestión independientes; experiencia visual sujeta al material aprobado; bloques completos y pruebas integradoras salvo diagnóstico de fallo puntual o requisito crítico. Registrar por separado `implementado`, `pruebas ejecutadas`, `validación independiente`, `autorización`.

**Límites operativos:** no tocar **Fleetia** ni recursos de terceros, aunque compartan VPS; no desplegar, parar, reiniciar, eliminar ni migrar en VPS/Supabase operativo. Cualquier despliegue requiere autorización expresa y aislamiento completo, sin afectar ni depender de contenedores ajenos. Ninguna operación sobre `main`, cierres adicionales o configuración de protección queda autorizada por esta continuidad.

## 4 bis. Dictamen S34-1 — conciliación documentada de nueve PR divergentes (10-11-2026)

**Expediente nuevo y trazable:** [SABORA_S34_NINE_DIVERGENT_FUNCTIONAL_RECONCILIATION_2026-11-10.md](../reviews/SABORA_S34_NINE_DIVERGENT_FUNCTIONAL_RECONCILIATION_2026-11-10.md). Audita individualmente #4/#5/#8/#17/#18/#19/#20/#21/#22 mediante HEAD, archivos/patches exclusivos, contratos, código montado en #54 y cotejo nominal de suites antiguas/actuales. **Los nueve están dictaminados en alcance estático, no acreditados para cierre administrativo.**

**Evidencia adicional objetiva:** #17 conserva **25/25** títulos Node; #8 tiene test de capacidad de actor con **SHA idéntico, 3/3**; #5 conserva **12/12** títulos de tests de catálogo/mesas/navegación; la cadena #18→#22 conserva respectivamente **9/9, 10/10, 11/11, 12/12 y 13/13** títulos Node, y #22 **8/8** títulos E2E Chromium. #4 conserva **6/7** títulos Node de operaciones y **5/6** de gestión; los nombres cambiados corresponden a responsabilidades/semánticas evolucionadas, cuya equivalencia total requiere cotejo del nuevo modelo «Voy a recoger»/«Cancelo». Títulos preservados **no** equivalen a aserciones idénticas o aceptación HTTP/SQL real.

**No confundir brechas:** la edición de dos variantes de un plato está implementada hoy mediante `basketLineKey` y testeada localmente, subsanando la brecha histórica descrita en la revisión del 06-11. M3 categorías adicionales tiene **PG17 2/2 PASS** histórico, pero **no** existe en la evidencia revisada un solo recorrido completo ADMIN→Fastify→PWA gestión→SQL→PWA cliente. El E2E H3 Chromium inspeccionado incluye mocks de catálogo. No reabrir la whitelist del lector `CatalogReadView` legado como defecto M3 autenticado.

**Estado administrativo:** **43 PR abiertos/Draft al corte previo**, incluidos los nueve; no se cerró ninguno nuevo. **0 pruebas nuevas ejecutadas en S34-1; 0 modificaciones funcionales; 0 revisiones independientes nuevas.** Último **6/6** continúa estrictamente en SHA `b1419e86` de S33. S4 **NO FINALIZADO**. El próximo bloque integrador deberá unir autorización M3/categoría nueva, selección variante y confirmación real con sus límites de operación H4/H6, reutilizando suites existentes sin multiplicar microtests.

## 4 ter. S34-2 — integración M3→H3 implementada en CI; resultado de aceptación en curso (10-11-2026)

**Commit de pruebas integradoras (no cambio del código producto):** [`ff7d68bd431eac707a83bb729fc23e164ec5b92e`](https://github.com/jdlc86/CartaViva/commit/ff7d68bd431eac707a83bb729fc23e164ec5b92e) sobre la rama del [PR #54](https://github.com/jdlc86/CartaViva/pull/54). Se amplió el recorrido **existente** [`scripts/ci/customer-production-postgres17.test.mjs`](../../scripts/ci/customer-production-postgres17.test.mjs), evitando duplicar el harness H3/H4 de variantes que ya confirmaba pedidos contra SQL real.

**Alcance implementado:** siete logins SQL restringidos y distintos sobre PostgreSQL 17 desechable; único Fastify con H3 registro/QR/cotización/confirmación, H4 operaciones y M3 catálogo firmado, todo sin alterar `server.mjs` ni abrir endpoints operativos. La PWA de gestión montada con JWT de ADMIN titular crea categoría dinámica y plato con opciones Suave/Picante, guarda borrador y publica; el lector público real debe devolver el snapshot, luego la PWA cliente conserva dos variantes y confirma el pedido por HTTP hasta las instantáneas económicas SQL y su idempotencia. La prueba exige denegación a camarero. **Las rutas M3 de tablas quedan deshabilitadas en este harness específico**; sus suites PG17 propias se mantienen. No equiparar este harness de H3/H4 con el runtime completo `createM3RestaurantCandidate` M3–H6.

**Batería automática iniciada exactamente sobre `ff7d68bd`:** [Bootstrap PG17 #42819553040](https://github.com/jdlc86/CartaViva/actions/runs/42819553040), [H6 #42819553152](https://github.com/jdlc86/CartaViva/actions/runs/42819553152), [cliente #42819553071](https://github.com/jdlc86/CartaViva/actions/runs/42819553071), [gestión #42819553070](https://github.com/jdlc86/CartaViva/actions/runs/42819553070), [CV-012 #42819553064](https://github.com/jdlc86/CartaViva/actions/runs/42819553064), [cobertura UI #42819553109](https://github.com/jdlc86/CartaViva/actions/runs/42819553109). En el primer corte gestión, CV-012 y cobertura UI eran SUCCESS; las otras estaban en curso. **No se declara 6/6 ni PASS del nuevo escenario antes de los logs.** La batería anterior 6/6 sigue siendo de `b1419e86` y no se traslada al nuevo SHA.

**Gobierno:** sin cambios en `main`, sin merge/cierre de PR, sin Supabase operativo/VPS/Fleetia. S4 pendiente. Ante un fallo, revisar causa y corregir antes de considerar aceptado el bloque; no reducir aserciones ni sustituir SQL/HTTP reales por mocks.

## 4 quater. S34-3 — prueba integrada M3→H3/H4 PASS en Bootstrap PG17, otros gates pendientes (10-11-2026)

**Expediente específico de evidencia:** [SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md](../reviews/SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md). La primera CI de `ff7d68bd` confirmó publicación M3 real pero **falló** en una aserción de IDs de opciones codificados a mano; [Bootstrap #42819553040](https://github.com/jdlc86/CartaViva/actions/runs/42819553040) y [H6 #42819553152](https://github.com/jdlc86/CartaViva/actions/runs/42819553152) registraron FAILURE. El nuevo commit de **pruebas, no producto** [`782974063bebe39fd423363eb2f806bc6b8acef9`](https://github.com/jdlc86/CartaViva/commit/782974063bebe39fd423363eb2f806bc6b8acef9) recupera identificadores de grupo y opciones de la publicación HTTP y coteja su igualdad hasta el pedido y SQL. Además comprueba la nueva publicación ADMIN de precio 14→15 EUR mientras el cliente conserva dos variantes, aceptación individual sin fusión de líneas, cotización y confirmación persistida e idempotencia.

**Ejecución verificada sobre ese SHA:** [Bootstrap PG17 #42820426039](https://github.com/jdlc86/CartaViva/actions/runs/42820426039) **SUCCESS**, incluyendo el E2E conectado de un Fastify y dos PWA/PG17; [gestión #42820426063](https://github.com/jdlc86/CartaViva/actions/runs/42820426063), [UI #42820426019](https://github.com/jdlc86/CartaViva/actions/runs/42820426019), [CV-012 #42820425999](https://github.com/jdlc86/CartaViva/actions/runs/42820425999) **SUCCESS**; [cliente Chromium #42820426047](https://github.com/jdlc86/CartaViva/actions/runs/42820426047) **SUCCESS en repetición puntual del mismo job**, después de fallo inicial por timeout durante instalación de Chromium, antes de pruebas. **H6 consolidado #42820425977 estaba en ejecución** al emitir este corte: **5/6 completos y un pendiente**; no anunciar 6/6. El primer fallo del harness no se encubre ni se rebajaron contratos.

**Alcance:** la brecha probatoria M3→H3/H4 queda **satisfecha dentro del E2E Bootstrap conectado de `78297406`**, no certificación global del runtime M3–H6 ni aprobación visual humana F28/R09. S4 administrativo no finalizado; ningún cierre adicional, merge, despliegue o intervención en `main`, Supabase operativo, VPS o Fleetia.

## 4 quinquies. S34-4 — aceptación automatizada integral M3→H3/H4 cerrada (10-11-2026)

**Dictamen del hito comprobado en GitHub:** **6/6 workflows `completed/success` en el mismo SHA funcional [`782974063bebe39fd423363eb2f806bc6b8acef9`](https://github.com/jdlc86/CartaViva/commit/782974063bebe39fd423363eb2f806bc6b8acef9)**, sin mezclar pruebas de SHAs antiguos ni de commits documentales `[skip ci]`. Las seis ejecuciones: [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42820426039), [H6 consolidado](https://github.com/jdlc86/CartaViva/actions/runs/42820425977), [cliente Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42820426047), [gestión Chromium](https://github.com/jdlc86/CartaViva/actions/runs/42820426063), [CV-012](https://github.com/jdlc86/CartaViva/actions/runs/42820425999) y [cobertura funcional/UI](https://github.com/jdlc86/CartaViva/actions/runs/42820426019).

**Evidencia de negocio integrada:** el nuevo circuito **PWA ADMIN titular → M3 SQL firmado → HTTP público → PWA cliente con categoría adicional, dos variantes, cambio de precio y consentimiento individual → cotización/confirmación HTTP → instantáneas económicas SQL y replay sin duplicados → dos líneas en cocina H4** terminó **PASS** en el test real PG17/Chromium dentro de Bootstrap (1/1). El H6 consolidado emitió `PASS Block 1`, `PASS Block 2A`, `PASS Block 2B`, incluyendo PG17, HMAC, concurrencia y navegador. El [expediente de aceptación S34](../reviews/SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md) recoge tanto la primera caída por aserción de IDs estáticos como su corrección, y el intento de cliente fallido por timeout de instalación Chromium que pasó en repetición puntual **sin reducir timeout ni garantías**.

**Límites:** el hito prueba un **harness aislado** que registra H3/H4 y M3 catálogo reales, no demuestra la composición total `createM3RestaurantCandidate` con todos los opt-ins H3–H6 ni aceptación visual humana F28/R09, revisión independiente, Stripe sandbox remoto, M6/recuperación o producción. El **S4 administrativo sigue NO FINALIZADO**: [#54 Draft](https://github.com/jdlc86/CartaViva/pull/54), cero reviews, **43 PR abiertos todos Draft**, 33 ancestros solo en #54 y 9 divergentes funcionales. `main` sigue en `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. Ningún merge, cierre nuevo, despliegue ni intervención en Supabase operativo, VPS o Fleetia.

**Siguiente decisión técnica/administrativa:** utilizar la nueva evidencia conectada para actualizar el dictamen de equivalencia de las familias #5 y #18–#22; conservar #4/#8/#17 a la espera de revisión independiente de sus diferencias y políticas H4/H6, y preparar revisión independiente del PR #54 antes de solicitar autorización específica para saneamiento de PR o integración en `main`. No reabrir S1/S3 ni crear otra batería redundante.

## 4 sexies. S34-5 — dictamen de redundancias de 43 PR y paquete de revisión independiente (10-11-2026)

**Expediente nuevo:** [SABORA_S34_PR_BACKLOG_REDUCTION_AND_INDEPENDENT_REVIEW_2026-11-10.md](../reviews/SABORA_S34_PR_BACKLOG_REDUCTION_AND_INDEPENDENT_REVIEW_2026-11-10.md), con identificación **nominal y enlaces a los 43 PR abiertos**, clasificación verificable y preguntas formales para la revisión independiente de [#54](https://github.com/jdlc86/CartaViva/pull/54).

**Conclusión sobre PR innecesarios:** **33 PR ancestrales** ya forman parte del historial de #54 y **sobran como 33 vías de integración separadas**, pero **todavía no son prescindibles desde el punto de vista de la custodia del código**, porque ni #54 ni su base #53 están integrados en `main`. **No cerrar antes** de una incorporación completa y autorizada en la rama de destino; el cierre no fusiona código. Identificados por bloques: #1/#2/#7/#10–#13/#15/#16 (9); #23–#30 (8); #32/#34/#36/#38/#41–#43/#45/#46 (9); #47–#53 (7).

**Nueve divergentes:** la familia **#18–#22 (cinco PR)** es la primera candidata a cierre conjunto **condicionado** a dictamen de paridad semántica independiente y permiso específico: su lógica principal de cesta, variantes, consentimiento, QR y persistencia está respaldada por los [6/6 workflows de `78297406`](../reviews/SABORA_S34_M3_H3_CONNECTED_ACCEPTANCE_2026-11-10.md), pero agotado/retirado, sincronización entre pestañas y todos los casos de borde no se deben dar por demostrados solo con ese E2E. **#5** probable sustitución **parcial** del catálogo por M3, pendiente de mesas/roles/visual. **#4/#8/#17** retenidos: semántica cocina/sala y límites críticos de seguridad. **#54** sigue siendo necesario como candidato único; su base es **#53**, no `main`.

**Estado reconsultado:** 43 abiertos/Draft, **0 reviews** de #54, `main` `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. Última CI funcional **6/6** exclusivamente en `782974063bebe39fd423363eb2f806bc6b8acef9`, sin pruebas nuevas por esta adenda documental. **Ningún PR cerrado/mergeado/retargeteado o rama borrada en S34-5**. S4 aún **NO FINALIZADO**.

**Hito siguiente:** revisión de un actor independiente (no autoaprobación), con análisis exhaustivo de diff a `main`, gobierno ADMIN/ROOT, seguridad SQL, nueve divergencias, montaje global y conformidad visual; solo tras resultado favorable y autorización específica definir vía de integración y simplificar el backlog. El documento es un paquete listo para entregar al revisor, **no una revisión realizada**. No tocar producción, Supabase operativo, VPS ni Fleetia.

## 4 septies. S34-6 — preflight formal del candidato a `main` y comprobación cruzada (10-11-2026)

**Preflight formal para revisión externa:** [SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md) · **manifiesto de archivos con SHA de blobs:** [SABORA_S34_MAIN_INTEGRATION_FILE_MANIFEST_2026-11-10.json](../reviews/SABORA_S34_MAIN_INTEGRATION_FILE_MANIFEST_2026-11-10.json) · **clasificación de 43 PR:** [SABORA_S34_PR_BACKLOG_REDUCTION_AND_INDEPENDENT_REVIEW_2026-11-10.md](../reviews/SABORA_S34_PR_BACKLOG_REDUCTION_AND_INDEPENDENT_REVIEW_2026-11-10.md). Son **documentos de preparación de la revisión**, no una aprobación externa.

**Evidencia nueva contrastada:** comparación completa y no truncada de árboles Git congelados: `main` `42b46358a76162445fa9e0b20e7b87dd0a640b5b` frente a #54 `e2b078abec100b1cd9ac770ca373bb40176a506d`; **4.349 commits ahead/0 behind, 929 archivos alterados: 926 añadidos, 3 modificados, 0 eliminados; 98 migraciones y 6 workflows nuevos**. El manifiesto se releyó y se **recalculó independientemente de su creación** contra los blobs de ambos árboles: **929/929 rutas, estados y SHA correctos**, sin omisiones, extras, discrepancias ni duplicados. El registro de auditoría SQL y el árbol coinciden **98/98 nombres**, 0 omisiones/duplicados.

**Riesgos que bloquean la integración ahora:** el PR #54 continúa Draft sobre **#53, no `main`**; `main` carece de protección efectiva y el repositorio no tiene rulesets activos (consulta de solo lectura); **0 reviews independientes** sobre #54. Su CI acreditada **6/6 SUCCESS** es del SHA funcional `782974063bebe39fd423363eb2f806bc6b8acef9`, no de los commits documentales nuevos. El runbook P2 describe **42 migraciones**, no las 98 actuales; sin ensayo de recuperación productiva, RTO/RPO o validación de PITR. El gate visual final F28/R09 sigue sin aceptación humana; M4, M6 y resto de puertas no son GO.

**Procedimiento propuesto y condicionado:** conservar #54 como candidato único; congelar SHA; revisión independiente de las **929 rutas frente a `main`**, seguridad SQL/ADMIN/ROOT y nueve divergencias; obtener decisión administrativa sobre protecciones y, **por separado**, autorización para apuntar #54 a `main` (sin fuerza/rebase); revalidar diff/CI del SHA resultante; solicitar después autorización específica de merge de código; verificar código incorporado antes de cerrar, con decisión individual, los 33 ancestros; despliegue/migraciones en otro hito y con aislamiento total. **No se ha ejecutado retarget, merge, cierre, cambios de protección ni deploy.**

**Estado de sesión:** evaluación técnica de preparación **COMPLETADA Y DOCUMENTADA** para facilitar revisión; integración real en `main`, revisión externa y producción **NO-GO**. Se han actualizado solo expedientes en la rama candidata, sin tocar Fleetia/VPS/Supabase operativo.

## 4 octies. S34-7 — aclaración de entorno sin usuarios ni producción activa (10-11-2026)

**Declaración expresa del propietario:** actualmente **no hay usuarios ni escenario de producción activo** en CartaViva/Sabora. Es una aclaración de alcance comunicada por el usuario, **no** evidencia independiente de que Supabase carezca de registros o de que cualquier recurso pueda modificarse. **Se mantienen intactos Supabase operativo, VPS y Fleetia**.

**Rectificación de prioridades para S4:** consultar [preflight formal §8 — puertas diferenciadas](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md). La integración de código de **desarrollo** en `main` debe resolverse con contraste normativo, seguridad SQL/ADMIN/ROOT, conciliación de nueve divergentes, diffs completos, revisión independiente según gobierno pendiente, autorización específica y CI PG17/Chromium del SHA/base correcto. **No exigir para esa integración** Stripe remoto, RTO/RPO/PITR de datos productivos, runbook de restauración productivo de 98 migraciones, aceptación visual final F28/R09 ni despliegue. Son **puertas posteriores de activación**, mientras esas funciones permanezcan inactivas/fail-closed donde corresponda. Esto es coherente con [AGENTS.md](../../AGENTS.md), que prioriza recorridos funcionales y no declara aprobación estética anticipada.

**Riesgos que no desaparecen:** `main` sin protección; #54 Draft con base #53 en lugar de `main`; 33 PR ancestrales no incorporados a `main` y nueve divergentes; cero reviews independientes; 98 migraciones no implican permiso de aplicación en Supabase. Sin usuarios, el riesgo de migración de datos productivos existente se reduce, pero el de seguridad/funcionalidad del código a integrar sigue vigente.

**Dictamen:** prioridad inmediata es integración segura de código y simplificación de PR, **no preparación productiva completa**. Sin merge, cierre, retarget, cambio de protección, ejecución de pruebas o despliegue nuevos en esta aclaración. Cualquier cambio de base/fusión sigue sujeto a autorización propia y confirmación GitHub.

## 4 nonies. S34-8 — PR #54 retargeteado a `main`, mismo candidato sin merge (10-11-2026)

**Actuación real sobre GitHub:** [PR #54](https://github.com/jdlc86/CartaViva/pull/54) cambió **su base de #53 a `main`** mediante actualización de metadatos, conservando **el mismo HEAD funcional y documental**, sin cherry-pick, rebase, force-push ni PR nuevo. GitHub reevalúa **`mergeable=true`, `mergeable_state=clean`**. El PR sigue **Draft**; `main` sigue sin commits nuevos en `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. **No se ha fusionado.**

**Alcance real de revisión desde `main`:** GitHub presenta 4.357 commits/931 rutas en el HEAD documental `ec0c17d7730e37eae1efbd222df093e5422ca555`; el árbol completo cotejado tiene **928 archivos añadidos, 3 existentes modificados y 0 eliminados**. La revisión anterior de [manifiesto congelado](../reviews/SABORA_S34_MAIN_INTEGRATION_FILE_MANIFEST_2026-11-10.json) continúa siendo válida para los **929 archivos y SHA de su fotografía**, no para el HEAD documental móvil. Desde el último SHA de código/CI `782974063bebe39fd423363eb2f806bc6b8acef9` hasta `ec0c17d...`, el árbol muestra exclusivamente **8 rutas documentales** distintas (4 nuevas y 4 modificadas), ninguna de API, PWA, SQL ni tests.

**Actualización de preflight:** [SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md), apartado de **estado vigente posterior al corte**, prevalece sobre los apartados históricos que dicen «base #53» o «retarget pendiente». La descripción del [PR #54](https://github.com/jdlc86/CartaViva/pull/54) se ha actualizado sin borrar las notas históricas.

**Próxima puerta de pruebas:** ejecutar y examinar los seis workflows de GitHub Actions **sobre la rama con base `main` y su HEAD actualizado**, no suponer que el retarget por sí mismo reejecuta CI. **Revisión independiente y decisión de merge aún pendientes**; la ausencia declarada de usuarios y producción no bloquea el merge por Stripe/PITR/estética final, pero tampoco elimina los requisitos de seguridad SQL, contratos, integridad de integración y aprobación de cambios de `main`. S4 **NO FINALIZADO**. No se ha cerrado ningún PR, aplicado SQL en Supabase ni tocado VPS o Fleetia.

## 4 decies. S34-9 — seis workflows `SUCCESS` en PR #54 apuntando a `main` (10-11-2026)

**Hito técnico confirmado:** [preflight formal §9, resultados originales y límites](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md). Las **seis ejecuciones del commit `d49ee05b103620ce30cfc976fa62182cc9d954df`**, posteriores al retarget de [PR #54](https://github.com/jdlc86/CartaViva/pull/54) a `main`, están `completed/success`: [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42836528469), [H6](https://github.com/jdlc86/CartaViva/actions/runs/42836528459), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/42836528305), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/42836528322), [CV-012](https://github.com/jdlc86/CartaViva/actions/runs/42836528449), [cobertura funcional/UI](https://github.com/jdlc86/CartaViva/actions/runs/42836528481). Los jobs de migración/driver PG17 y de integración H6 registran **SUCCESS**; puerta visual humana final **SKIPPED intencionadamente**, no aprobada.

**PR actual:** #54 sigue Draft con base `main`, `mergeable_state=clean`; 0 reviews independientes. `main` permanece `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. Comparaciones directas con HEAD antiguos confirman que **nueve PR (#4/#5/#8/#17/#18–#22) siguen divergentes**, por lo que un 6/6 no permite cerrarlos automáticamente; 33 ancestros continúan fuera de `main`. **Sin merge/cierre** por este hito.

**Resultado:** se cierra la puerta de **CI automatizada de integración del candidato con base `main`** en el SHA ensayado; continúa **NO-GO administrativo** por revisión independiente y autorización de fusión aún no resueltas. La aceptación visual, Stripe real, backup/PITR/RTO/RPO productivo y despliegue son hitos posteriores dada la ausencia actual de usuarios y producción activa declarada por el propietario. **No se lanzan suites redundantes ni nuevos PR.** No tocar Supabase operativo, VPS o Fleetia. Los commits documentales `[skip ci]` posteriores a `d49ee05b` no heredan una CI propia.

## 4 undecies. S34-10 — #54 pasa a Ready for Review y se cierra el cotejo técnico preparatorio (10-11-2026)

**Operación GitHub realizada:** [PR #54](https://github.com/jdlc86/CartaViva/pull/54) **deja de estar Draft y queda Ready for Review**, con base `main`, sin merge ni cambio en la rama principal. Se corrigió el título/descripción del PR para mostrar el estado de revisión y solicitar una revisión de seguridad distinta de la autoevaluación. **No se ha recibido ni falsamente declarado una revisión independiente.** Última CI en SHA `d49ee05b103620ce30cfc976fa62182cc9d954df`: **6/6 SUCCESS** (§4 decies); commits posteriores son exclusivamente documentales `[skip ci]`.

**Cotejo focalizado de garantías conservadas:** [preflight §10](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md) documenta rutas actuales exactas: titularidad ADMIN revalidada bajo el lock transaccional sin bypass ROOT; RPC SQL firmada y caducidad posterior a locks; consultas H4 estrictas; deshabilitación de la transición antigua `picked_up` desde el ensamblador M2/H6; editor M3 autenticado de categorías dinámicas; conservación de incidencias/consentimiento por variante de H3 y escucha `storage`. **La revisión manual acotada no acredita equivalencia total de nueve ramas antiguas ni constituye aprobación independiente.**

**Documentos normativos alineados en su estado, sin reescribir las reglas:** adendas técnicas en [single writer](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md) y [operación de titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md) indican qué HTTP/SQL candidato se implementó y probó realmente en PG17. Los estados históricos del 20 de octubre quedan como historial, no como descripción de las rutas actuales. No autoriza crear logins SQL operativos ni desplegar.

**Decisión pendiente:** revisión/aceptación de las diferencias críticas o decisión explícita del propietario sobre riesgo residual y fusión de desarrollo; 33 PR ancestrales fuera de `main` y nueve divergentes conservan estado. Los gates de producción (Stripe remoto, PITR/RTO/RPO, estética final) no bloquean este merge de código mientras sigan inactivos, conforme a la aclaración del propietario. **S4 administrativo NO FINALIZADO**. Sin merge/cierre adicional, cambios en main, Supabase, Fleetia ni VPS.

## 4 duodecies. S34-11 — merge de desarrollo #54 a `main` autorizado y realizado (10-11-2026)

**Acción autorizada y ejecutada, no solo propuesta:** el propietario aceptó expresamente la integración de #54 a `main` sin esperar revisión independiente, **solo para código de desarrollo**. Se usó `merge_method=merge` y `expected_head_sha=9c03ed0a25320f7502a18854b1b31bfd4e771bf4`; GitHub respondió `merged=true`. [PR #54](https://github.com/jdlc86/CartaViva/pull/54) está `closed/merged=true`. **Commit de integración:** [`a91867fbacb9319d16496b04a5fe237739c31837`](https://github.com/jdlc86/CartaViva/commit/a91867fbacb9319d16496b04a5fe237739c31837), con padres `main` viejo `42b46358a76162445fa9e0b20e7b87dd0a640b5b` y HEAD de #54 `9c03ed0...`.

**Verificación de contenido en `main`:** se releyeron ambos árboles Git recursivos de `a91867fb` y `9c03ed0`, ambos no truncados, y el contenido fue **idéntico (949 rutas de archivo/blobs y SHA iguales)**. En el paso posterior de la documentación pueden aparecer nuevos commits `[skip ci]` en `main`: no confundir el SHA de esos commits con el del merge funcional.

**Evidencia de pruebas:** 6/6 workflows `SUCCESS` en commit `d49ee05b103620ce30cfc976fa62182cc9d954df` cuando #54 ya tenía base `main`; desde ese commit probado hasta `9c03ed0` únicamente cinco archivos de documentación cambiaron, ninguno de runtime/tests/SQL. **No afirmar CI nueva de `a91867fb` ni de adendas posteriores**, a menos que GitHub la muestre; no se ejecutó evaluación independiente. El propietario conocía y aceptó esa excepción.

**Backlog tras operación:** GitHub informó **41 PR abiertos**, frente a 43 anteriores: #54 fusionado, [#1](https://github.com/jdlc86/CartaViva/pull/1) marcado `merged=true` automáticamente por GitHub, **sin cierre manual**. Quedan 32 ancestrales redundantes como solicitudes individuales y nueve divergentes #4/#5/#8/#17/#18–#22. El expediente [preflight S34 §11](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md) registra la distinción. **No cerrar por defecto los nueve divergentes** y no confundir contenido de main con estado de sus PR.

**Estado actual:** **HITO de integración de código de desarrollo a main CERRADO**, **S4 de saneamiento de los 41 PR restante**, no completado. Sin despliegue, sin aplicar migraciones/crear roles en Supabase operativo, sin reiniciar ni alterar VPS o Fleetia; aceptación visual y puertas de explotación siguen separadas. Próximo hito: reconsultar GitHub Actions de `main`, verificar propagación del merge a los PR ancestrales y resolver cierres con criterio individual y autorización según gobierno del proyecto.

## 4 tredecies. S34-12 — 32 PR ancestrales comprobados individualmente dentro de `main` (10-11-2026)

**Control post-merge ejecutado:** el [preflight de integración §12](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md) contiene prueba de genealogía de los **32/32 PR abiertos que eran ancestros** del candidato: #2/#7/#10/#11/#12/#13/#15/#16, #23–#30, #32/#34/#36/#38/#41/#42/#43/#45/#46, #47–#53. Cada HEAD se obtuvo de GitHub y se comparó directamente con `main` en commit [`a91867fb`](https://github.com/jdlc86/CartaViva/commit/a91867fbacb9319d16496b04a5fe237739c31837); **32/32 `status=ahead`, `behind_by=0`, `merge_base=HEAD PR`**. Es comprobación real de integración de su historial, no similitud funcional. [#1](https://github.com/jdlc86/CartaViva/pull/1) ya figura merged automáticamente junto con #54.

**Resultado administrativo preparado, sin ejecutar cierres:** quedan **41 PR abiertos**, de los cuales **32 son redundantes como vías de integración** porque su HEAD ya es ancestro de `main`; los otros **nueve #4/#5/#8/#17/#18–#22 divergen** y requieren decisión específica sobre diferencias normativas/semánticas. No cerrar automáticamente ninguno por este cotejo: la autorización anterior del usuario alcanzó el **merge del #54**, no un cierre masivo adicional.

**CI post-merge:** el `push` de `main@a91867fb` lanzó [Sabora CI #42842459366](https://github.com/jdlc86/CartaViva/actions/runs/42842459366), que aparecía **`in_progress`** al consultar. No se ha declarado aprobada; la CI anterior 6/6 sobre `d49ee05b` sí está acreditada y no pertenece al SHA de merge. Las adendas documentales de este hito en `main` llevan `[skip ci]` y no modifican código de ejecución.

**Estado:** S34 integración código a `main` completada, **saneamiento de 41 PR por cerrar**, 32 con trazabilidad verificada y nueve bajo conciliación. Sin despliegue ni migraciones operativas, sin tocar Fleetia/VPS/Supabase operativo.

## 4 quattuordecies. S34-13 — saneamiento de 32 PR ancestrales ejecutado (10-11-2026)

**Resultado final y auditoría nominativa:** [preflight S34 §13 — acta de cierre de 32 PR](../reviews/SABORA_S34_MAIN_INTEGRATION_FORMAL_PREFLIGHT_2026-11-10.md). Tras la autorización explícita «Adelante con los 32 PR» del propietario, los **32 HEAD de PR** se compararon nuevamente contra `main@9ced23b7759d6748f787dd786d6339405b6b21d4`: cada comparación devolvió `status=ahead`, `behind_by=0` y `merge_base_commit.sha` idéntico al HEAD del PR. El contenido ya estaba incorporado en el merge #54 `a91867fbacb9319d16496b04a5fe237739c31837`.

**Acciones GitHub reales:** se ejecutaron cierres `state=closed` **sin merge** en cuatro lotes de ocho, con respuesta `merged=false` en **32/32**: #2/#7/#10/#11/#12/#13/#15/#16; #23–#30; #32/#34/#36/#38/#41/#42/#43/#45/#46; #47–#53. No se borraron ramas ni se modificó el código. La comprobación final de PR abiertos devolvió **nueve y solo nueve: #4/#5/#8/#17/#18/#19/#20/#21/#22**. Quedan pendientes por seguridad/semántica; no se les atribuye equivalencia ni autorización de cierre.

**CI posterior al merge verificada:** [Sabora CI #42842459366](https://github.com/jdlc86/CartaViva/actions/runs/42842459366), disparada por `push` del merge commit `a91867fb`, terminó `completed/success`. La matriz de seis workflows del PR estaba también verde en `d49ee05b`, pero **el éxito post-merge sí pertenece a `a91867fb`**. Los posteriores commits de documentos `[skip ci]` no son nuevas pruebas.

**Estado:** saneamiento **de la familia ancestral CERRADO** (41→9 PR abiertos); **S4 global abierto solo por nueve divergencias**. No hay producción activa ni usuarios según propietario; no se hicieron despliegues, migraciones Supabase operativas, intervenciones VPS/Fleetia, cierres de nueve divergentes, force-pushes ni merges adicionales.

**Siguiente hito:** revisar las nueve divergencias en una matriz semántica final, priorizando en un solo bloque #18–#22 (incidencias y sincronización H3), luego #5 (lectores/gestión M3), #4 (operación sala/cocina), #8 (frontera HMAC SQL), #17 (rechazo GET); tomar decisiones de cerrar/retener por prueba real de contrato, no por conteo administrativo.

## 5. Disciplina de ejecución y registro de hitos S34

1. Antes de cada actuación administrativa o conclusión de CI, revalidar HEAD, base, estado de PR y SHA exacto del ensayo. Evitar convertir fotografías históricas en estado actual.
2. Resolver familias completas de desviaciones con una evidencia integrada representativa, aprovechando la CI existente. Una prueba aislada nueva solo si localiza un defecto concreto o protege requisito crítico. Si falla, diagnosticar causa y corregir sin reducir garantías.
3. Solo al completar **hitos significativos**, actualizar este documento, el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y el expediente de conciliación aplicable; indicar SHA, PR, ejecución real y puertas que siguen abiertas. Las escrituras `[skip ci]` no heredan CI del HEAD por inferencia.
4. Mantener separadas acciones de **diagnóstico/documentación**, **cierre de PR**, **merge a `main`** y **despliegue**: cada una tiene alcance y autorización diferentes.

### Registro de esta apertura — S34-0

**Ejecutado:** apertura documental de la sesión 34 en la misma rama del PR #54, con enlaces a continuidad 33, normativa, matriz, tablero y expedientes S32/S33. Se revalidaron 43 PR abiertos/Draft, HEAD de #54, rama base, ausencia de reviews de #54 y SHA de `main`.

**No ejecutado por esta apertura:** cambios de producto, pruebas nuevas, revisión independiente, cierres/merges/retarget de PR, cambios de `main`, migraciones, despliegues ni acciones sobre Fleetia/VPS/Supabase operativo.

**Próximo hito real:** dictamen semántico integral y auditable de las nueve divergencias, sin cierres por suposición. Mantener S4 **NO FINALIZADO** hasta completar decisiones y autorizaciones específicas.

---

_Este documento se mantiene vivo con hitos confirmados de sesión 34; los anteriores se conservan en [sesión 33](SESSION_33_HANDOFF_2026-11-10.md) sin reescribir su historia._
