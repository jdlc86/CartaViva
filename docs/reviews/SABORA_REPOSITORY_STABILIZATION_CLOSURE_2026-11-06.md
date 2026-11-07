# Sabora / CartaViva — dictamen de estabilización técnica para reabrir la matriz F/R (06-11-2026)

**Clasificación:** informe de aceptación y decisión de trabajo, **NO normativo**. Documento subordinado al [contrato funcional](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [diseño aprobado](../DESIGN_SYSTEM_CONTRACT.md), [matriz H6](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) y [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). El alcance es **la estabilización del candidato de desarrollo**, no la aceptación completa del producto, la conciliación final de la historia Git ni la autorización para integrar/desplegar.

## 1. Decisión y frontera explícita de cierre

**PUERTA TÉCNICA PARA RETOMAR LA MATRIZ: SUPERADA CON ALCANCE DELIMITADO.** Están resueltos los conflictos de base de PR #49, recuperados los workflows y ejecutada la batería integradora actual, sin introducir regresiones detectadas en los flujos observados. Las ramas históricas se han inventariado y clasificado; hay evidencias de preservación de pruebas y rutas, pero **no** se ha demostrado equivalencia semántica total entre los 13 HEAD divergentes y el candidato. Esa limitación NO se oculta, ni se usará como excusa para abandonar la matriz o restaurar funcionalidades obsoletas.

**NO SE DECLARA CERRADO:** CV-004 en su obligación de reconciliación definitiva de PR, los 42 PR Draft, F01–F28/R01–R10 de forma global, conformidad visual humana, caja/Stripe sandbox, arranque operativo, seguridad y recuperación M6, ni preparación de `main` para integrar. La decisión permite **reanudar trabajo en la matriz sobre un candidato Git y CI estable**, asignando los requisitos funcionales que faltan a sus hitos propios. Producción **NO-GO**.

## 2. Prueba independiente de la línea candidata y límites de ejecución

**Referencia de código:** PR [#49](https://github.com/jdlc86/CartaViva/pull/49), rama `feat/sabora-cv012-independent-pwas-20261106`, SHA **`0402e63a82c23e80470f59f0da2bc39fd5aa43c0`**, observado `Draft / mergeable=true / clean`. La comparación Git entre SHA funcional anterior `380a4777cad82ee359cc487b58a9f030b62596c3` y `0402e63a` da **9 commits posteriores y únicamente 9 rutas documentales**; ningún archivo de aplicación, SQL, test, workflow ni despliegue ha variado en ese intervalo.

Se examinaron **los logs reales** de estas cinco ejecuciones correspondientes al **mismo SHA `0402e63a`**:

| Puerta | Evidencia comprobada y alcance |
| --- | --- |
| [Sabora CI H6 #42284967581](https://github.com/jdlc86/CartaViva/actions/runs/42284967581) | **SUCCESS**, bloques H6 1/2A/2B (contratos, migraciones y privilegios PG17 efímeros; HMAC, concurrencia y Chromium E2E). Incluye compilación, aislamiento y comprobaciones de contenedor `health-only`. |
| [Bootstrap PG17 #42284967612](https://github.com/jdlc86/CartaViva/actions/runs/42284967612) | **SUCCESS**: **1.349/1.349 Node (0 fallos, 0 SKIP)**; **51/51 PG17**, **4/4 coste cero (0 SKIP)**; las pruebas adicionales de seguridad, identidad, roles, migraciones y preflight aparecen separadas en los logs. |
| [Cliente Chromium #42284967849](https://github.com/jdlc86/CartaViva/actions/runs/42284967849) | **SUCCESS: 36/36 escenarios** con viewports 390/1440; catálogo, H3 revisión de selección, QR/revocación, incidencias, H6 pago posterior simulado, SSE, idempotencia y recuperación. **La suite de cliente usa fixtures HTTP; no equivale por sí sola a PG17 real.** |
| [Gestión Chromium #42284967661](https://github.com/jdlc86/CartaViva/actions/runs/42284967661) | **SUCCESS:** cocina, camarero, recogida, `Cancelo`, recuperación, aislamiento de rol y cierre de sesión; **smoke con fixture HTTP aislado**, más capturas de distintas anchuras. |
| [CV-012 PWA #42284967631](https://github.com/jdlc86/CartaViva/actions/runs/42284967631) | **SUCCESS:** dos scopes instalables, cachés públicas acotadas, offline/online, SW y separación de almacenamiento. **No certifica instalación humana en Android/iOS.** |

**Contraste integrador que sí cruza las fronteras reales:** la prueba 49 del Bootstrap, `PG17 B3 six isolated logins complete PWA customer A to waiter to economic B journey`, ha pasado dentro del **51/51**. Su código enlaza **PostgreSQL 17 desechable + Fastify + PWA real de gestión en Chromium + PWA real del cliente en Chromium**, JWT/roles SQL distintos, decisión de camarero, negativa a cocina, reanudación SSE, concesión A→B y preservación de saldo/cuenta; la presentación pública de catálogo es **un fixture aislado declarado**. La suite también prueba cierre económico, permisos de gestión por rol y fallos recuperables. Esta ejecución *representativa* no prueba todos los contratos F/R ni todos los historiales antiguos.

**No se ha añadido ninguna microprueba ni inventado una nueva ejecución:** la revisión independiente consiste en contrastar directamente los **cinco jobs reales, sus logs y el código del caso 49**. Los resultados anteriores corresponden a `0402e63a`. Cualquier commit de documentación posterior debe verificarse por separado o explicitarse como cambio solo documental.

## 3. Conciliación de los 42 PR: plan de resolución, NO cierres

[Inventario del grafo](SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md) y [conciliación de 13 divergencias](SABORA_HISTORICAL_FUNCTIONAL_RECONCILIATION_2026-11-06.md). En el instante de auditoría: **42 PR abiertos y Draft**; **28 HEAD ancestrales** del candidato, **13 divergentes**, y **#49** como línea candidata. Clasificación y propuesta para una decisión de integración **posterior e independiente**:

| Grupo | PR y tratamiento propuesto | Condición antes de una acción irreversible |
| --- | --- | --- |
| Cadena ancestral | **28 PR ancestrales**, incluidos el histórico #48 ya incorporado como ancestro de #49 | **Mantener Draft** hasta decisión de integración; documentar reemplazo/supersesión con SHA antes de cerrar uno a uno. No convertir ancestralidad en aceptación funcional. |
| Divergencias documentales | **#14, #31, #40, #44**: documentos/encargos históricos preservados y clasificados | **Candidatos a cierre por supersesión**, sujeto a revisión del propietario; no restaurar estados antiguos del tablero. |
| Cadena H3 intermedia | **#18, #19, #20, #21** son ancestros del HEAD histórico **#22** | **Candidatos a supersesión por #22** tras verificar trazabilidad y aceptación H3 del requisito vigente; no contarlos como cuatro implementaciones independientes. |
| Divergencias funcionales | **#4, #5, #8, #17, #22**: cocina/sala, gestión, actor SQL/HMAC, validación HTTP y cesta | **Mantener bajo revisión** hasta aceptar sus diferencias significativas frente a la normativa y cubrir las lagunas en la matriz. No cherry-pick automático ni restablecer permisos antiguos. |
| Candidato | **#49** sobre #48 | Mantener Draft, sin merge a `main`, hasta la autorización específica y las puertas de integración posteriores. |

**Una ruta conservada, un test con el mismo título o un CI verde no garantizan la equivalencia completa de las ramas.** Lo aprobado aquí es la **estabilidad observada del candidato y un plan de saneamiento**, no la resolución administrativa final de los 42 PR ni la aceptación de todo su comportamiento legado.

## 4. Riesgos conocidos correctamente trasladados a la matriz

- **H3 personalización de cesta:** [RF «configuración única del plato y edición desde el carrito»](../REQUISITOS_FUNCIONALES.md) exige líneas distintas del mismo plato para distintas configuraciones. En `apps/client/src/client-state.ts`, `configureBasketLine`, `changeBasket`, `removeBasketLine` y `acceptBasketPrice` operan por `itemId`; **incumplimiento confirmado**, **NO** pérdida probada de #22. Debe resolverse en un **hito completo** (modelo + persistencia + vista + servidor + precio + integración), no mediante pruebas diminutas.
- **H6/F/R:** M1/CV-001/CV-003 no se cierran por esta revisión. F20/R03–R05 siguen limitados por **Stripe sandbox real y caja**. F28/R09 continúan condicionados por **aprobación visual humana**.
- **F12/R08:** el corte H3–H6 mediante roles/SQL aislados y confirmación A→B **sí** se probó en M2 opt-in y PG17 real; `server.mjs` sigue `health-only`, por tanto **montaje operacional NO autorizado**.
- **R10/coste cero:** los **4/4 en el mismo `0402e63a`** ya están acreditados, a diferencia de los dictámenes históricos basados en SHA previos. Candidato técnico de invariantes, no cierre integral de caja/ocupación en entorno real.
- **UI y dispositivos:** capturas automáticas, pruebas de accesibilidad y scopes PWA no constituyen aceptación visual humana ni ensayo físico de instalación.
- **Seguridad y operación:** sin despliegue, migración al Supabase operativo, Stripe real, secretos productivos, operaciones en VPS ni Fleetia.

## 5. Puerta de salida y siguiente hito autorizado de desarrollo

**Resultado:** `ESTABILIZACIÓN_TÉCNICA_DE_CANDIDATO = CERRADA_EN_ALCANCE` para **volver a ejecutar la matriz F01–F28/R01–R10**, sin aceptar filas por acumulación de pruebas. `RECONCILIACIÓN_ADMINISTRATIVA_DE_PR = PENDIENTE`; `ACEPTACIÓN_PRODUCTO = PENDIENTE`; `MERGE_MAIN = NO_AUTORIZADO`; `PRODUCCIÓN = NO-GO`.

**Secuencia:** (1) actualizar la lectura de evidencias de la [matriz §39](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), sustituyendo explícitamente referencias desfasadas pero no cambiando los requisitos; (2) agrupar los pendientes en **hitos integrales** de aceptación H6/roles/UX, caja-Stripe y conformidad visual, sin micropruebas como metodología; (3) resolver el contrato RF de personalizaciones completas; (4) solo después preparar un expediente de resolución de PR y una propuesta de integración que **requieran nueva autorización**.

**No se ha ejecutado ninguna operación en Fleetia, VPS compartido, Supabase operativo, despliegue, proveedor de pagos ni `main`.**
