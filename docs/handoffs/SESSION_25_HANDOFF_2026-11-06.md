# Sabora / CartaViva — continuidad operativa de la sesión 25 (2026-11-06)

> **Documento de continuidad vivo, NO normativo.** Su función es que la sesión 25 arranque con el contexto imprescindible, los **hitos importantes** y los bloqueos reales, sin reconstruir la conversación ni convertir cada corrección/prueba en un hito. No autoriza merge, despliegue, migraciones operativas, gasto ni modificaciones de requisitos.
>
> **Enlace obligatorio y fuente de estado:** [tablero vivo central M1–M6 / CV-001–CV-018](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). Consultar también [matriz de aceptación F01–F28/R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) y el [handoff vivo de sesión 23](SESSION_23_HANDOFF_2026-11-05.md). En la rama candidata no se encontró un archivo de continuidad para la sesión 24 al preparar este relevo; **no se supone ni inventa** su contenido.

## 1. Orden de lectura y jerarquía de verdad

1. **Normativa funcional:** [contrato funcional consolidado Sabora](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md) y [requisitos funcionales](../REQUISITOS_FUNCIONALES.md). Sabora es **un solo restaurante**; el directorio CartaViva es un ámbito separado. La política aprobada de cierre de cuenta de coste cero se rige por el **fin de ocupación de mesa**, no por cierre de sesión o visita individual.
2. **Normativa de diseño:** [contrato visual](../DESIGN_SYSTEM_CONTRACT.md), [auditoría del estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [requisitos visuales](../design/DESIGN_REQUIREMENTS_V1.md). Aplicar exclusivamente el diseño/flujo aprobado; la CI visual no sustituye aceptación humana.
3. **Arquitectura, permisos y operación:** [hoja de ruta técnica](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [dos PWA independientes y directorio](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md) y [aislamiento de Fleetia](../security/CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md).
4. **Estado y evidencias, NO normativa:** [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [matriz H6](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), [auditoría del grafo de PR y CI](../reviews/SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md) y [conciliación histórica funcional](../reviews/SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md). La [sesión 23](SESSION_23_HANDOFF_2026-11-05.md) es contexto anterior, no legislación del proyecto.

**Precedencia:** si tablero, informes y continuidades discrepan, mandan los contratos normativos y las decisiones visuales aprobadas. Para afirmar un resultado de prueba hace falta el **SHA exacto** y la ejecución correspondiente. Separar siempre **implementado**, **pruebas ejecutadas**, **candidato validado**, **aceptación de producto** y **GO/NO-GO operativo**.

## 2. Fotografía comprobada al preparar el relevo — 06-11-2026

- **Único repositorio autorizado para cambios:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva). Rama candidata vigente: `feat/sabora-cv012-independent-pwas-20261106`, [PR #49](https://github.com/jdlc86/CartaViva/pull/49) **abierto y Draft**, base `integration/sabora-session23-m3-acceptance-20261106` ([PR #48](https://github.com/jdlc86/CartaViva/pull/48)). Al consultar GitHub antes de crear este archivo: HEAD #49 `a04e4e5abfe47231d6ba98d05d2b7c1924ef0f79`, `mergeable=true/clean`. **La creación de esta continuidad moverá ese HEAD; volver a comprobarlo al arrancar sesión 25.**
- **`main` no integrado:** SHA observado `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. No se han autorizado merges ni activación operativa.
- **Topología:** 42 PR abiertos, todos Draft, comprobados al preparar este documento. El último inventario del [tablero §20–22](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y del [informe Git](../reviews/SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md) clasifica **28 HEAD de PR ancestrales, 13 HEAD divergentes y #49 como candidato**. Esta clasificación no equivale a cierre, fusión o paridad semántica.
- **Última aceptación integral funcional registrada:** `380a4777cad82ee359cc487b58a9f030b62596c3`, **5/5 workflows SUCCESS del mismo SHA**: [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/42253454494), [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42253454770), [Chromium cliente](https://github.com/jdlc86/CartaViva/actions/runs/42253454758), [Chromium gestión](https://github.com/jdlc86/CartaViva/actions/runs/42253454543) y [CV-012 dos PWA](https://github.com/jdlc86/CartaViva/actions/runs/42253454564). Bootstrap: **1.349/1.349 Node; 51/51 PostgreSQL 17; 4/4 coste cero; 0 SKIP** en esos bloques. Los commits **posteriores documentales no heredan automáticamente** esa aceptación.
- **Producción: NO-GO.** `apps/api/src/server.mjs` sigue en modo `health-only` según el informe de estabilización. Ningún CI verde activa por sí solo H3–H6 en operación o permite tocar VPS, Fleetia, Supabase operativo, Stripe real ni otros recursos.

## 3. Hitos importantes ya alcanzados (con límites)

### A. Candidato integral H6 y política de coste cero
El recorrido de cambio de mesa A→B, cuentas individuales, revisión previa al despacho, idempotencia y operación cocina/sala dispone de [informe de cierre candidato](../reviews/SABORA_TABLE_CHANGE_FINAL_INTEGRAL_CLOSURE_REPORT_2026-11-04.md) y aceptación posterior con PostgreSQL 17/HTTP/Chromium. La política normativa de coste cero se incorporó el 05-11: autocierre solo al finalizar ocupación, con las condiciones aprobadas. **M1/CV-001/CV-003 y la aceptación global de matriz F/R permanecen EN CURSO**; no atribuir entrega física ni cobro Stripe test a una simulación o transición lógica.

### B. M2 — arranque aislado del restaurante, candidato validado
[PR #46](https://github.com/jdlc86/CartaViva/pull/46) y [reporte M2](../reviews/SABORA_SESSION23_M2_CANDIDATE_REPORT_2026-11-05.md): bootstrap opt-in H3–H6 con identidades y roles SQL mínimos, JWT/HMAC, PostgreSQL 17 efímero y las dos PWA; se resolvieron los SKIP antiguos de transferencia. **Candidato técnico, no servicio productivo habilitado**. CV-004 conserva además la deuda de integración/conciliación segura del grafo de PR.

### C. M3 — mesas, QR y catálogo dinámico, candidato técnico
[PR #48](https://github.com/jdlc86/CartaViva/pull/48) y [aceptación independiente M3](../reviews/SABORA_SESSION23_M3_INDEPENDENT_ACCEPTANCE_2026-11-06.md): recorrido PostgreSQL 17 → Fastify → dos PWA, publicación de catálogo, mesas/QR, pedido gratuito, cocina, pickup y cierre económico. Se corrigieron errores de permisos mínimos, recuperación de UI tras GET fallido y presentación de categorías. La versión por rol de gestión quedó cubierta posteriormente por los 5 workflows del SHA `380a4777`. **CV-006/CV-007 son candidatos validados técnicamente, NO hay conformidad visual humana definitiva ni aceptación operativa.**

### D. CV-012 — dos PWA independientes, candidato técnico
[PR #49](https://github.com/jdlc86/CartaViva/pull/49): manifiestos, scopes, service workers y segregación/offline fueron cubiertos por la CI CV-012 y por la batería integral de `380a4777`. **No equivale a instalación y uso real aprobados en Android/iOS**, ni al cierre de todo M5.

### E. Hito de estabilización Git y CI: conflicto resuelto
Se comprobó que el problema de lanzamiento de Actions estaba vinculado al conflicto de historia entre #48/#49 (`mergeable_state=dirty`), **no** a un agotamiento de créditos acreditado. La reconciliación `65b0ead2` incorporó el HEAD de #48 como padre **sin alterar el árbol de archivos del candidato**. GitHub recuperó la ejecución. Se corrigió después, **en el E2E integral existente**, el orden de la prueba de cierre de mesa 915 ante cambio admin/camarero (`380a4777`), y el resultado fue 5/5 verde. Ni rebase/force push ni merge a `main`.

### F. Preservación documental y conciliación histórica
Se revisaron las rutas de archivos de **los 42 HEAD de PR Draft**, no solo de sus ramas terminales. Se recuperaron tres documentos históricos ausentes (continuidades de sesiones 11 y 15, e informe independiente coste cero), sin elevarlos a normativa. Posteriormente se contrastaron semánticamente #4 (cocina/sala), #5 (gestión), #8 (actor SQL), #17 (validaciones HTTP) y #22 (cesta): **76 entradas de paths comparados, 22 blobs idénticos, 54 evolucionados, 0 ausentes**. **No se ejecutó otra suite en esa auditoría**, ni se demostró equivalencia funcional de las 54 diferencias. No recuperar código viejo mediante cherry-picks especulativos.

## 4. Qué sigue ABIERTO o BLOQUEADO

- **Primero, estabilizar la integración de los PR**: siguen 13 HEAD históricos divergentes; revisar las diferencias funcionales importantes de forma verificable, preservando seguridad actual, diseño y cambios normativos posteriores. La mera presencia de archivos no permite cerrar PR. **No continuar abriendo PR por inercia ni retomar la matriz como sustituto de este saneamiento.**
- **Deuda funcional confirmada por inspección:** el modelo de cesta agrupa/configura por `itemId` (`configureBasketLine` / `changeBasket`); la normativa RF exige **líneas independientes del mismo producto cuando cambian personalizaciones**. Pendiente de hito funcional completo; **no** declararlo pérdida demostrada de #22.
- **M1**: aceptación H6 global y matriz F01–F28/R01–R10 sin cierre definitivo; **M3**: revisión humana del diseño y flujos por rol; **M4**: Stripe sandbox real condicionado a credenciales/autorización y caja/cobro/cierre a diseño aprobado; **M5**: resto de producto, identidad, PWA móviles y directorio; **M6**: seguridad, recuperación, observabilidad, secretos, aislamiento y expediente de piloto. Ver estado actual exacto de IDs en el tablero antes de actuar.
- **Operación**: `health-only`, sin arranque operativo integral aprobado ni habilitación de pagos, despliegue o recursos reales. Producción **NO-GO**.

## 5. Secuencia recomendada para arrancar sesión 25

1. **Verificar primero GitHub**, no confiar ciegamente en esta fotografía: HEAD/base/Draft/conflictos de #49 y #48; `main`; lista real de PR y rama; los cinco workflows **del SHA que se pretenda validar**. Comprobar cambios posteriores de otros colaboradores.
2. **Leer** [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [normativa](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [diseño aprobado](../DESIGN_SYSTEM_CONTRACT.md), [matriz H6](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), [auditoría Git](../reviews/SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md) y [conciliación funcional](../reviews/SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md).
3. **Completar el saneamiento de la línea candidata y la revisión de divergencias con evidencia suficiente**. Identificar qué ya está preservado, qué ha evolucionado deliberadamente por contrato, qué falta y qué puede aceptarse. Proponer una decisión trazable para los PR históricos; **no ejecutar cierres ni merges sin autorización separada**. Evitar abrir más PR para pequeñas correcciones de esta fase.
4. Tras estabilizar el repositorio, planificar **el siguiente hito funcional íntegro** conforme al tablero y normativa (incluida la brecha de personalizaciones múltiples), con recorrido real de actores/API/PG17/dos PWA y aceptación de producto diferenciada. No convertir micropruebas en metodología. Las aisladas solo sirven para diagnosticar defectos concretos o defender invariantes críticas.
5. Actualizar tablero, informes y **este handoff** solo al cerrar hitos importantes o aparecer un bloqueo/decisión que cambie el rumbo; registrar los SHA exactos, qué se probó y qué sigue sin validar.

## 6. Regla de mantenimiento de esta continuidad viva

En cada actualización añadir **una sección corta por hito o dictamen relevante**, con: **fecha**, **rama/PR/SHA**, **cambio comprobado**, **pruebas integrales realmente ejecutadas**, **resultado verificable**, **límite de aceptación**, **pendientes** y **siguiente punto de control**. No reescribir retrospectivamente resultados; si una afirmación anterior caduca, señalar expresamente su sustitución y fuente. Mantener actualizado el [tablero central](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) con los mismos estados y sin alterar requisitos normativos por conveniencia.

**Restricciones permanentes:** solo escribir en `jdlc86/CartaViva`; no tocar Fleetia ni otros proyectos del VPS; prohibido poner en riesgo sus contenedores, recursos o disponibilidad. Sin merge, despliegue, reinicio, borrado, migración Supabase operativa ni cambio en servicios o claves reales sin autorización expresa y aislamiento total. El documento no implica que se haya realizado operación alguna.

## 7. Apertura del registro de sesión 25 — 06-11-2026 (DOCUMENTAL)

Se crea esta continuidad a partir de las evidencias y del estado GitHub verificados arriba. **No se ha implementado código funcional ni ejecutado una aceptación nueva por crearla.** El siguiente registro deberá corresponder a un hito real, no a un mensaje de progreso.


## 8. Hito de conciliación histórica de las 13 divergencias — 06-11-2026

Se terminó el **inventario y contraste documental/estático de las 13 referencias de PR aún no ancestrales**, sin cerrar ni fusionar ninguna. [Informe completo](../reviews/SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md) y [tablero §23](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). Hallazgos: la cadena #18→#22 es lineal y no cinco trabajos independientes; #14/#31/#40/#44 contienen ramas documentales; #4/#5/#8/#17/#22 exigen respetar las evoluciones del código y contratos posteriores. Los 13 títulos Node y 8 títulos Chromium históricos de H3 siguen presentes, pero su **paridad semántica no está totalmente demostrada**. Se preservó, como anexo histórico en la continuidad 22, la nota independiente de coste cero de #44 que faltaba literalmente en la versión evolucionada.

**Clasificación:** auditoría **REALIZADA** en el alcance explícito; **NO** nueva prueba integral, cierre funcional, cierre de PR ni aprobación de producción. Último 5/5 CI funcional documentado: `380a4777`; los commits documentales posteriores no heredan sus resultados. **Siguiente paso**: aceptación integrada de preservación y UX por rol en el candidato actual, preparar propuesta trazable de cierre/conservación de PR sin ejecutarla; después hito completo de variantes independientes de cesta exigidas por RF. Mantener M1/F-R, Stripe test, caja, revisión visual y M6 como pendientes/bloqueados según tablero. Sin merge, VPS, Fleetia, Supabase operativo ni despliegue.
