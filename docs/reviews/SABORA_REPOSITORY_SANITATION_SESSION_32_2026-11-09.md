# Sabora / CartaViva — plan vivo de saneamiento de GitHub (sesión 32, 2026-11-09)

> **DOCUMENTO OPERATIVO DE AUDITORÍA Y PLANIFICACIÓN, NO NORMATIVA NI ORDEN DE FUSIÓN.** Elaborado a petición del propietario durante la sesión 32. La fuente de verdad de requisitos son los contratos normativos del repositorio; el estado de GitHub y su CI debe revalidarse antes de cualquier actuación. El cierre S2/S3 registrado más abajo se limita a una **rama candidata y su CI**; no acredita autorización de `merge`, revisión independiente ni despliegue.
>
> **Única continuidad a la que se vincula este plan:** [sesión 32](../handoffs/SESSION_32_HANDOFF_2026-11-09.md). **Seguimiento general independiente:** [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md); **auditoría histórica de saneamiento** [26-10](GITHUB_PR_GLOBAL_HEALTH_AUDIT_2026-10-26.md) y [auditoría de matriz 09-11](SABORA_LIVE_REQUIREMENTS_MATRIX_INTEGRAL_AUDIT_2026-11-09.md). Estas fuentes de seguimiento no sustituyen normas.

**ESTADO VIGENTE — 09-11-2026:** el inventario **46 PR/49 ramas/37 clean-4 unstable-5 dirty** de §1 es una **fotografía histórica anterior a #54**, no el estado actual. El nuevo corte verificado contiene **47 PR abiertos, todos Draft**. El candidato [#54](https://github.com/jdlc86/CartaViva/pull/54) incluye los HEAD de #52 y #53 en rama aislada, y obtuvo **6/6 workflows SUCCESS** en SHA funcional `03d1e61faa8857396ed051c91e5c36c314a2b2f9`. La propuesta de tratamiento **47/47 PR** está en [§10](#10-cierre-automatizado-s3-y-registro-propuesto-s4-por-cada-pr--09-11-2026): **NO se ejecutaron cierres ni fusiones**. La revisión independiente, la aceptación humana visual y producción continúan NO-GO. Consultar siempre el [estado ejecutivo de sesión 32](../handoffs/SESSION_32_HANDOFF_2026-11-09.md) y [evidencia de CI](SABORA_S32_SEMANTIC_RECONCILIATION_AND_COMBINED_CANDIDATE_2026-11-09.md) antes de actuar.

## 1. Alcance, método y corte de evidencia inicial (histórico de 46 PR)

**Repositorio exclusivo:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva). Corte de **09-11-2026**, obtenido mediante API GitHub de PR, bases declaradas, ramas, información de mergeability, revisiones y runs de Actions. Inventario de todos los PR abiertos (`state=open&per_page=100`, devuelve 46), lectura individual de estado de fusión, rama `main` y documentación de la sesión. **No se ejecutaron pruebas nuevas**, no se hizo comparación semántica exhaustiva de los 46 deltas, no se efectuaron cierres, rebases, merges, borrados ni cambios de configuración. Estados de GitHub mutables: volver a consultarlos antes de usar el plan.

| Indicador | Verificado | Lectura correcta |
| --- | --- | --- |
| PR abiertos | **46**, todos **Draft** | No son 46 funcionalidades independientes ni 46 PR listos para fusionar |
| PR fusionados en el historial consultado | **1: #3**, con base de otra rama | No equivale a integración del producto en `main` |
| Ramas listadas | **49**, incluyendo `main` | No eliminar ramas por tamaño/cantidad |
| `main` | `42b46358a76162445fa9e0b20e7b87dd0a640b5b` | La aplicación candidata reside en ramas; no existe prueba reciente de `main` como producto integrado |
| Protección `main` | `protected=false` en metadatos; reglas visibles `[]` | El endpoint específico de protección devolvió 403: **no** afirmar cobertura completa de ajustes de acceso |
| Mergeability frente a **su base declarada** | **37 clean / 4 unstable / 5 dirty** | `clean` no significa aprobada, probada, ni fusionable directamente con `main` |
| Hito #52 (titularidad ADMIN) | Draft, HEAD documental `c602c923` | Último **código funcional** `12c2371e` con 6/6 workflows en ese SHA; cuarta revisión `COMMENTED`, **sin aprobación independiente** |
| Hito #53 (llamar camarero) | Draft, HEAD documental `d3c7bebc` | Último **código funcional** `92f8482a` con 6/6 workflows en ese SHA; no se extrapola a #52 ni a `main` |

**Evidencias de workflows usadas:** #52 [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42537660195) y [H6](https://github.com/jdlc86/CartaViva/actions/runs/42537660214); #53 [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42596201622), [H6](https://github.com/jdlc86/CartaViva/actions/runs/42596201815), [PWA](https://github.com/jdlc86/CartaViva/actions/runs/42596201429). Los seis workflows de cada hito se desglosan en las respectivas continuidades e informes. **No se realizó una auditoría del CI vigente de los otros 44 PR en este corte**.

## 2. Inventario de los 46 PR abiertos

La columna **Base** reproduce la relación declarada en GitHub en forma de PR de origen cuando se identificó su rama. **No representa por sí sola todos los ancestros ni equivalencia de cambios.** `dirty` implica conflictos de merge con esa base; `unstable` requiere revisar checks, sin inferir conflicto; `clean` solo indica mergeability que GitHub reportaba contra la base. No se debe considerar ninguna fila como autorización de actuación.

