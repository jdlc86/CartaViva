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
