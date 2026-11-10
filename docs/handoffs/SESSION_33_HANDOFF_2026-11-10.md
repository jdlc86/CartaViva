# Sabora / CartaViva — continuidad operativa de la sesión 33 (2026-11-10)

> **DOCUMENTO DE CONTINUIDAD, NO NORMATIVA.** La fuente de verdad son los contratos normativos versionados en GitHub. Este documento no equivale a aceptación visual, revisión independiente, autorización para cerrar o fusionar PR, ni permiso de despliegue.
>
> **Tablero vivo obligatorio:** [SABORA_LIVE_PROJECT_TRACKER.md](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). **Matriz funcional/UI:** [FUNCTIONAL_UI_COVERAGE.json](../design/FUNCTIONAL_UI_COVERAGE.json). **Sesión anterior:** [continuidad 32](SESSION_32_HANDOFF_2026-11-09.md). **Plan vivo S1–S4:** [saneamiento sesión 32](../reviews/SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md). **Dictamen individual S4:** [47 PR](../reviews/SABORA_S32_S4_VERIFIED_PR_DISPOSITION_2026-11-10.md).
>
> **Seguimiento específico de sesión 33:** [SABORA_S33_S4_COMPLETION_EVIDENCE_2026-11-10.md](../reviews/SABORA_S33_S4_COMPLETION_EVIDENCE_2026-11-10.md) (creado y actualizado con hallazgos contrastados). No convertir propuestas en ejecución.

## 1. Punto de partida verificado (2026-11-10)

