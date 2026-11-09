# Sabora / CartaViva — plan vivo de saneamiento de GitHub (sesión 32, 2026-11-09)

> **DOCUMENTO OPERATIVO DE AUDITORÍA Y PLANIFICACIÓN, NO NORMATIVA NI ORDEN DE FUSIÓN.** Elaborado a petición del propietario durante la sesión 32. La fuente de verdad de requisitos son los contratos normativos del repositorio; el estado de GitHub y su CI debe revalidarse antes de cualquier actuación. Este documento no acredita consolidación ejecutada, autorización de `merge` ni despliegue.
>
> **Única continuidad a la que se vincula este plan:** [sesión 32](../handoffs/SESSION_32_HANDOFF_2026-11-09.md). **Seguimiento general independiente:** [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md); **auditoría histórica de saneamiento** [26-10](GITHUB_PR_GLOBAL_HEALTH_AUDIT_2026-10-26.md) y [auditoría de matriz 09-11](SABORA_LIVE_REQUIREMENTS_MATRIX_INTEGRAL_AUDIT_2026-11-09.md). Estas fuentes de seguimiento no sustituyen normas.

## 1. Alcance, método y corte de evidencia

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

**Cambio concreto del S1 actual:** el **censo estático previo 42/42 ya se hizo**. Desde entonces se añadieron **cuatro PR #50–#53**, por lo que falta contrastar su genealogía y diferencias actuales; para las antiguas, solo **actualizar lo que haya cambiado y cerrar los puntos de paridad no demostrados**, especialmente evolución SQL/roles, UX y comportamiento. Las cinco `dirty` actuales no significan que no se resolviera un conflicto anterior específico (#48/#49): son evaluaciones diferentes contra bases diferentes y fechas distintas.

**Cambio concreto de S2/S3:** hubo integración real de rama/CI para #49, y validación aislada de #52 y #53. Lo que **no** existe es un candidato común actual #52+#53 validado como conjunto, ni equivalencia de todos los deltas no ancestrales, ni integración a `main`. Las suites y logs previos deben reutilizarse como línea base, y ejecutar de nuevo únicamente al cambiar el candidato funcional integrado, sin rebajar gates.

## 4. Hitos completos de saneamiento propuestos

### Hito S1 — Actualización del censo histórico y cierre de paridad pendiente (PARCIAL PREEXISTENTE)

**Entrada:** 46 PR y documentos normativos. Para cada PR: HEAD, base y SHA de base, relación de ancestros con rama integradora, delta exclusivo, archivos, migraciones SQL, requisitos afectados, tests y resultados de CI del mismo SHA, revisiones pendientes y evidencia de reemplazo. Reusar [auditoría 26-10](GITHUB_PR_GLOBAL_HEALTH_AUDIT_2026-10-26.md), corregir su fotografía histórica.

**Salida exigida:** matriz **46/46**, clasificados sin atajos en `contribución pendiente`, `contribución incorporada por ancestro`, `equivalente demostrado`, `superado con evidencia`, `conflicto por resolver`, o `sin evidencia suficiente`. Una clasificación de PR como redundante necesita comparación de código y contratos **más** recorrido funcional relevante, no solo árboles/blob/commits ni la existencia de una rama descendiente. Registrar una decisión por PR; no cerrarlos aún.

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
| #45 `dirty` en cadena de base de candidaturas recientes | Alta | Resolver causa con comparación base/HEAD y regresión; no confundir con `unstable` |
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
| S1 matriz de equivalencia 46/46 | **PARCIAL: 42/42 inventariados y clasificados estáticamente el 06-11; no equivalencia final** | Actualizar #50–#53 y reconciliar la paridad semántica pendiente, sin repetir el censo histórico |
| S2 consolidación candidata aislada | **PARCIAL HISTÓRICO**: #48→#49 reparado y probado; **candidato final no construido** | Integrar solo deltas pendientes, incluidas las ramas hermanas #52/#53, con revisión de conflictos |
| S3 prueba end-to-end combinada | **PARCIAL HISTÓRICO**: #49 5/5 y #52/#53 6/6 por separado; **conjunto no probado** | SHA integrado tras S2 y batería conjunta real |
| S4 fusión/cierre de PR | **NO AUTORIZADO** | S1–S3, revisión y autorización explícita |
| Producción / Supabase / VPS | **NO-GO** | Autorización operativa separada |

**Próxima acción técnica recomendada:** reutilizar íntegro el **inventario histórico 42/42** y sus comparaciones, actualizar únicamente las **cuatro PR nuevas #50–#53**, revalidar la evidencia de los 13 divergentes (en particular #4/#5/#8/#17/#22 y cadena H3), resolver las cinco `dirty` y cuatro `unstable` actuales **solo donde siga existiendo un problema real**, y completar la matriz de paridad que antes quedó pendiente; después, preparar la integración final. No reconstruir desde cero el saneamiento ya realizado. El hito CV-013 de Excel permanece condicionado por su normativa y no se debe utilizar para eludir la estabilización de Git.