| PR | Alcance (título GitHub) | Base PR/branch | Estado GitHub observado |
| --- | --- | --- | --- |
| [#1](https://github.com/jdlc86/CartaViva/pull/1) | docs(sabora): contrato funcional consolidado y conciliación de auditoría | main | clean — solo frente a su base |
| [#2](https://github.com/jdlc86/CartaViva/pull/2) | feat: Sabora isolated pnpm workspace and CI bootstrap | #1 | clean — solo frente a su base |
| [#4](https://github.com/jdlc86/CartaViva/pull/4) | feat: cocina y camarero operativos | #2 | dirty — conflicto |
| [#5](https://github.com/jdlc86/CartaViva/pull/5) | feat(management): harden tables and catalog read workspaces | #2 | unstable — comprobación pendiente |
| [#7](https://github.com/jdlc86/CartaViva/pull/7) | Draft: preparación segura de integración cocina y gestión | #2 | clean — solo frente a su base |
| [#8](https://github.com/jdlc86/CartaViva/pull/8) | fix(security): bind order actors at the SQL boundary | #7 | dirty — conflicto |
| [#10](https://github.com/jdlc86/CartaViva/pull/10) | Hito 1: identidad SQL segura y revocación desde el alta | #7 | dirty — conflicto |
| [#11](https://github.com/jdlc86/CartaViva/pull/11) | Integración aislada Hito 1: identidad SQL y ciclo de personal (sin activar runtime) | #7 | dirty — conflicto |
| [#12](https://github.com/jdlc86/CartaViva/pull/12) | draft: reconciliar PR #11 con defensas de entrada y contrato de capacidad SQL | #11 | clean — solo frente a su base |
| [#13](https://github.com/jdlc86/CartaViva/pull/13) | draft: integración reconciliada de comandas con identidad SQL y capacidades firmadas | #7 | clean — solo frente a su base |
| [#14](https://github.com/jdlc86/CartaViva/pull/14) | draft: auditoría global de PR y saneamiento seguro de integración | #13 | clean — solo frente a su base |
| [#15](https://github.com/jdlc86/CartaViva/pull/15) | feat(client): PWA premium Sabora — hitos 1, 2 y 3 | #14 | clean — solo frente a su base |
| [#16](https://github.com/jdlc86/CartaViva/pull/16) | feat(operations): integrate Sabora H3-H5 restricted flow | #15 | clean — solo frente a su base |
| [#17](https://github.com/jdlc86/CartaViva/pull/17) | fix(operations): strict scalar query validation for H4 read routes | #16 | clean — solo frente a su base |
| [#18](https://github.com/jdlc86/CartaViva/pull/18) | fix(client): H3 local selection integrity and regression | #16 | clean — solo frente a su base |
| [#19](https://github.com/jdlc86/CartaViva/pull/19) | feat(client): H3 basket incidents and explicit resolution before ordering | #18 | clean — solo frente a su base |
| [#20](https://github.com/jdlc86/CartaViva/pull/20) | feat(client): H3 explicit consent for catalog price changes | #19 | clean — solo frente a su base |
| [#21](https://github.com/jdlc86/CartaViva/pull/21) | feat(client): H3 integrated selection review for availability and price incidents | #20 | clean — solo frente a su base |
| [#22](https://github.com/jdlc86/CartaViva/pull/22) | feat(client): H3 same-device basket synchronization without polling | #21 | clean — solo frente a su base |
| [#23](https://github.com/jdlc86/CartaViva/pull/23) | feat(api): H3 isolated authenticated customer HTTP boundary | #16 | clean — solo frente a su base |
| [#24](https://github.com/jdlc86/CartaViva/pull/24) | feat(api): H3 encapsulated customer-only Fastify route composition | #23 | clean — solo frente a su base |
| [#25](https://github.com/jdlc86/CartaViva/pull/25) | test(api): H3 customer session lifecycle and fail-closed SQL outage boundary | #24 | clean — solo frente a su base |
| [#26](https://github.com/jdlc86/CartaViva/pull/26) | fix(api): H3 customer auth request isolation, cache protection and concurrency regression | #25 | clean — solo frente a su base |
| [#27](https://github.com/jdlc86/CartaViva/pull/27) | feat(api): H3 transactional customer registration HTTP candidate with secure cookie | #26 | clean — solo frente a su base |
| [#28](https://github.com/jdlc86/CartaViva/pull/28) | feat(api): H3 secure cookie session verification and transactional logout bridge | #27 | clean — solo frente a su base |
| [#29](https://github.com/jdlc86/CartaViva/pull/29) | docs: inventario de producción y continuidad de Codex para cerrar H3–H5 | #28 | clean — solo frente a su base |
| [#30](https://github.com/jdlc86/CartaViva/pull/30) | feat: prepare Sabora RC1 customer-to-operations integration | #29 | clean — solo frente a su base |
| [#31](https://github.com/jdlc86/CartaViva/pull/31) | docs(sabora): encargo integral Codex H6 — SSE, Stripe y operación | #28 | clean — solo frente a su base |
| [#32](https://github.com/jdlc86/CartaViva/pull/32) | feat(sabora): H6 eventos, pagos y operación integrada | #30 | clean — solo frente a su base |
| [#34](https://github.com/jdlc86/CartaViva/pull/34) | feat(operations): asignación exclusiva «Voy a recoger» | #32 | clean — solo frente a su base |
| [#36](https://github.com/jdlc86/CartaViva/pull/36) | feat(sabora): identidad operativa del personal y mantenimiento global | #34 | clean — solo frente a su base |
| [#38](https://github.com/jdlc86/CartaViva/pull/38) | docs(sabora): contrato de directorio seguro por ámbitos y RLS | #36 | clean — solo frente a su base |
| [#40](https://github.com/jdlc86/CartaViva/pull/40) | Consolidación Sabora — integración candidata, CI y puertas de activación | #38 | unstable — comprobación pendiente |
| [#41](https://github.com/jdlc86/CartaViva/pull/41) | fix(h6): restore idempotent customer round replay | #40 | clean — solo frente a su base |
| [#42](https://github.com/jdlc86/CartaViva/pull/42) | feat(h6): refactor transaccional del cambio de mesa | #40 | clean — solo frente a su base |
| [#43](https://github.com/jdlc86/CartaViva/pull/43) | H6/B2: lector sellado de destinos y tareas de recogida | #42 | clean — solo frente a su base |
| [#44](https://github.com/jdlc86/CartaViva/pull/44) | feat: cierre integral de revisiones H6 por cambio de mesa | #43 | clean — solo frente a su base |
| [#45](https://github.com/jdlc86/CartaViva/pull/45) | test(h6): aceptación integral independiente de cierre de coste cero y multicomensal | #44 | dirty — conflicto |
| [#46](https://github.com/jdlc86/CartaViva/pull/46) | M2: compose isolated H3-H6 restaurant candidate | #45 | clean — solo frente a su base |
| [#47](https://github.com/jdlc86/CartaViva/pull/47) | M3: gestión transaccional de mesas y catálogo | #46 | unstable — comprobación pendiente |
| [#48](https://github.com/jdlc86/CartaViva/pull/48) | M3: concluir aceptación integral PG17 y corregir rechazo de categoría obligatoria | #47 | clean — solo frente a su base |
| [#49](https://github.com/jdlc86/CartaViva/pull/49) | feat(CV-012): PWA cliente y gestión instalables con caché pública aislada | #48 | clean — solo frente a su base |
| [#50](https://github.com/jdlc86/CartaViva/pull/50) | Puerta de completitud funcional ↔ PWA; aprobación visual definitiva diferida | #49 | clean — solo frente a su base |
| [#51](https://github.com/jdlc86/CartaViva/pull/51) | CV-014 — Comunicaciones programadas: gestión, SQL sellado, avisos cliente y SSE | #50 | unstable — comprobación pendiente |
| [#52](https://github.com/jdlc86/CartaViva/pull/52) | Gobierno de titularidad ADMIN: solicitud, cesión y recuperación ROOT | #51 | clean — solo frente a su base |
| [#53](https://github.com/jdlc86/CartaViva/pull/53) | CV-014: llamada al camarero por mesa — PWA cliente/sala, seguridad SQL y avisos durables | #51 | clean — solo frente a su base |

### Casos críticos identificados

- **Cinco `dirty`:** [#4](https://github.com/jdlc86/CartaViva/pull/4), [#8](https://github.com/jdlc86/CartaViva/pull/8), [#10](https://github.com/jdlc86/CartaViva/pull/10), [#11](https://github.com/jdlc86/CartaViva/pull/11), [#45](https://github.com/jdlc86/CartaViva/pull/45). No resolver conflictos con elección automática de código sin contrastar la funcionalidad/seguridad conservada. **#45** se encuentra en la cadena antecedente de #46–#53 y requiere especial análisis topológico.
- **Cuatro `unstable`:** [#5](https://github.com/jdlc86/CartaViva/pull/5), [#40](https://github.com/jdlc86/CartaViva/pull/40), [#47](https://github.com/jdlc86/CartaViva/pull/47), [#51](https://github.com/jdlc86/CartaViva/pull/51). Falta discriminar el check fallido, pendiente, omitido o requerido en su propio SHA; `unstable` **no** demuestra defecto funcional ni conflicto de código.
- **Grandes superficies de revisión** (según metadatos del PR frente a su base, no cambios únicos a `main`): #2 **1.789 commits / 367 archivos**; #43 **795 commits / 117 archivos**; #40 **364 commits / 135 archivos**. **No** usar totales de commits como métricas de calidad ni reescribir historia para reducirlos.
- **Ramas hermanas #52 y #53:** ambas parten de #51; la integración de gobierno ADMIN no está implícita en el HEAD de llamadas al camarero. Sus `6/6` separados no prueban la combinación de ambos hitos.
- **Documentación y antecedentes:** PR #1/#2 y PR #14 contienen contratos, trazabilidad y saneamiento anteriores. La auditoría de 26-10 documentó relaciones de ancestros y diferencias de #4/#5/#8 respecto de #13, **pero no certificó equivalencia semántica final**. Debe reutilizarse esa evidencia, sin presuponer que sigue vigente.

## 3. Topología a resolver (bases declaradas, no merges autorizados)

Ruta troncal simplificada de **bases**, omitiendo ramas laterales y sin asegurar que los commits no ancestrales hayan quedado equivalentes:

```text
main -> #1 -> #2 -> #7 -> #13 -> #14 -> #15 -> #16
#16 -> #23 -> #24 -> #25 -> #26 -> #27 -> #28 -> #29 -> #30
#30 -> #32 -> #34 -> #36 -> #38 -> #40 -> #42 -> #43 -> #44
#44 -> #45 -> #46 -> #47 -> #48 -> #49 -> #50 -> #51
#51 -> #52 (ADMIN)        y        #51 -> #53 (llamada)
```

Ramas laterales que **no se pueden descartar automáticamente**: #4/#5 respecto de #2; #8/#10/#11/#12 respecto de #7; #17 y #18–#22 respecto de #16; #31 respecto de #28; #41 respecto de #40. Es indispensable verificar ancestralidad de SHA, commits/cambios exclusivos, migraciones y equivalencia de comportamiento antes de clasificar `incluido`, `sustituido`, `faltante`, `conflictivo` o `pendiente`.

**Alerta estructural:** el número de PR y un HEAD con CI verde no permiten inferir que la cadena completa pase su validación cuando se integra con una rama hermana. La ausencia de un merge a `main` es un **riesgo de integración**, no una demostración de fallo del producto.

## 3 bis. Trabajo de integración y saneamiento YA REALIZADO — revisión de las últimas seis continuidades (09-11-2026)

**Rectificación del plan original:** la formulación inicial «S1 NO INICIADO» omitía trabajo sustancial ejecutado entre las sesiones 23 y 25 y recordado expresamente por las continuidades **27–32**. No debe repetirse. La última revisión de esas seis continuidades comprueba lo siguiente:

| Continuidad | Evidencia útil para saneamiento | Límite |
| --- | --- | --- |
| [Sesión 27](../handoffs/SESSION_27_HANDOFF_2026-11-07.md), §§2–3.A | Reconoce **estabilización técnica previa** y permiso metodológico para retomar matriz; 42 PR Draft históricos y clasificación existente | Declara expresamente que la equivalencia histórica completa **no** está acreditada |
| [Sesión 28](../handoffs/SESSION_28_HANDOFF_2026-11-07.md), §§2–3 | Reutiliza candidato #49 sobre #48 y pruebas reales del mismo SHA, sin abrir integración a `main` | CI funcional no equivale a cierre de historia Git |
| [Sesión 29](../handoffs/SESSION_29_HANDOFF_2026-11-07.md), §§2–3/9–19 | Trabajo integrado sobre la línea descendiente, recuperación de regresiones B3, revisión de controles por ámbito y ampliación de CI | Cambios de producto en rama candidata; no hay decisión de fusión de los PR históricos |
| [Sesión 30](https://github.com/jdlc86/CartaViva/blob/feat/sabora-admin-ownership-end-to-end-20261108/docs/handoffs/SESSION_30_HANDOFF_2026-11-08.md), §§2–4, 8–10 | Gobierno ADMIN integrado y revisiones de seguridad dentro de **#52** | Otra rama; no es conciliación de #52 con #53 |
| [Sesión 31](https://github.com/jdlc86/CartaViva/blob/feat/sabora-admin-ownership-end-to-end-20261108/docs/handoffs/SESSION_31_HANDOFF_2026-11-08.md), §§14–16 | Correcciones RF-01/RF-02, PostgreSQL17/Fastify/Chromium y **6/6** #52 | Revisión independiente final y combinación con #53 aún pendientes |
| [Sesión 32](../handoffs/SESSION_32_HANDOFF_2026-11-09.md), §§1–3, 7–8 | #53 **6/6** para llamadas y CV-012; auditoría de matriz y censo actualizado 46 PR | No integración cruzada #52/#53, no `main` |

### Expedientes previos obligatorios (no duplicar)

1. [Grafo/inventario de 42 PR](SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md): censo completo, **28 HEAD ancestros, 13 divergentes y #49 candidato**, archivos comparados y resolución histórica del conflicto #48→#49 mediante commit de dos padres `65b0ead2` sin alterar árbol; después se ejecutó un candidato limpio. Su fotografía es histórica, no descripción actual de 46 PR.
2. [Conciliación histórica funcional](SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md): examinó **las 13 ramas divergentes**. En #4/#5/#8/#17/#22 verificó paths y retención de pruebas (76 entradas, 22 blobs exactos, 54 evolucionados, 0 rutas faltantes) y explicó cadenas/documents #18–#21, #14/#31/#40/#44. **No certificó paridad semántica completa** de los 54 evolucionados.
3. [Cierre delimitado de estabilización 06-11](SABORA_REPOSITORY_STABILIZATION_CLOSURE_2026-11-06.md): candidato #49 sin conflictos, **5/5** workflows sobre SHA `0402e63a82c23e80470f59f0da2bc39fd5aa43c0`, inventario/decisiones propuestos, y declaración explícita: `ESTABILIZACIÓN_TÉCNICA_DE_CANDIDATO = CERRADA_EN_ALCANCE`, `RECONCILIACIÓN_ADMINISTRATIVA_DE_PR = PENDIENTE`, `MERGE_MAIN = NO_AUTORIZADO`.
4. [Tablero vivo §§15–24](../tracking/SABORA_LIVE_PROJECT_TRACKER.md): además de los puntos anteriores, informa de la recuperación de **tres documentos ausentes** después de revisar los árboles completos de 42 HEAD; última batería integradora #49 con Node/PG17/Chromium, y vuelta acordada a la matriz. Preservar el historial sin recrear sus auditorías.

**Actualización posterior que sustituye la tarea de genealogía S1:** ya se compararon **los 46 HEAD de PR abiertos** frente a #53; resultado **31 ancestros, 14 divergentes y #53 idéntico**, con 46/46 resultados GitHub. Faltan únicamente las diferencias **semánticas** de las familias históricas #4/#5/#8/#17/#22 y la combinación nueva #52, además de revisión documental de #14/#31/#40/#44. La cadena #18–#21 pertenece a la familia #22; no reabrir las comparaciones de los 42 como un trabajo nuevo. Ver §8.

**Cambio concreto de S2/S3:** hubo integración real de rama/CI para #49, y validación aislada de #52 y #53. Lo que **no** existe es un candidato común actual #52+#53 validado como conjunto, ni equivalencia de todos los deltas no ancestrales, ni integración a `main`. Las suites y logs previos deben reutilizarse como línea base, y ejecutar de nuevo únicamente al cambiar el candidato funcional integrado, sin rebajar gates.

## 4. Hitos completos de saneamiento propuestos

### Hito S1 — Genealogía 46/46 completada; pendiente paridad funcional de las divergencias

**Entrada ya contrastada:** 46 PR, base/HEAD y ancestralidad actual frente a #53; inventario/conciliación de 42 PR del 06-11 reutilizados. **Trabajo pendiente:** actualizar solamente las diferencias de comportamiento no acreditadas por los informes previos, con especial atención a #4/#5/#8/#17/#22, documentación histórica divergente y al PR #52 paralelo. Reutilizar tests e informes existentes; no repetir inspección exhaustiva de cada PR ancestral por inercia.

**Salida parcial realizada:** la clasificación **de genealogía** es 46/46; eso no significa equivalencia de funcionalidad. **Salida pendiente:** dictamen explícito y verificable por cada familia divergente, con requisitos, delta exclusivo, pruebas representativas, lo que queda sin probar y propuesta de tratamiento del PR original. No cerrar PR por mero parentesco ni por coincidencia textual de tests. Mantener trazabilidad de los 46 registros.

### Hito S2 — Consolidación final sin perder normativa ni funcionalidades (PARCIAL HISTÓRICO; INTEGRACIÓN ACTUAL NO VALIDADA)

**Entrada:** S1 y lista causal de conflictos y checks reales. Resolver en una **rama candidata aislada del mismo repositorio** los conflictos y deltas necesarios, con orden y trazabilidad explícitos. Priorizar los puntos de seguridad y negocio: identidad SQL, RLS/actor firmado, escritor único ADMIN, transición de cocina/sala, órdenes/deuda individual, cambio de mesa H6, terceros pagadores/refund, mesa/QR, gestión catálogo, comunicaciones, PWA y notificaciones.

**Ramas paralelas:** tratar #52/#53 con comparación de ambos cambios, migraciones y políticas antes de combinarlos. **Ninguna fusión a `main` ni aplicación en Supabase operativo** está implícita en este plan. Mantener `main` intacta mientras se valida. No borrar, cerrar o rehacer PR para simular progreso.

**Salida exigida:** un único candidato coherente, inventario de decisiones de conflictos/deltas, historial de commits trazable, ausencia de pérdidas demostrada por contratos y tests; revisión formal de código de cambios nuevos.

### Hito S3 — Aceptación integrada del candidato consolidado (EVIDENCIA HISTÓRICA; PENDIENTE LA COMBINACIÓN FINAL)

**Prueba integradora, no micropruebas como método:** PostgreSQL 17 **desechable**, migraciones forward-only en orden y controles de privilegios, sesiones y JWT/HMAC, Fastify, RLS real, concurrencia, Stripe **simulado** donde aún no exista entorno sandbox autorizado, Chromium con ambas PWA, comprobaciones de instalación/ámbitos/caché, H6/B3, gobierno ADMIN y llamada al camarero combinados, UI funcional y regresiones. Corregir el defecto concreto identificado y repetir la batería completa en el **mismo SHA**. Evidencia de 6/6 o de todos los gates aplicables al candidato: nombres, run IDs, SHA, logs de la operación y fallos no encubiertos.

**Límites:** CI automatizado `PASS` no concede aceptación visual humana F28/R09, Stripe remoto M4, reservas CV-014 aún sujetas a norma, seguridad de producción M6 ni revisión externa.

**Salida exigida:** acta por contrato/requisito con estados separados `implementado` / `ejecutado` / `validado en integración` / `pendiente humano` / `NO-GO producción`, y lista exhaustiva de riesgos residuales.

### Hito S4 — Decisiones de incorporación y reducción de PR (NO AUTORIZADO TODAVÍA)

**Solo tras S1–S3 y revisión/decisión correspondiente:** proponer secuencia de integración a `main`, cerrar **sin borrar rama** los PR acreditados como absorbidos o sustituidos, con comentario de SHA de sustitución + pruebas + vínculo de requisitos, y conservar abiertos los que tengan trabajo real pendiente. No hacer merge ni cierre masivo por tamaño, antigüedad o CI del descendiente. Revalidar protección de `main` y proponer checks/revisiones requeridos a la persona propietaria, **sin cambiar configuración por iniciativa propia**.

**Criterio de cierre de saneamiento:** menos PR abiertos por decisiones **individualmente justificadas**, un candidato integrador validado **como conjunto**, trazabilidad intacta, ninguna función normativa perdida, revisiones pendientes declaradas y ninguna intervención operativa. El número final de PR no se inventa ahora.

## 5. Riesgos y puertas de decisión

| Riesgo | Severidad de gestión | Evidencia / siguiente comprobación |
| --- | --- | --- |
| 46 PR Draft y grafo largo sin `main` integrado | Alta | Censo y reconciliación S1/S2; no equivale a defectos de runtime |
| #45 `dirty` frente a su propia base (pero **ancestro del #53**) | Riesgo de gobierno, no bloqueo probado | Examinar al decidir cerrar/fusionar esa base; no inferir pérdida o conflicto del candidato #53 |
| #52 / #53 ramas hermanas | Alta | Ensayo combinado antes de cualquier decisión de integración |
| `main` con `protected=false` | Alta | Propuesta de reglas y checks con autorización; endpoint de protección 403 |
| #2/#43 con diferencias acumuladas muy grandes | Alta | Comparaciones de linaje, deltas funcionales y migraciones; no rebase destructivo por estética |
| F28/R09, M4, M6 y reservas CV-014 | Bloqueos de aceptación independientes | No se resuelven saneando Git ni por 6/6 histórico |
| Revisión #52 por autor GitHub `COMMENTED` | Puerta pendiente | Codex u otro revisor independiente cuando sea posible; no atribuir `APPROVE` inexistente |

## 6. Invariantes y prohibiciones

- **Requisitos:** [RF](../REQUISITOS_FUNCIONALES.md), [contrato funcional](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [sistema visual](../DESIGN_SYSTEM_CONTRACT.md), [estilo visual aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [escritor único ROOT/ADMIN](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [operaciones de titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md) y [matriz H6](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). No inventar, ajustar o rebajar obligaciones para facilitar merges.
- **Un Sabora = un restaurante**; dos PWA independientes; identidad/empresa y pagos conservan semántica normativa, auditoría y privilegios mínimos. La selección del destinatario de una **solicitud** de titularidad la hace el **servidor**.
- Solo `jdlc86/CartaViva` para investigación o desarrollo. **No tocar Fleetia**, código, servicios, redes, contenedores ni recursos de su VPS compartido, ni otros proyectos. No desplegar, reiniciar, eliminar, ejecutar migraciones en Supabase operativo, manipular secretos o fusionar sin autorización expresa.
- **Saneamiento documental no es saneamiento ejecutado**: la redacción y enlace de este plan no prueban ni cambian una sola PR. Si se autoriza el trabajo, actualizar este documento **por hitos completos**, con evidencias reales y decisión por PR; no registrar microarreglos como hitos cerrados.

## 7. Estado de ejecución al crear el documento

| Hito | Estado | Prueba o decisión pendiente |
| --- | --- | --- |
| Diagnóstico inicial 46 PR y estados GitHub | **HECHO, corte temporal** | Revalidar en el inicio de S1 |
| S1 genealogía 46/46 | **REALIZADO**: 31 ancestros, 14 divergentes y #53 propio, comparaciones directas 09-11 | **Paridad semántica aún abierta** para seis frentes; no interpretar ancestralidad como aceptación |
| S2 consolidación candidata aislada | **PARCIAL HISTÓRICO**: #48→#49 reparado y probado; **candidato final no construido** | Integrar solo deltas pendientes, incluidas las ramas hermanas #52/#53, con revisión de conflictos |
| S3 prueba end-to-end combinada | **PARCIAL HISTÓRICO**: #49 5/5 y #52/#53 6/6 por separado; **conjunto no probado** | SHA integrado tras S2 y batería conjunta real |
| S4 fusión/cierre de PR | **NO AUTORIZADO** | S1–S3, revisión y autorización explícita |
| Producción / Supabase / VPS | **NO-GO** | Autorización operativa separada |

**Próxima acción técnica recomendada:** cerrar el **dictamen de paridad únicamente para las familias divergentes con código** (#4/#5/#8/#17/#22) reutilizando las pruebas y normas existentes; conciliar #52 con #53 en rama aislada tras comprobar sus nueve rutas compartidas y migraciones; ejecutar una aceptación integral sobre el SHA combinado. No perseguir los `dirty/unstable` históricos de PR ya ancestrales como defectos actuales sin causa comprobada. Mantener sin cambios `main`, Fleetia, VPS y Supabase operativo. El hito CV-013 de Excel permanece condicionado por su normativa y no se debe utilizar para eludir la estabilización de Git.

## 8. Reevaluación mediante continuidades 20–23, 25 y 27–32 y comparaciones Git 46/46 — 09-11-2026

**Esta sección es la lectura vigente del saneamiento** y corrige los diagnósticos genéricos anteriores. Se han leído los handoffs de las sesiones **20, 21, 22, 23, 25, 27, 28, 29, 30, 31 y 32**, contrastándolos con los informes de estabilización de 06-11 y con `compare_commits` de **cada uno de los 46 HEAD abiertos** contra el HEAD del PR #53 `39de23f2f0d470a5ab7d769d2080cfbf05c35c69` (cambio documental respecto al SHA de funcionamiento `92f8482a`). Las sesiones **24 y 26 no tienen continuidad propia en esta secuencia**; no inventar su contenido. Los resultados de Git son por **ancestralidad**, no por equivalencia de comportamiento.

### 8.1 Resultado exhaustivo de genealogía actualizado

| Situación respecto a HEAD #53 | Total | PR |
| --- | ---: | --- |
| **HEAD ancestro** (`ahead`, `behind=0` al comparar HEAD→#53) | **31** | #1, #2, #7, #10, #11, #12, #13, #15, #16, #23–#30, #32, #34, #36, #38, #41–#43, #45–#51 |
| **HEAD divergente** (`ahead>0`, `behind>0`) | **14** | **#4, #5, #8, #14, #17, #18, #19, #20, #21, #22, #31, #40, #44, #52** |
| **HEAD de referencia** | **1** | #53 |
| **TOTAL** | **46** | Lista API de PR abiertos a 09-11-2026 |

**Corrección de riesgo esencial:** #10, #11 y #45 están `dirty` con su **base declarada** pero son **ancestros de #53**, así que no son automáticamente bloqueos de la rama candidata ni cambios perdidos. Los restantes `dirty` #4 y #8 sí divergen. Los `unstable` #47 y #51 son ancestros de #53; #5 y #40 son divergentes. Un estado `unstable` no prueba por sí solo un fallo del producto actual. No solucionar el contador de PR cambiando bases arbitrariamente.

Las **14 divergencias** se agrupan sin duplicar trabajo:

- **Cinco familias con diferencias de código históricas:** **#4 cocina/sala, #5 gestión, #8 vinculación de actor SQL, #17 lectura HTTP y #22 cesta/configuración**. Los informes del 06-11 ya compararon rutas, blobs, contratos y escenarios; la **paridad semántica total no estaba demostrada**, por lo que solo se debe verificar lo que quedó sin evidencia frente al código actual.
- **Cuatro PR de la cadena H3 que confluyen en #22:** #18, #19, #20 y #21; se conservan como procedencia, no cuatro funcionalidades adicionales a reconstruir.
- **Cuatro divergencias de documentos históricos:** #14 (continuidad 11), #31 (encargo H6), #40 (continuidad 15) y #44 (continuidad 22, revisión coste cero y tablero). Las comparaciones de commits únicos respecto de `merge-base` muestran rutas documentales; sus documentos ya fueron objeto de recuperación/preservación histórica, que debe contrastarse sin copiar normas obsoletas.
- **Una rama funcional reciente no incorporada al candidato:** **#52 gobierno de titularidad ADMIN**; HEAD propio no ancestro de #53. Revisión independiente pendiente, no confundir con los cinco legados.

**#48 ya es ancestro de #53**; el conflicto histórico #48→#49 se resolvió de verdad el 06-11. El antiguo inventario 28/13/#49 y esta nueva clasificación 31/14/#53 no se contradicen: son dos fotografías de referencia y fecha diferentes.

### 8.2 Riesgo concreto de combinación #52 y #53

Comparación directa con base compartida **#51**, SHA `bd57464d7924562794d9fe3dd8e9fcb69131fcb4`:

- **#52:** 78 commits por delante de #51 y **33 archivos cambiados**. Último SHA funcional probado `12c2371e` (6/6 CI) y HEAD posterior `c602c923` documental.
- **#53:** 22 commits por delante de #51 y **25 archivos cambiados** (incluida actualización documental posterior a código `92f8482a`, 6/6 CI). **Ambas ramas divergen**: la comparación #52→#53 tiene `ahead=22, behind=78`.
- **Nueve rutas modificadas en ambas:** `apps/api/src/m2-restaurant-candidate.mjs`, `apps/management/src/main.tsx`, `docs/tracking/SABORA_LIVE_PROJECT_TRACKER.md`, `scripts/ci/catalog-postgres17-node-driver-smoke.sh`, `scripts/ci/cv012-two-pwa-installation.mjs`, `scripts/ci/cv014-communications-postgres17.test.mjs`, `scripts/ci/migration-audit.mjs`, `scripts/ci/postgres-migration-smoke.sh` y `scripts/ci/table-change-root-postgres17.test.mjs`.

**Interpretación:** el solapamiento de archivos es riesgo de coordinación **no prueba de conflicto de texto**. Antes de combinar, comprobar semántica de composición opt-in, cercado de sesión, identidad SQL, migraciones forward-only, pruebas largas y roles. No aplicar automáticamente el contenido de una rama sobre otra ni usar CI verde separado como validación conjunta.

### 8.3 Estado sanitario corregido y alcance de próximas acciones

| Dimensión | Evaluación |
| --- | --- |
| Estabilidad técnica del **candidato histórico #49** | **CERRADA EN ALCANCE** el 06-11, 5/5 CI; no repetir |
| Historia y preservación de **42 PR** anteriores | **CENSADA Y RECONCILIADA ESTÁTICAMENTE**; pendientes semánticos específicos |
| Genealogía **46 PR** actual | **COMPLETADA 46/46** respecto de #53, sin pruebas nuevas |
| Calidad/ejecución actual de **#53** | Candidato funcional **6/6** en `92f8482a`, no aptitud de producción |
| Calidad/ejecución actual de **#52** | Candidato funcional **6/6** en `12c2371e`, falta decisión independiente |
| Paridad histórica de #4/#5/#8/#17/#22 | **PENDIENTE DE CIERRE SEMÁNTICO**, sin demostrar pérdida efectiva |
| Rama combinada **#52 + #53** | **NO CONSTRUIDA / NO PROBADA** |
| Integración de PR a `main` / reducción de 46 Draft | **PENDIENTE DE DECISIÓN Y AUTORIZACIÓN**; `main` `protected=false` |
| Producto, aceptación visual humana, Stripe sandbox real, M6 y producción | **NO-GO independientes** |

**Orden de saneamiento reformulado:** (a) cerrar por equivalencia semántica o brecha demostrada las cinco familias históricas, sin recertificar los 31 ancestros de forma individual; (b) preparar **un único candidato de integración #52+#53** en rama aislada autorizada del propio repo y preservar ambas normativas; (c) ejecutar **una batería completa PG17/JWT/HMAC/Fastify/Chromium/H6/ambas PWA** en el mismo nuevo SHA, revisar causas si falla y repetir; (d) producir expediente de decisiones PR a PR y solicitar autorización **antes** de cerrar/fusionar o proteger `main`. Las revisiones de Codex/tercero no se suplantan con comentarios del autor.

**Advertencia de metodología:** el cierre técnico previo permitía regresar a la matriz y seguir desarrollando hitos completos. La deuda administrativa de PR no invalida los 6/6 de un SHA funcional ni exige inmovilizar todo el producto; sí desaconseja ampliar ramas paralelas sin una ruta clara de integración. CV-013 sigue dependiente de decisiones normativas de atribución/privacidad; no usarlo para eludir ni para ampliar arbitrariamente el saneamiento.

## 9. Hito ejecutado S2: integración aislada real #52 + #53 (09-11-2026)

**Expediente nuevo, con conciliación histórica focal de cinco familias y resolución de nueve archivos compartidos:** [SABORA_S32_SEMANTIC_RECONCILIATION_AND_COMBINED_CANDIDATE_2026-11-09.md](SABORA_S32_SEMANTIC_RECONCILIATION_AND_COMBINED_CANDIDATE_2026-11-09.md), enlazado con la **continuidad 32**. **PR #54 Draft**: [integración aislada](https://github.com/jdlc86/CartaViva/pull/54), base #53 y **no `main`**. Commit `f95a49a2` con padres #53 y #52, 24 blobs ADMIN exclusivos y nueve archivos de colisión resueltos tras contrastar código. Ambos HEAD originales son ancestros; no hace falta volver a construir la historia de las 42 PR originales.

**S1:** genealogía completada 46/46; cinco frentes históricos comparados de nuevo (76 rutas, 0 ausentes, 19 idénticas y 57 evolucionadas). Se registra clasificación semántica por familia, pero **no** equivalencia absoluta de los cambios ni aceptación visual humana. Contrato CV-019 variantes sí tiene implementación y pruebas posteriores a la fotografía de 06-11; no restaurar diagnóstico desfasado como brecha vigente.

**S2:** **candidato conjunto creado en rama aislada**; no fusionado en `main`. **S3:** primer SHA `f95a49a2` falló H6/Bootstrap por la aserción de lectura del editor tras guardado, introducida al combinar los E2E; cuatro puertas PWA/UI verdes. Reparación causal `03d1e61f`, conserva aserciones fuertes y seis workflows en nueva ejecución, **resultado aún no cerrado** en esta nota. **S4 sin autorizar**. Verificaciones PG17 y corrección pertenecen exclusivamente a GitHub Actions/PR #54; sin recursos operativos, VPS, Fleetia ni Supabase real.

## 10. Cierre automatizado S3 y registro propuesto S4 por cada PR — 09-11-2026

> **Esta sección es la fotografía vigente del estado de saneamiento**; los apartados 1–9 contienen antecedentes y cortes anteriores. El inventario original 46/46 se amplió por la creación del **PR #54**, por lo que ahora existen **47 PR abiertos, todos Draft**. No se modificó ninguna base, estado o aprobación de PR por elaborar esta tabla.

### S3 — Candidatura combinada validada técnicamente en CI

- **Rama exclusivamente candidata:** `integration/sabora-s32-admin-waiter-sanitization-20261109`, [PR #54 Draft](https://github.com/jdlc86/CartaViva/pull/54) con base en #53, nunca `main`.
- **Último commit funcional realmente probado:** `03d1e61faa8857396ed051c91e5c36c314a2b2f9`. Los commits documentales posteriores `[skip ci]` **no** acreditan nueva ejecución funcional.
- **Seis de seis workflows GitHub Actions `completed/success` sobre ese mismo SHA:** [Bootstrap PG17 #42704557734](https://github.com/jdlc86/CartaViva/actions/runs/42704557734), [H6 consolidado #42704557652](https://github.com/jdlc86/CartaViva/actions/runs/42704557652), [Chromium cliente #42704557672](https://github.com/jdlc86/CartaViva/actions/runs/42704557672), [Chromium gestión #42704557786](https://github.com/jdlc86/CartaViva/actions/runs/42704557786), [CV-012 dos PWA #42704557793](https://github.com/jdlc86/CartaViva/actions/runs/42704557793), [cobertura funcional/UI #42704557673](https://github.com/jdlc86/CartaViva/actions/runs/42704557673).
- **Evidencia de logs:** Bootstrap `pnpm test` **1365/1365**, PostgreSQL 17 real con migraciones y roles aislados, E2E anuncios CV-014 y llamada a sala **PASS**, E2E de gobierno ADMIN JWT/HMAC/Fastify/Chromium **PASS**; H6 consolidado **bloques 1, 2A, 2B PASS**, compilaciones cliente/gestión/API y smoke Docker aislado correctos. El job `visual-final-acceptance-gate` fue **`skipped`**: el workflow global en verde no significa aprobación visual humana.
- **Incidencia y cierre:** el commit inicial `f95a49a2` falló H6/Bootstrap porque el test de anuncios consultaba el formulario **después** de que se limpiara al guardar. El código de producto no perdió el cuerpo publicado. Se corrigió en `03d1e61f` capturando `formattedBody` antes del envío y manteniendo igualdad exacta con borrador y proyección. La batería completa se repitió, **sin eliminar aserciones**.
- **Dictamen S3:** **CERRADO EN ALCANCE DE VALIDACIÓN AUTOMATIZADA DEL CANDIDATO COMBINADO**, no certificación independiente ni producto operativo. Las pruebas E2E de titularidad y llamadas se ejecutaron en la misma candidatura/runner PG17, pero sus recorridos están organizados por suites independientes. **No afirmar** que se probó un único montaje de Fastify con todos los opt-in de ambos activos simultáneamente si no consta ese escenario específico.

### S4 — Registro de tratamiento de los 47 PR (PROPUESTA, SIN CIERRES NI FUSIONES)

**Agrupación verificada por la genealogía 46/46 previa y los dos padres de #54:** **33 HEAD ancestrales** de la candidatura, **5 ramas funcionales divergentes** (#4/#5/#8/#17/#22), **4 PR divergentes de una misma cadena H3** (#18–#21), **4 PR documentales divergentes** (#14/#31/#40/#44), y el **PR #54 como referencia**. Total **33+5+4+4+1=47**. Los cinco PR funcionales fueron cotejados por 76 rutas (19 blobs iguales, 57 evolucionados, ninguno ausente); esto no sustituye una aceptación semántica integral.

| PR abierto | Clase y tratamiento preliminar | Acción permitida ahora |
| --- | --- | --- |
| [#1](https://github.com/jdlc86/CartaViva/pull/1) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#2](https://github.com/jdlc86/CartaViva/pull/2) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#4](https://github.com/jdlc86/CartaViva/pull/4) | divergencia funcional: revisión semántica pendiente | No restaurar código viejo; completar diferencia contractual/funcional pendiente |
| [#5](https://github.com/jdlc86/CartaViva/pull/5) | divergencia funcional: revisión semántica pendiente | No restaurar código viejo; completar diferencia contractual/funcional pendiente |
| [#7](https://github.com/jdlc86/CartaViva/pull/7) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#8](https://github.com/jdlc86/CartaViva/pull/8) | divergencia funcional: revisión semántica pendiente | No restaurar código viejo; completar diferencia contractual/funcional pendiente |
| [#10](https://github.com/jdlc86/CartaViva/pull/10) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#11](https://github.com/jdlc86/CartaViva/pull/11) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#12](https://github.com/jdlc86/CartaViva/pull/12) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#13](https://github.com/jdlc86/CartaViva/pull/13) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#14](https://github.com/jdlc86/CartaViva/pull/14) | divergencia documental: preservar procedencia | Confirmar documento preservado; cierre individual solo con evidencia |
| [#15](https://github.com/jdlc86/CartaViva/pull/15) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#16](https://github.com/jdlc86/CartaViva/pull/16) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#17](https://github.com/jdlc86/CartaViva/pull/17) | divergencia funcional: revisión semántica pendiente | No restaurar código viejo; completar diferencia contractual/funcional pendiente |
| [#18](https://github.com/jdlc86/CartaViva/pull/18) | H3: ancestro de #22; cotejar como una cadena | No cerrar por nombre de PR; reconciliar con expediente #22 |
| [#19](https://github.com/jdlc86/CartaViva/pull/19) | H3: ancestro de #22; cotejar como una cadena | No cerrar por nombre de PR; reconciliar con expediente #22 |
| [#20](https://github.com/jdlc86/CartaViva/pull/20) | H3: ancestro de #22; cotejar como una cadena | No cerrar por nombre de PR; reconciliar con expediente #22 |
| [#21](https://github.com/jdlc86/CartaViva/pull/21) | H3: ancestro de #22; cotejar como una cadena | No cerrar por nombre de PR; reconciliar con expediente #22 |
| [#22](https://github.com/jdlc86/CartaViva/pull/22) | divergencia funcional: revisión semántica pendiente | No restaurar código viejo; completar diferencia contractual/funcional pendiente |
| [#23](https://github.com/jdlc86/CartaViva/pull/23) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#24](https://github.com/jdlc86/CartaViva/pull/24) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#25](https://github.com/jdlc86/CartaViva/pull/25) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#26](https://github.com/jdlc86/CartaViva/pull/26) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#27](https://github.com/jdlc86/CartaViva/pull/27) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#28](https://github.com/jdlc86/CartaViva/pull/28) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#29](https://github.com/jdlc86/CartaViva/pull/29) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#30](https://github.com/jdlc86/CartaViva/pull/30) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#31](https://github.com/jdlc86/CartaViva/pull/31) | divergencia documental: preservar procedencia | Confirmar documento preservado; cierre individual solo con evidencia |
| [#32](https://github.com/jdlc86/CartaViva/pull/32) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#34](https://github.com/jdlc86/CartaViva/pull/34) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#36](https://github.com/jdlc86/CartaViva/pull/36) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#38](https://github.com/jdlc86/CartaViva/pull/38) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#40](https://github.com/jdlc86/CartaViva/pull/40) | divergencia documental: preservar procedencia | Confirmar documento preservado; cierre individual solo con evidencia |
| [#41](https://github.com/jdlc86/CartaViva/pull/41) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#42](https://github.com/jdlc86/CartaViva/pull/42) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#43](https://github.com/jdlc86/CartaViva/pull/43) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#44](https://github.com/jdlc86/CartaViva/pull/44) | divergencia documental: preservar procedencia | Confirmar documento preservado; cierre individual solo con evidencia |
| [#45](https://github.com/jdlc86/CartaViva/pull/45) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#46](https://github.com/jdlc86/CartaViva/pull/46) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#47](https://github.com/jdlc86/CartaViva/pull/47) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#48](https://github.com/jdlc86/CartaViva/pull/48) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#49](https://github.com/jdlc86/CartaViva/pull/49) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#50](https://github.com/jdlc86/CartaViva/pull/50) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#51](https://github.com/jdlc86/CartaViva/pull/51) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#52](https://github.com/jdlc86/CartaViva/pull/52) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#53](https://github.com/jdlc86/CartaViva/pull/53) | HEAD ancestro del candidato #54 (no equivale a cierre aprobado) | Mantener abierto hasta decisión documentada de absorción/sustitución |
| [#54](https://github.com/jdlc86/CartaViva/pull/54) | candidato combinado S3 (mantener Draft) | Revisión independiente, aceptación técnica y autorización antes de fusionar |

**Criterios explícitos para decidir cierres o fusiones en una fase posterior:** (a) existencia de contrato normativo y evidencia por requisito; (b) demostrar que las contribuciones originales están preservadas o superadas **por comportamiento**, no solo por ancestralidad; (c) resguardar trazabilidad histórica de CI y migraciones; (d) revisar el delta de los cinco legados y la cadena H3; (e) identificar revisión independiente de #52/#54, aceptación humana visual F28/R09 y puertas M4/M6 **separadas**; (f) pedir autorización expresa para fusionar en `main`, cerrar PR o cambiar protección de rama. Los conflictos `dirty` históricos de #10/#11/#45 con sus propias bases no acreditan defectos del candidato integrado.

**Estado de S4:** **PROPUESTA COMPLETA 47/47**, no ejecutada. Ningún PR ha sido cerrado, fusionado, cambiado de base ni eliminado; las 47 siguen Draft. `main` permanece sin cambios y la protección de `main` sigue siendo una cuestión de gobierno a tratar con autorización, no un defecto corregido. **Producción NO-GO.**

## 11. Extensión técnica S3 — nueva prueba conjunta con un solo Fastify (09-11-2026)

**Estado de este corte: IMPLEMENTACIÓN LISTA, CI DEL NUEVO SHA SIN CERRAR.** La evaluación S3 anterior (6/6 sobre `03d1e61f`) se mantiene válida **solo para aquel código**. La candidatura de integración [PR #54 Draft](https://github.com/jdlc86/CartaViva/pull/54) incorpora ahora el recorrido conjunto `scripts/ci/ownership-governance-postgres17.test.mjs`: PostgreSQL 17 desechable, Fastify único con ambos módulos, logins SQL separados y capacidades HMAC, ADMIN propietario y ROOT, llamada de cliente y atención por camarero, negativas cruzadas y dos PWA Chromium. Se usa el harness integrado existente y se conservan todas sus pruebas previas. El escenario **no** equivale a crear el runtime completo `createM2RestaurantCandidate` con todos los pools restantes ni al entorno operativo.

**Diagnóstico verificable:** el primer intento `f0b1779e` falló en el fixture antes de las aserciones de negocio, por `42P08` al reutilizar `$3` entre tipos SQL incompatibles en la tabla de visitas. `16439cac` había corregido antes una posible longitud errónea de ID público. El nuevo SHA funcional `6ce5af91b772e5063563007f4247f3e1196e1826` corrige el vínculo de parámetros con `$5` y repite la batería **completa**, sin tocar esquema o reglas de negocio. [Bootstrap #42711089117](https://github.com/jdlc86/CartaViva/actions/runs/42711089117), [H6 #42711089296](https://github.com/jdlc86/CartaViva/actions/runs/42711089296), [Chromium cliente #42711089011](https://github.com/jdlc86/CartaViva/actions/runs/42711089011), [gestión #42711089072](https://github.com/jdlc86/CartaViva/actions/runs/42711089072), [PWA #42711089035](https://github.com/jdlc86/CartaViva/actions/runs/42711089035), [UI #42711089841](https://github.com/jdlc86/CartaViva/actions/runs/42711089841): cuatro gates rápidos correctos, **dos largos sin resultado final en el momento del registro**.

**No rebajar S4 ni cerrar PR mientras dure la validación del código nuevo:** 47 PR Draft y propuesta de 47/47 sin ejecutar, `main` intacta. Solo cuando el CI completo del SHA nuevo esté confirmado se podrá actualizar la conclusión S3. La revisión independiente, aprobación visual F28/R09, Stripe remoto M4, M6, producción y decisión administrativa S4 siguen como puertas distintas.

## 12. Seguimiento de S3 extendido — flag PWA real y CI del SHA 5c31354e (09-11-2026)

La nueva prueba de convivencia de ADMIN y camarero sobre Fastify único es un **E2E integrador** dentro del harness PG17/Chromium existente. La primera incidencia `42P08` del fixture SQL se corrigió en `6ce5af91`; el siguiente E2E alcanzó Chromium y detectó que el botón de cliente estaba deshabilitado por **falta de la configuración opt-in Vite de pruebas**, no por permisos o negocio. Se corrigió en `5c31354e2fcededa4e3a78a33c2582cde6f2f742` reutilizando el modo/env exacto que ya usa el test CV-014, sin modificar el diseño, eliminar aserciones o aumentar timeouts. [Evidencia técnica §8](SABORA_S32_SEMANTIC_RECONCILIATION_AND_COMBINED_CANDIDATE_2026-11-09.md).

**Estado:** seis workflows lanzados sobre el último SHA funcional; **resultado global pendiente** a la hora de documentar. No convertir el baseline histórico 6/6 en aceptación de esta ampliación. S4 **47/47 propuesta, no ejecutada**, revisión independiente/visual y permisos para fusionar aún pendientes. No se tocó `main`, los PR históricos ni entorno productivo o ajeno.

## 13. Evidencia GitHub de ausencia de revisión independiente en PR de integración (09-11-2026)

La consulta directa de **`/pulls/52/reviews`, `/pulls/53/reviews` y `/pulls/54/reviews`** devolvió: #52, **5 `COMMENTED` por el propio autor `jdlc86`** y 0 `APPROVED`; #53 y #54, **ninguna revisión**. No debe tratarse una revisión `COMMENTED` ni una auditoría redactada por la misma persona como `APPROVED` independiente. Este hecho refuerza S4 **solo propuesto, nunca ejecutado**, no invalida los CI anteriores, ni autoriza alteraciones de ramas/PR. Mantener la aceptación humana visual y la puerta de revisión independiente separadas.

## 14. Cierre comprobado S3 extendido y puerta administrativa S4 (2026-11-10)

**Verificación posterior a la sesión (2026-11-10):** el SHA funcional **`5c31354e2fcededa4e3a78a33c2582cde6f2f742`** alcanzó **6/6 workflows `completed/success`**. [Bootstrap PG17 #42712879943](https://github.com/jdlc86/CartaViva/actions/runs/42712879943) y [H6 #42712880339](https://github.com/jdlc86/CartaViva/actions/runs/42712880339) completaron; [cliente #42712880301](https://github.com/jdlc86/CartaViva/actions/runs/42712880301), [gestión #42712879964](https://github.com/jdlc86/CartaViva/actions/runs/42712879964), [dos PWA #42712880006](https://github.com/jdlc86/CartaViva/actions/runs/42712880006), [UI funcional #42712880078](https://github.com/jdlc86/CartaViva/actions/runs/42712880078) también. El log Bootstrap registra **1.365/1.365 Node**, y el nuevo subtest **«PG17 JWT/HMAC single Fastify with ADMIN ownership and waiter calls, two PWAs…» = PASS**. H6 registra **Block 1, Block 2A y Block 2B PASS**. Los commits posteriores al SHA funcional son de documentación; no atribuirles CI propio. El test valida dos rutas sobre **un Fastify** y ambas PWA con PG17 desechable, no el arranque de `createM2RestaurantCandidate` con todos los pools.

**Nueva lectura vigente del plan:** S1 genealogía/equivalencias **cerrado únicamente en su alcance documentado** (cinco familias históricas sin paridad global demostrada); S2 candidato #52+#53 construido en rama aislada #54; S3 **combinación CI y escenario conjunto en Fastify 6/6 PASS** sobre `5c31354e`; S4 **propuesta 47/47 PR sin ejecutar**. Mantener 33 ancestros, cinco divergencias funcionales, cuatro de la cadena H3, cuatro documentales y #54 integrador diferenciados. No cerrar 33 ancestros solo por `merge-base`: requieren decisión de retención de requerimientos y trazabilidad, y los otros 13 exigen expediente de equivalencia. `main` sin protección declarada `protected=false` y sin cambios; su gobierno requiere decisión y autorización. No hay `APPROVED` independiente en #52/#53/#54. El paso siguiente no es rehacer CI, sino preparar/autorizar la estrategia de integración y cierres, preservando los NO-GO visual, Stripe M4, operación M6 y producción.

## 15. Revisión de S4 basada en 47 PR y requisito de categorías dinámicas — 2026-11-10

**Nuevo dictamen detallado, individual 47/47:** [SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md). Este nuevo expediente completa el análisis administrativo previo, no ejecuta decisiones. La genealogía fue **recomprobada contra HEAD #54**: **33 HEAD ancestros; 13 divergentes; #54 candidato**, en total **47 PR Draft abiertos**; `main` intacta. Los cuatro documentos divergentes #14/#31/#40/#44 se releyeron y contrastaron línea por línea: contenido original conservado (20/20 líneas de #31, 141/141 de handoff #44, prefijos íntegros en #14/#40; informe de coste cero SHA idéntico). **No reproducir merges documentales de esas ramas históricas:** solo preparar, bajo autorización posterior, cierres administrativos con trazabilidad. Los ancestros del propio #54 no se consideran incorporados a `main`.

**Rectificación S4 sobre #5 — componente legado frente al montaje M3:** la whitelist fija en `catalog-read-model.js`/`CatalogReadView` es real, pero pertenece a una **lectura de catálogo legada**. La ejecución autenticada con `enableM3Management` monta `M3CatalogManagementView`, alimentada por `catalog.categories` de PostgreSQL/API, con operaciones existentes `category_create`, `category_reorder` y `category_visibility`; el modelo M3 acepta categorías por ID/nombre dinámico. El tablero ya documentaba CI M3 del editor de categorías, que esta inspección focal no reejecuta. La afirmación anterior de «incumplimiento del catálogo operativo» extrapolaba indebidamente un componente desconectado y se **retira**. **#5 sigue sin equivalencia histórica/visual completa acreditada**, pero no consta un defecto dinámico del editor autenticado. Priorizar cotejar pruebas existentes SQL/PG17/Chromium de categorías configurables, recorrido hasta PWA cliente, estilo aprobado e históricos; crear un hito correctivo únicamente frente a un defecto reproducible del flujo real. Dictamen explicado en [expediente S4 §2.2](SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md).

**Límites permanentes:** revisión independiente de titularidad pendiente (#52 cinco COMMENTED del autor, #53/#54 cero revisiones), aceptación humana visual F28/R09, Stripe remoto M4 y M6 siguen NO-GO. Los **6/6 de `5c31354e` validan S3 automatizado**, no S4 de integración/cierre, no `main` y no producción. **No se han cerrado/fusionado/retargeteado PR, cambiado la protección de rama ni desplegado nada.**