- **Repositorio exclusivo:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva); PR [#54 Draft](https://github.com/jdlc86/CartaViva/pull/54), rama `integration/sabora-s32-admin-waiter-sanitization-20261109`, base `feat/sabora-cv014-waiter-calls-integral-20261109` (#53), **no `main`**. HEAD antes del documento: `082f502f826bad114f2390c76c8f3f2d83e19e13`.
- Consulta GitHub directa: **47 PR abiertos y 47 Draft**; [#54 sin revisiones](https://github.com/jdlc86/CartaViva/pull/54), `main` en `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. Los datos son un corte, no una garantía futura.
- **S1:** genealogía comprobada; paridad histórica total de cinco familias de código (#4/#5/#8/#17/#22) no acreditada. **S2:** #52+#53 integrados en candidato aislado #54. **S3 ampliado:** 6/6 workflows GitHub Actions SUCCESS en el último SHA **funcional** `5c31354e2fcededa4e3a78a33c2582cde6f2f742`, incluidos PG17 desechable, JWT/HMAC, un Fastify común con titularidad ADMIN y llamada a camarero y dos PWA Chromium. El conjunto de todos los opt-in de `createM2RestaurantCandidate` no queda certificado.
- **S4:** existe dictamen motivado **47/47**, pero no se ha ejecutado ningún cierre, merge, retargeting, rebase o borrado de PR; ninguno se presume autorizado. Cuatro divergencias documentales (#14/#31/#40/#44) tienen preservación histórica verificada. Las ramas ancestrales de #54 **no están en `main`**.
- **Riesgo ya rectificado:** el selector de categorías fijo pertenece a `CatalogReadView` legado; no demostrar un fallo del M3 autenticado por la mera existencia de ese componente. M3 conectado usa categorías dinámicas. Falta comprobar evidencia efectiva end-to-end del requisito de categorías adicionales con identidad y permisos reales.
- **Puertas independientes NO-GO:** revisión independiente de #52/#54 (sin `APPROVED` de tercero), aceptación humana visual F28/R09, Stripe sandbox remoto M4, seguridad/operación/recuperación M6, CV-013 atribución y privacidad, reservas CV-014 sin política normativa completa, piloto y producción. **No desplegar** ni intervenir en Supabase operativo/VPS/Fleetia.

## 2. Objetivo de sesión 33: culminar la fase técnica verificable de saneamiento

1. **Evitar repetir S1–S3 ya superados:** reutilizar genealogía, logs CI, informe semántico y pruebas. Verificar deltas reales pendientes de #4/#5/#8/#17/#22 y cadena H3 (#18–#21) contra contratos y candidato #54; distinguir conservación de ruta de equivalencia funcional.
2. **M3 catálogo:** confirmar el circuito autenticado efectivamente montado, las categorías configurables, persistencia SQL, autorización, proyección y recorrido UI. Reutilizar pruebas integradoras reales; si falta evidencia, declarar límite y diseñar una única verificación integrada representativa, no micropruebas.
3. **S4 administrativo:** actualizar expediente de disposiciones 47/47 solo con resultados verificados y emitir una **propuesta concreta y reversible** de acciones, dejando separados casos documentales, candidatos ancestrales, divergentes y #54. **No ejecutar cierres o fusiones de PR** sin autorización expresa específica.
4. **Gobierno de integración:** preparar revisión independiente y decisión explícita para `main`, incluida estrategia de rollback y cuidado con la rama no protegida, sin modificar protección ni desplegar.
5. Al cerrar **hitos significativos**, actualizar esta continuidad, el expediente S33 y el tablero vivo; registrar SHA y evidencia exacta, sin imputar CI a commits `[skip ci]`.

## 3. Normativa obligatoria y límites

- [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [contrato de diseño](../DESIGN_SYSTEM_CONTRACT.md), [auditoría visual](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [matriz funcional/UI](../design/FUNCTIONAL_UI_COVERAGE.json).
- [Contrato ROOT/ADMIN escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md) y [operación de titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md): solicitud al titular actual resuelta por servidor; no inventar selección de destinatario.
- **Un restaurante Sabora.** Dos PWA independientes. Bloques funcionales completos y pruebas integradoras; focales solo para diagnóstico o un requisito crítico.
- No tocar recursos ajenos: **Fleetia es independiente**, incluso cuando comparte VPS. Ningún despliegue, reinicio, parada, borrado o migración operativa por inferencia de esta continuidad.
- Distinguir `implementado`, `probado`, `validado por persona independiente` y `autorizado para producción` en todos los informes.

## 4. Registro vivo de hitos sesión 33

**Apertura documental:** sesión 33 creada sobre la misma rama de trabajo del PR #54 para evitar multiplicar PR. En este punto no hay cambios funcionales ni nuevas pruebas. Estado S4: **en análisis, sin actuaciones administrativas autorizadas**.

_Añadir aquí solo cierres de hitos con evidencia verificable. No sobrescribir el estado histórico de sesión 32._

## 5. Hito S33-1 — investigación de paridad y preparación S4 registrada (10-11-2026)

**Informe de evidencia publicado:** [SABORA_S33_S4_COMPLETION_EVIDENCE_2026-11-10.md](../reviews/SABORA_S33_S4_COMPLETION_EVIDENCE_2026-11-10.md); [tablero vivo §67](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) actualizado. No se repitieron 47 auditorías ni la batería 6/6, ya acreditadas en el alcance de S32.

**Resultados contrastados:** 47 PR abiertos/47 Draft, #54 base #53, `main` sin avanzar. M3 autenticado está enrutado al editor dinámico y SQL `catalog_categories_m3`, no al lector legado de whitelist fija; las suites PG17/Chromium revisadas no demuestran un único circuito integral de publicación de categoría adicional con autorización ADMIN hasta cliente e histórico. La variante H3 local dispone de `basketLineKey` y tests de precio/edición, sin que ello certifique toda la equivalencia histórica. Los cuatro PR documentales #14/#31/#40/#44 tienen conservación ya demostrada en S32 y quedan **listos para solicitar una decisión explícita**; no se cerraron.

**Riesgo Git cuantificado ahora:** comparación `main…#54` devuelve **4293 commits ahead, 0 behind**, con merge-base = HEAD de `main` `42b46358a76162445fa9e0b20e7b87dd0a640b5b`, y la API limita su listado a **300 archivos**. Ninguna fusión debe usar ese recorte como auditoría completa del árbol. Necesario un plan autorizado con inventario exhaustivo, rollback y revisión independiente.

**Cambios efectivos S33:** archivos documentales y enlace en tablero dentro de la rama del PR #54; **ningún cambio funcional, nueva CI, merge, cierre de PR ni despliegue**. Último SHA funcional realmente probado mantiene `5c31354e`, 6/6 GitHub Actions de sesión 32. **S4 administración sigue NO FINALIZADA**, con gates de normativa, revisión independiente, autorización de PR y producción separados.

**Próxima intervención razonable:** cerrar la brecha de evidencia M3 como **un recorrido integrado único** si no hay aceptación ya existente equivalente, evaluar las cinco familias históricas conforme al expediente S33 y obtener revisión independiente y autorización explícita antes de ejecutar el tratamiento de PR. No reabrir cuestiones técnicas resueltas por inercia ni inventar políticas.

## 6. Hito S33-2 — test integrador de catálogo M3 añadido; resultado CI aún pendiente (10-11-2026)

**Cambio funcional de pruebas (sin alterar código de producto):** commit `d568e8c5c6fc6f7557f602b88ed0e8c432b29c83` en la rama del PR #54. Amplía el **harness PG17 ya existente** `scripts/ci/m3-management-postgres17.test.mjs` con un recorrido de categorías dinámicas: ADMIN titular firmado/rol SQL mínimo, rechazos a camarero y ADMIN no titular, categoría ESPECIALES, guardado/publicación real de un plato, lectura pública, ocultar/restaurar/reordenar, replay/idempotencia y auditoría. Se prueba el requisito crítico sin depender del Supabase operativo.

**Estado de prueba al registrarlo:** seis GitHub Actions del SHA `d568e8c5` iniciadas. [Bootstrap #42778149335](https://github.com/jdlc86/CartaViva/actions/runs/42778149335), [H6 #42778149625](https://github.com/jdlc86/CartaViva/actions/runs/42778149625), [cliente #42778149337](https://github.com/jdlc86/CartaViva/actions/runs/42778149337), [gestión #42778149256](https://github.com/jdlc86/CartaViva/actions/runs/42778149256), [PWA #42778149579](https://github.com/jdlc86/CartaViva/actions/runs/42778149579), [UI #42778149302](https://github.com/jdlc86/CartaViva/actions/runs/42778149302). **No declarar PASS integral todavía**. La prueba nueva integra PG17/rol/capacidad y lector SQL público, **no** sustituye la aceptación de una cadena completa HTTP/Chromium ADMIN→cliente, F28/R09 ni la validación humana. El anterior 6/6 sobre `5c31354e` permanece histórico y no debe atribuirse al nuevo SHA.

**Gobierno sin cambios:** no cerrar ni fusionar PR; `main`, Supabase operativo, VPS y Fleetia intactos. Cualquier fallo del CI se debe diagnosticar causalmente y corregir antes de actualizar el estado, sin rebajar aserciones.
