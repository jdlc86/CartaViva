# Sabora — S34: aceptación conectada M3→H3→H4 con PostgreSQL 17 / Fastify / dos PWA (10-11-2026)

> **EVIDENCIA DE PRUEBA AUTOMÁTICA, NO NORMA, REVISIÓN INDEPENDIENTE NI AUTORIZACIÓN PARA CERRAR PR O DESPLEGAR.** [Continuidad 34](../handoffs/SESSION_34_HANDOFF_2026-11-10.md) · [dictamen 9 divergentes](SABORA_S34_NINE_DIVERGENT_FUNCTIONAL_RECONCILIATION_2026-11-10.md) · [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [PR #54 Draft](https://github.com/jdlc86/CartaViva/pull/54).

## 1. Alcance integrado implementado, sin alterar el producto

Se **amplió una sola prueba integradora existente**: [`scripts/ci/customer-production-postgres17.test.mjs`](../../scripts/ci/customer-production-postgres17.test.mjs). El archivo es un escenario conectado que ya arrancaba PostgreSQL 17 desechable, API Fastify, la PWA cliente y la de gestión en Chromium, comprobando identidades H3, QR, cotización/confirmación y cocina H4, además de escenarios de regresión. No se duplicó una batería focalizada ni se modificaron los Service Workers, la lógica de producto, las migraciones SQL o la infraestructura operativa.

**Nuevo bloque S34** dentro del mismo recorrido: siete logins SQL limitados y diferentes, autorización JWT de personal y HMAC SQL, publicación efectiva de una categoría adicional y un plato desde la **PWA de gestión** con ADMIN titular; rechazo de mutación a camarero; separación entre borrador y publicación; HTTP público real proyectando el plato y sus opciones; **PWA cliente** consumiendo esa respuesta sobre el mismo Fastify/PG17; dos configuraciones del mismo plato (Suave/Picante) independientes; ADMIN cambiando el precio y repúblicandolo **después de seleccionar**; consentimiento explícito de la nueva tarifa **por cada línea**, sin cambiar silenciosamente la otra variante; cotización de dos partidas, pedido confirmado por HTTP, instantáneas económicas persistidas, replay idempotente sin duplicados; dos líneas diferenciadas y accionables en cocina. Mantiene aserciones visuales técnicas móviles/escritorio y axe de Chromium, **no aceptación humana F28/R09**.

Composición **CI-only**: la misma instancia Fastify registra rutas reales H3/H4 y M3 catálogo; las rutas M3 **de mesas** se aíslan mediante repositorios que fallan cerrados en este harness específico, y siguen verificadas aparte con PG17. No se debe describir este montaje como arranque completo `createM3RestaurantCandidate` H3–H6 ni como Stripe sandbox remoto.

## 2. Investigación del fallo y corrección del test

- Commit [`ff7d68bd431eac707a83bb729fc23e164ec5b92e`](https://github.com/jdlc86/CartaViva/commit/ff7d68bd431eac707a83bb729fc23e164ec5b92e): primera composición real M3→H3, categoría y producto **publicados correctamente** mediante PWA/SQL y verificados por HTTP. [Bootstrap #42819553040](https://github.com/jdlc86/CartaViva/actions/runs/42819553040) y [H6 #42819553152](https://github.com/jdlc86/CartaViva/actions/runs/42819553152) terminaron FAILURE por la misma aserción del test H3: esperaba IDs históricos `sauce`/`suave`/`picante`, mientras el editor real genera IDs a partir de los nombres. **No hay evidencia de defecto de catálogo en esa incidencia; no se debilitaron aserciones.**
- Commit [`782974063bebe39fd423363eb2f806bc6b8acef9`](https://github.com/jdlc86/CartaViva/commit/782974063bebe39fd423363eb2f806bc6b8acef9): el test ahora toma grupo y opciones desde la publicación HTTP **autoritativa** y comprueba esas identidades hasta las selecciones, cotización, pedido y evidencia económica SQL. Se añaden las comprobaciones de aceptación de nuevo precio individual por variante (14→15 EUR) y cantidades 2+1 sin colapsar la cesta. La integridad no se reduce.
- [Cliente Chromium #42820426047](https://github.com/jdlc86/CartaViva/actions/runs/42820426047) sobre `78297406` inicialmente agotó el límite **durante la instalación** aislada de Chromium (exit 124, sin empezar pruebas). Se repitió **solo ese job**, sin aumentar timeout ni cambiar la prueba: el intento 2 finalizó **SUCCESS**. No extrapolar esto a ausencia total de flakiness futura.

## 3. Evidencia de ejecución, cortada al SHA exacto `78297406`

| Workflow | Ejecución | Resultado contrastado |
| --- | --- | --- |
| Bootstrap PG17 — ejecuta nueva M3→H3→H4 | [#42820426039](https://github.com/jdlc86/CartaViva/actions/runs/42820426039) | **SUCCESS**; el E2E conectado `real PG17 and Chromium complete the restricted H3/H4 full-stack flow` informa **1/1 PASS** y la publicación M3 se registra PASS |
| Cliente Chromium | [#42820426047](https://github.com/jdlc86/CartaViva/actions/runs/42820426047) | **SUCCESS** en repetición puntual del job tras timeout de instalación del primer intento |
| Gestión Chromium | [#42820426063](https://github.com/jdlc86/CartaViva/actions/runs/42820426063) | **SUCCESS** |
| Instalación independiente CV-012 | [#42820425999](https://github.com/jdlc86/CartaViva/actions/runs/42820425999) | **SUCCESS** |
| Cobertura funcional/UI | [#42820426019](https://github.com/jdlc86/CartaViva/actions/runs/42820426019) | **SUCCESS** |
| H6 consolidado | [#42820425977](https://github.com/jdlc86/CartaViva/actions/runs/42820425977) | **SUCCESS**: Block 1 contratos/servicio; Block 2A PG17/migraciones/privilegios; Block 2B PG17 real/HMAC/concurrencia/Chromium |

**Prueba integrada M3→cliente y persistencia = PASS dentro del alcance de Bootstrap**; **ronda total = 6/6 workflows `completed/success` en el SHA exacto `782974063bebe39fd423363eb2f806bc6b8acef9`**, con repetición puntual del job de cliente después del timeout inicial de instalación Chromium. El SHA funcional previo `b1419e86` fue una validación histórica de sesión 33, pero no sustituye el recorrido nuevo.

## 4. Puertas que permanecen abiertas, independientemente de la CI

- Evaluación semántica y **revisión independiente** de los nueve PR divergentes #4/#5/#8/#17/#18–#22 y del candidato #54. Esta aceptación conectada cierra una brecha específica de **evidencia M3→H3/H4**, no la equivalencia global de todas las ramas.
- Aceptación humana frente al estilo visual aprobado F28/R09; los screenshots/axe son evidencia técnica, no aprobación visual del propietario.
- Recorrido total M2/M3/H3–H6 con todos los opt-ins de la composición final, Stripe sandbox M4 remoto, M6 operación/seguridad/recuperación, CV-013 privacidad, reservas CV-014 pendientes de contrato, piloto y producción.
- **43 PR Draft abiertos en el último corte**; no se cerró/fusionó ninguno durante S34. `main` permanece fuera del alcance; ninguna migración en Supabase operativo, ningún VPS, ningún contenedor Fleetia ni despliegue.

_Este documento se debe actualizar solo tras comprobar una nueva conclusión de workflow o un hito real, sin atribuir CI a commits documentales `[skip ci]`._

## 5. Cierre final de S34-2 — 6/6 GitHub Actions verificados el 10-11-2026

**Reconsulta exacta de los seis workflow runs sobre `782974063bebe39fd423363eb2f806bc6b8acef9`: todos `completed/success`.** El job [H6 #42820425977](https://github.com/jdlc86/CartaViva/actions/runs/42820425977), `129844276056`, emite en sus logs los tres hitos explícitos: `[H6] PASS Block 1: normative, contract and service tests`; `PASS Block 2A: isolated PostgreSQL 17 migration and privilege gates`; `PASS Block 2B: real PostgreSQL 17, HMAC, concurrency and Chromium E2E`. [Bootstrap PG17 #42820426039](https://github.com/jdlc86/CartaViva/actions/runs/42820426039), job `129844276686`, contiene `# S34 M3 owner PWA -> restricted PG17 -> public HTTP publication PASS`, seguido del subtest H3/H4 conectado **1/1 PASS**. Los otros cuatro workflows concluyeron correctamente en el mismo SHA; el job cliente fue correcto en el segundo intento, tras agotar 180 s instalando Chromium en el primero.

**Resultado cerrado exclusivamente en automatización:** se ha demostrado una ruta integrada concreta **ADMIN titular → gestión Chromium → Fastify / capability SQL / PG17 desechable → publicación HTTP → cliente Chromium (dos variantes + consentimiento por línea tras cambio de precio) → cotización/confirmación → evidencia económica e idempotencia → cocina H4**. Se mantienen los controles originales de accesibilidad y tamaños responsivos del mismo test. La integración corresponde al harness restringido H3/H4+M3 catálogo y **no** al runtime completo H3–H6 ni a dispositivos físicos.

**Gobierno final revalidado:** [PR #54](https://github.com/jdlc86/CartaViva/pull/54) sigue Draft, sin reviews; **43 PR abiertos y todos Draft**; `main` en `42b46358a76162445fa9e0b20e7b87dd0a640b5b`. El saneamiento administrativo S4, la equivalencia semántica y revisión independiente de las ramas históricas, la aceptación visual humana F28/R09, Stripe remoto M4, M6 y el resto de puertas operativas siguen **NO-GO**. **Sin merge, cierre de PR, despliegue, operación Supabase productivo, VPS ni Fleetia**. Los commits documentales `[skip ci]` posteriores no tienen batería propia y no se acreditan como probados por inferencia.
