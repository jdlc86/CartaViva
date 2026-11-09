# Sabora / CartaViva — S4: dictamen de tratamiento verificable de 47 PR (2026-11-10)

**Naturaleza:** expediente de conciliación y decisiones **PROPUESTAS**, no documento normativo, aprobación independiente, consentimiento de merge, orden de cierre, ni autorización operativa. **Única continuidad activa:** [sesión 32](../handoffs/SESSION_32_HANDOFF_2026-11-09.md). **Plan matriz:** [saneamiento S1–S4](SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md). **Candidato:** [PR #54 Draft](https://github.com/jdlc86/CartaViva/pull/54) sobre PR #53, nunca `main`.

## 1. Corte de evidencia y contabilidad inequívoca

- REST GitHub `pulls?state=open&per_page=100`: **47 abiertos, 47 Draft**. Cada fila de §3 toma el HEAD del PR en esa lectura. **Candidato `#54` HEAD inicial del corte `35de28d0cc32777e88e884e7aa239a49d7f00554`**, con `main` separado, SHA `42b46358a76162445fa9e0b20e7b87dd0a640b5b`.
- `compare_commits` para **los 46 PR anteriores** frente al HEAD #54: **33 HEAD ancestros** (`behind=0`), **13 divergentes** (el HEAD histórico posee commits no presentes en #54), más #54 como referencia. Las 33 comparaciones ancestrales se reejecutaron en este corte; para las 13 divergentes se reejecutó también el contraste con `merge-base` y todos continúan divergentes. **Parentesco Git ≠ equivalencia semántica.**
- Desglose: **31 ancestros generales + #52 ADMIN + #53 CV-014 = 33**; **5 ramas funcionales #4/#5/#8/#17/#22**, **4 precedentes H3 #18–#21**, **4 documentos #14/#31/#40/#44 = 13 divergentes**; **#54 integrador = 1**. 31+2+5+4+4+1=47.
- **CI sobre último SHA funcional realmente ejercitado `5c31354e2fcededa4e3a78a33c2582cde6f2f742`: 6/6 SUCCESS** ([Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42712879943), [H6](https://github.com/jdlc86/CartaViva/actions/runs/42712880339), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/42712880301), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/42712879964), [dos PWA](https://github.com/jdlc86/CartaViva/actions/runs/42712880006), [UI](https://github.com/jdlc86/CartaViva/actions/runs/42712880078)). Bootstrap registra 1365/1365 Node y el E2E conjunto de un Fastify ADMIN + llamadas + ambas PWA PASS; H6 bloques 1, 2A, 2B PASS. **No se probó el runtime completo `createM2RestaurantCandidate` con todos sus pools**, ni la aceptación visual humana o producción.
- Las revisiones formales en `pulls/52/reviews` muestran **5 COMMENTED del autor, 0 APPROVED**; #53 y #54, **0 revisiones**. No fingir Codex independiente ni reemplazarlo con comentario propio.

## 2. Pruebas adicionales que cambian realmente el dictamen

### 2.1 Cuatro divergencias documentales ya preservadas

Comparación actual de archivos originales de cada HEAD histórico contra los de #54:

| PR | Fuente histórica auditada | Evidencia literal en candidato | Acción propuesta |
| --- | --- | --- | --- |
| [#14](https://github.com/jdlc86/CartaViva/pull/14) | `docs/continuity/SESSION_11_HANDOFF.md` | Archivo histórico **prefijo íntegro** del actual; se añadió solo aviso de recuperación (06-11) | No recuperar de nuevo ni introducir branch antigua; posible cierre **solo autorizado** |
| [#31](https://github.com/jdlc86/CartaViva/pull/31) | `docs/continuity/SESSION_13_H6_FULL_CODEX_BRIEF_2026-10-27.md` | **20/20 líneas** originales conservadas en orden; se añadieron dos líneas de advertencia/enlace a normativa y tablero | Sin código pendiente; posible cierre **solo autorizado** |
| [#40](https://github.com/jdlc86/CartaViva/pull/40) | `docs/handoffs/SESSION_15_HANDOFF_2026-10-30.md` | Archivo original **prefijo íntegro** del actual; añade aviso histórico | Sin recuperación pendiente; posible cierre **solo autorizado** |
| [#44](https://github.com/jdlc86/CartaViva/pull/44) | `docs/handoffs/SESSION_22_HANDOFF_2026-11-04.md` y `docs/reviews/SABORA_H6_ZERO_COST_INDEPENDENT_REVIEW_2026-11-05.md` | **141/141 líneas** del handoff histórico preservadas en orden más anexos; informe de coste cero **SHA de blob idéntico**; tablero histórico evolucionado | Preservar procedencia; valorar cierre **solo autorizado** sin sustituir reglas posteriores |

Estos resultados acreditan **preservación de contenido**, no identidad de todos los blobs ni que una nota antigua constituya normativa vigente. En particular, el cambio histórico al tablero de #44 no debe restaurarse sobre el tablero actual sin comprobar su evolución posterior.

### 2.2 Riesgo real de catálogo de gestión que impide aprobar sin reservas #5

**Requisito aprobado:** [`docs/REQUISITOS_FUNCIONALES.md`, «Carta y catálogo»](../REQUISITOS_FUNCIONALES.md) exige categorías iniciales **ENTRANTE, PRIMERO, SEGUNDO, POSTRE, BEBIDA** y categorías adicionales **configurables**, compatibles con informes/históricos.

**Código vigente observado:** `apps/management/src/catalog-read-model.js` define `CATALOG_CATEGORIES=['Todos','Bebidas','Primeros','Segundos','Postres']` y `PUBLISHED_CATEGORIES` solo acepta esas cuatro categorías; `validateAdminPublishedCatalog` rechaza otras, `searchAdminPublishedCatalog` solo filtra ese conjunto. En `apps/management/src/views/CatalogView.tsx`, `DishWorkspace` dibuja precisamente esos filtros y `CategoryWorkspace` construye su listado a partir de la lista estática; el test `apps/management/tests/catalog-read-model.test.mjs` incluso comprueba que `Entrantes` se **rechaza**. Este comportamiento persiste en el HEAD #54 y contrasta con la norma de categorías dinámicas.

**Alcance preciso:** afecta a la **proyección publicada de lectura de la PWA de gestión** (incluida su presentación de filtros/agrupaciones); **no se ha demostrado** en esta inspección que toda la administración M3 ni la base de datos impidan crear categorías nuevas. No confundir lo uno con lo otro. **S4 de #5: BLOQUEADO POR DISCREPANCIA FUNCIONAL ACTUAL ACREDITADA**, aunque los archivos y tests históricos de su PR se hayan conservado. Corregir como **hito funcional completo** conforme al contrato: lectura dinámica, filtros, UI con estilo aprobado, autorización del catálogo, regresión Node/PG17/Fastify/Chromium y prueba de categoría adicional; no cambiar normativa ni hacer un cherry-pick antiguo. Una vez corregido, reexaminar #5 y su conformidad visual humana.

### 2.3 Resto de las cinco familias históricas

- **#4 — Cocina y camarero:** la evolución de transición y bloqueo SQL cumple la semántica aprobada de «Voy a recoger»/«Cancelo» según [informe histórico](SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md); no inferir prueba de cada recorrido visual anterior ni restaurar cancelación de comanda.
- **#8 — Identidad de actor SQL:** mantener el endurecimiento de caducidad real después de locks, roles y RLS; no restituir migración más antigua que debilite el control.
- **#17 — GET HTTP estricto:** siguen los validadores escalares para `limit/status/cursor` y el rechazo opcional de `picked_up` legado; diferencias de semántica de sala exigen cotejo antes de cerrar.
- **#22 + #18–#21 — H3:** los cinco documentos históricos H3 estaban conservados, `client-state.ts` ahora usa `basketLineKey(itemId,selection)` para variantes independientes, `configureBasketLine` y tests existentes; la brecha de variantes detectada el 06-11 ya no debe elevarse automáticamente a defecto actual. La equivalencia **integral** de incidencias, consentimiento de precio, sincronización entre pestañas y UI aún necesita decisión basada en recorridos de contrato, no nombres de pruebas.

## 3. Propuesta de disposición individual de los 47 PR

**Regla que aplica a todas las filas:** **NO cerrar, fusionar, cambiar base, borrar ramas ni alterar protecciones** mediante esta propuesta. Los HEADs marcados «ancestro» están contenidos en una **rama Draft**, no en `main`; no son por ello PR ya integrados en destino autorizado.

| PR | HEAD observado | Clasificación | Dictamen específico / puerta anterior a cualquier cierre |
| --- | --- | --- | --- |
| [#1](https://github.com/jdlc86/CartaViva/pull/1) | `f98bc9afd978` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#2](https://github.com/jdlc86/CartaViva/pull/2) | `6fe2396f64ac` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#4](https://github.com/jdlc86/CartaViva/pull/4) | `bd268c67d8c4` | DIVERGENTE FUNCIONAL | Cotejar transición cocina/sala con contrato «Voy a recoger» / «Cancelo» y aceptación visual; NO cherry-pick legado |
| [#5](https://github.com/jdlc86/CartaViva/pull/5) | `6fbff90597d0` | DIVERGENTE FUNCIONAL | BLOQUEO RF verificable: catálogo publicado de gestión filtra/valida con categorías fijas; corregir y validar categorías dinámicas antes de cierre |
| [#7](https://github.com/jdlc86/CartaViva/pull/7) | `f33c39e4e03f` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#8](https://github.com/jdlc86/CartaViva/pull/8) | `8818366c7989` | DIVERGENTE FUNCIONAL | Mantener vinculación de actor en SQL y vencimiento de HMAC tras locks; no restaurar permisos anteriores, seguridad operativa pendiente |
| [#10](https://github.com/jdlc86/CartaViva/pull/10) | `8598ee31a51e` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#11](https://github.com/jdlc86/CartaViva/pull/11) | `628f4c0ef306` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#12](https://github.com/jdlc86/CartaViva/pull/12) | `5d2777a48570` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#13](https://github.com/jdlc86/CartaViva/pull/13) | `5a24a1136f8c` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#14](https://github.com/jdlc86/CartaViva/pull/14) | `613df3d38a85` | DIVERGENTE DOCUMENTAL | Documento íntegro preservado como prefijo; posible cierre documental solo tras autorización |
| [#15](https://github.com/jdlc86/CartaViva/pull/15) | `516909987e8b` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#16](https://github.com/jdlc86/CartaViva/pull/16) | `353e5160625e` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#17](https://github.com/jdlc86/CartaViva/pull/17) | `518638b18052` | DIVERGENTE FUNCIONAL | Conservar validaciones escalares estrictas y prohibición de pickup legado; revisión semántica de rutas vigentes |
| [#18](https://github.com/jdlc86/CartaViva/pull/18) | `c29ebc9efa0f` | DIVERGENTE H3 | Antecedente en cadena H3→#22; evaluar con #22 y no como funcionalidad separada |
| [#19](https://github.com/jdlc86/CartaViva/pull/19) | `951991e66303` | DIVERGENTE H3 | Antecedente en cadena H3→#22; evaluar con #22 y no como funcionalidad separada |
| [#20](https://github.com/jdlc86/CartaViva/pull/20) | `9189c95a7fc8` | DIVERGENTE H3 | Antecedente en cadena H3→#22; evaluar con #22 y no como funcionalidad separada |
| [#21](https://github.com/jdlc86/CartaViva/pull/21) | `d3875c0274e2` | DIVERGENTE H3 | Antecedente en cadena H3→#22; evaluar con #22 y no como funcionalidad separada |
| [#22](https://github.com/jdlc86/CartaViva/pull/22) | `4fc4f623ca04` | DIVERGENTE FUNCIONAL | Cerrar como familia H3 solo tras equivalencia de incidencias, consentimiento, sincronización y variantes de cesta; CV-019 candidato |
| [#23](https://github.com/jdlc86/CartaViva/pull/23) | `e81b733b1f4e` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#24](https://github.com/jdlc86/CartaViva/pull/24) | `a7fbdfa753dc` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#25](https://github.com/jdlc86/CartaViva/pull/25) | `be73507c845e` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#26](https://github.com/jdlc86/CartaViva/pull/26) | `c8566dc2607f` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#27](https://github.com/jdlc86/CartaViva/pull/27) | `e1103115ae2e` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#28](https://github.com/jdlc86/CartaViva/pull/28) | `ae703dec58cf` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#29](https://github.com/jdlc86/CartaViva/pull/29) | `ae27b9087fda` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#30](https://github.com/jdlc86/CartaViva/pull/30) | `3f89d2939cd3` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#31](https://github.com/jdlc86/CartaViva/pull/31) | `86ba45425d4d` | DIVERGENTE DOCUMENTAL | 20/20 líneas originales conservadas en orden; dos líneas de advertencia añadidas; posible cierre documental autorizado |
| [#32](https://github.com/jdlc86/CartaViva/pull/32) | `a08a7a262b32` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#34](https://github.com/jdlc86/CartaViva/pull/34) | `64b4cf7a5c11` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#36](https://github.com/jdlc86/CartaViva/pull/36) | `1b8bb7e39e4a` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#38](https://github.com/jdlc86/CartaViva/pull/38) | `b7f5c3b50add` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#40](https://github.com/jdlc86/CartaViva/pull/40) | `03e874dff4b4` | DIVERGENTE DOCUMENTAL | Documento íntegro preservado como prefijo; posible cierre documental solo tras autorización |
| [#41](https://github.com/jdlc86/CartaViva/pull/41) | `cc40543d483e` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#42](https://github.com/jdlc86/CartaViva/pull/42) | `d0aba8927a17` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#43](https://github.com/jdlc86/CartaViva/pull/43) | `79092962c0bf` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#44](https://github.com/jdlc86/CartaViva/pull/44) | `43a8acaf95ba` | DIVERGENTE DOCUMENTAL | 141/141 líneas del handoff 22 conservadas en orden; informe coste cero mismo SHA; historial tracker evolucionado: cierre documental requiere visto bueno |
| [#45](https://github.com/jdlc86/CartaViva/pull/45) | `d87dd6ac0055` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#46](https://github.com/jdlc86/CartaViva/pull/46) | `a65b2a3275d4` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#47](https://github.com/jdlc86/CartaViva/pull/47) | `f5e7222809f0` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#48](https://github.com/jdlc86/CartaViva/pull/48) | `ead7633bd979` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#49](https://github.com/jdlc86/CartaViva/pull/49) | `e73857126f32` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#50](https://github.com/jdlc86/CartaViva/pull/50) | `79b85deb0399` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#51](https://github.com/jdlc86/CartaViva/pull/51) | `bd57464d7924` | ANCESTRO | Commit HEAD contenido en #54; candidato a reconciliación administrativa tras integración aprobada en rama destino y trazabilidad de contratos; NO cerrar ahora |
| [#52](https://github.com/jdlc86/CartaViva/pull/52) | `c602c923092a` | ANCESTRO ADMIN | Sus commits son ancestros de #54; falta revisión independiente formal del gobierno de escritura; no cerrar |
| [#53](https://github.com/jdlc86/CartaViva/pull/53) | `3c82ade9ecc8` | ANCESTRO CV-014 | Sus commits son ancestros de #54; conservar procedencia CV-014 y aceptación visual; no cerrar |
| [#54](https://github.com/jdlc86/CartaViva/pull/54) | `35de28d0cc32` | CANDIDATO S2/S3 | Mantener Draft sobre #53; pedir revisión independiente y autorización expresa para plan de integración, no merge a main |

## 4. Secuencia de decisión ejecutable solo bajo autorización

**Puerta documental A (listos para decisión administrativa, no para cierre automático):** #14/#31/#40/#44 con la preservación literal comprobada. Conservar documento original/versionado y advertencias que impiden tratar instrucciones antiguas como normativa. Si el propietario autoriza el cierre, registrar la motivación específica y enlazar el documento en el comentario de cierre; nunca añadir sus commits a `main` sin razón.

**Puerta técnica B (no cerrable ahora):** resolver el incumplimiento concreto de categorías dinámicas en la PWA de gestión relacionado con #5 como **hito completo**. No ampliar S4 a nuevas funcionalidades no normadas ni modificar estilo visual sin aprobación. Revisar a continuación los otros cuatro legados con el contrato y el E2E vigente, y revisar la familia H3 como cadena.

**Puerta de gobierno C:** revisión independiente de #52/#54 y conformidad del conjunto. Verificar estado de los 47 con base/HEAD en el mismo momento de decidir. Preparar estrategia de integración a `main` con historia de ancestros, conflictos y rollback, **sin ejecutar** ninguna fusión ni cierre hasta recibir autorización expresa. Las 31 ramas ancestrales ordinarias y #52/#53 deben conservarse abiertas hasta que su descendiente se integre válidamente en el destino o se documente un motivo alternativo de cierre con evidencia.

**Puertas independientes NO-GO:** aprobación visual humana F28/R09; Stripe sandbox real y economía M4; configuración M6 (logins, secretos, observabilidad, recuperación, rollback); RGPD/informes CV-013; aceptación piloto y producción. El CI verde de #54 no sustituye esas aprobaciones.

**Actualizaciones prohibidas en este expediente:** modificar `main`, cerrar o cambiar estado de PR, tocar Supabase operativo, VPS, contenedores de Fleetia u otros proyectos, secretos externos o desplegar Sabora. El código de producción sigue health-only. **Distinción:** código candidato integrado ≠ pruebas automatizadas superadas ≠ validación funcional humana ≠ autorización de fusión/producción.
