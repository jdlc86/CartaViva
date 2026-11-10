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
