# Sabora / CartaViva — continuidad operativa de la sesión 32 (2026-11-09)

> **DOCUMENTO DE CONTINUIDAD Y CONTEXTO. NO ES NORMATIVA, APROBACIÓN DE CÓDIGO, ACEPTACIÓN VISUAL NI AUTORIZACIÓN DE PRODUCCIÓN.** Los contratos normativos versionados del repositorio prevalecen ante discrepancias. Esta continuidad relata un corte temporal contrastado en GitHub; una ejecución CI acredita únicamente el commit y escenario probados.
>
> **Tablero vivo obligatorio:** [SABORA_LIVE_PROJECT_TRACKER.md](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), especialmente §§55–59. **Matriz funcional ↔ PWA:** [FUNCTIONAL_UI_COVERAGE.json](../design/FUNCTIONAL_UI_COVERAGE.json). **Continuidad previa histórica (PR #52, otra rama):** [sesión 31](https://github.com/jdlc86/CartaViva/blob/feat/sabora-admin-ownership-end-to-end-20261108/docs/handoffs/SESSION_31_HANDOFF_2026-11-08.md). La sesión 31 no está en la rama de PR #53 porque esta se creó directamente desde la base del PR #51; no fusionar ramas para copiar la continuidad.
> **Plan específico de saneamiento del repositorio (solo sesión 32):** [SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md](../reviews/SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md). Censo de 46 PR, conflictos, topología, pruebas y plan S1–S4; no confundir la publicación del plan con una consolidación ya ejecutada.

## 1. Estado vigente y rama de trabajo

- Repositorio único autorizado: [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva).
- **Hito recién cerrado en automatización aislada:** [PR #53 — CV-014 llamada al camarero](https://github.com/jdlc86/CartaViva/pull/53), rama `feat/sabora-cv014-waiter-calls-integral-20261109`, base `feat/sabora-cv014-communications-full-flow-20261108` del PR #51. PR **abierto Draft, sin merge ni despliegue**.
- **Último commit de código funcional efectivamente probado:** [`92f8482afdcb034e853edb9f49351cc91882e843`](https://github.com/jdlc86/CartaViva/commit/92f8482afdcb034e853edb9f49351cc91882e843); **6/6 GitHub Actions `completed/success` sobre ese SHA**. El HEAD de la rama antes de crear esta continuidad era `92dc6adcf161004a759013c2b844ea35b3dcc996`. Comparación entre ambos: solo `docs/tracking/SABORA_LIVE_PROJECT_TRACKER.md` cambió en dos commits; no hay otro código funcional posterior observado. Este documento y su enlace en el tablero serán commits **`[skip ci]` documentales**, no nuevas pruebas.
- **[PR #52 — titularidad ADMIN](https://github.com/jdlc86/CartaViva/pull/52)** sigue **Draft sin merge** en una rama paralela; 6/6 en su propio SHA funcional `12c2371e`, cuarta revisión técnica `COMMENTED` [#5820453799](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5820453799). Falta revisión **independiente de Codex**, por falta de créditos, y autorización expresa antes de fusión o despliegue. **No repetir una falsa revisión independiente desde la misma cuenta.**
- **[PR #51 — comunicaciones](https://github.com/jdlc86/CartaViva/pull/51)** también Draft. No confundir el nuevo hito de llamadas de #53 con la aprobación externa de #51 ni #52.

## 2. Qué ha quedado implementado en el PR #53

**Llamada a sala aprobada normativamente:** desde la PWA de cliente sin motivo, un aviso pendiente por **mesa y ocupación vigente** incluso si la mesa está pausada o el permiso para pedir ha caducado; un camarero autorizado lo marca **atendido**. La llamada no produce pedido, deuda ni pago.

- Migración candidata **forward-only** `supabase/migrations/20261109020000_sabora_waiter_calls_integral_candidate.sql`: recibos de llamada por mesa/ocupación, índice de unicidad para una pendiente, auditoría de transiciones inmutable, outbox H6 durable, RLS `FORCE`, roles NOLOGIN aislados y funciones exactas para cliente/personal.
- `apps/api/src/waiter-call-candidate.mjs`: verificación de cookie HttpOnly y visita actual para cliente, JWT y rol del personal verificado, firma HMAC ligada a login técnico, operación y caducidad, transacciones de privilegios mínimos; rechazo por ausencia de sesión, mesa o rol. Integración **opt-in** en `m2-restaurant-candidate.mjs`, con preflight de roles/login. **No se declara que esté activado en producción ni en el servidor de salud.**
- PWA cliente: botón «Llamar al camarero», estado pendiente y consulta sin motivo. Gestión/sala: llamadas pendientes compartidas y «Marcar atendida», con proyección por evento H6 y aviso persistente en la pantalla, sin sondeo periódico de API/BD. El requisito normativo de recordatorios hasta atenderse debe contrastarse con el alcance concreto de avisos/push en la matriz, **sin convertir la mera persistencia visual en una certificación de push periódico**.
- Caso integral `scripts/ci/waiter-calls-postgres17.test.mjs`: PostgreSQL 17 desechable, cookie/JWT/HMAC/Fastify, intento no autorizado, mesa pausada y permiso de pedido vencido, dos comensales concurrentes sin duplicado, dos camareros concurrentes con una única transición de atención, auditoría y outbox, recorrido PWA cliente + PWA gestión en Chromium. **El QR preparatorio es un fixture CI**, no certifica operación de QR real en piloto, instalación productiva ni validación humana.

## 3. Evidencia reproducible de la cadena 6/6 (SHA funcional 92f8482a)

| Ejecución | Estado comprobado |
| --- | --- |
| [Bootstrap PG17 + Node driver #42596201622](https://github.com/jdlc86/CartaViva/actions/runs/42596201622) | **SUCCESS**; migración real en PG17 aislado. Log job #129089326300: llamada al camarero integral `1/1 PASS, 0 FAIL`; anuncios CV-014 en Chromium y PG17 también `1/1 PASS, 0 FAIL`. |
| [H6 consolidado #42596201815](https://github.com/jdlc86/CartaViva/actions/runs/42596201815) | **SUCCESS**; job #129089326478: `PASS Block 1`, `PASS Block 2A`, `PASS Block 2B`, incluidos migración, permisos, concurrencia y Chromium. |
| [Chromium cliente #42596201538](https://github.com/jdlc86/CartaViva/actions/runs/42596201538) | **SUCCESS** |
| [Chromium gestión #42596201526](https://github.com/jdlc86/CartaViva/actions/runs/42596201526) | **SUCCESS** |
| [CV-012 instalación e independencia de dos PWA #42596201429](https://github.com/jdlc86/CartaViva/actions/runs/42596201429) | **SUCCESS**; verifica ámbitos, cachés públicas acotadas, protección de información privada, navegación offline/online y separación de orígenes. |
| [Cobertura funcional/UI #42596201893](https://github.com/jdlc86/CartaViva/actions/runs/42596201893) | **SUCCESS** para cobertura funcional automatizada; **NO es aceptación visual humana final** F28/R09. |

**Reparaciones causales en el mismo bloque integral:**

1. **CV-012:** `66ae8a7a` hizo esperar a que el service worker esté realmente en estado `activated` y sea el script del ámbito correcto antes de recargar. El test original sigue exigiendo `navigator.serviceWorker.controller`, offline, aislamiento y ausencia de datos privados en cachés; no se aumentaron timeouts ni eliminaron aserciones.
2. **H6/CV-014 anuncios:** el test de Chromium invocaba «Negrita» sin fijar el cursor tras `.fill()`, que podía envolver una selección en lugar de insertar la palabra de prueba. En `92f8482a` el E2E fija el cursor y comprueba `**negrita**` **en editor, borrador PostgreSQL, contenido publicado y DOM cliente**. No se han relajado las aserciones originales. El error transitorio por variable local duplicada en iteración anterior quedó corregido antes del SHA probado.

**Distinción obligatoria:** «implementado» no implica «probado»; «probado con PG17/Fastify/Chromium» no implica «aprobación independiente de Codex», «validación visual humana», «piloto con usuarios» ni «GO de producción».

## 4. Documentación normativa que prevalece

Consultar **antes** de diseñar o implementar, sin inferir políticas desde este documento:

- [Requisitos funcionales](../REQUISITOS_FUNCIONALES.md), en especial **Sala / llamada al camarero**, y [contrato consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md) para pausas, permisos vencidos, QR/visita/ocupación, pedidos, cuenta y eventos. Un Sabora = **un restaurante**.
- [Sistema visual aprobado](../DESIGN_SYSTEM_CONTRACT.md), [auditoría visual aprobada](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [requisitos de diseño](../design/DESIGN_REQUIREMENTS_V1.md) y [matriz funcional↔UI](../design/FUNCTIONAL_UI_COVERAGE.json). Mantener la banda de anuncios y los flujos visuales aprobados.
- [Contrato ROOT/ADMIN escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [titularidad](../security/ADMIN_WRITE_OWNERSHIP_V1.md), [operaciones de titularidad](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md), [matriz administrativa](../security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md) y [contrato SQL](../security/SABORA_SQL_ADMIN_IDENTITY_CONTRACT.md). Al solicitar titularidad ADMIN **el servidor resuelve automáticamente el destinatario**.
- [Hoja de ruta e infraestructura](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [dos PWA independientes](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md) y [aislamiento de Fleetia](../security/CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md).

## 5. Siguiente hito: retomar la matriz viva de requisitos

Tras el cierre automatizado del PR #53, la instrucción acordada es **continuar la matriz viva**: contrastar cada ID con su contrato normativo, código real y evidencia, clasificar IMPLEMENTADO / PROBADO / VALIDADO / NO-GO, y elegir **un hito integral** por dependencia y valor, no una cadena de microcorrecciones.

**No inventar funcionalidad de reservas:** CV-014 reserva anticipada de platos **NO IMPLEMENTADA** porque las normas dejan decisiones esenciales abiertas (fecha/hora prevista, antelación, límites, caducidad/no uso, cancelación, asignación e interacciones con disponibilidad). Reservar no equivale a pedir ni generar deuda. No convertir esos huecos en política desde la continuidad.

Revisar con la matriz **CV-013 informes/exportaciones**, **M4 Stripe en test real**, **M6 operación/recuperación**, **F28/R09 aceptación humana de la estética y flujos**, **CV-015 Gemini**, **CV-016 directorio** y los demás requisitos pendientes. Identificar requisitos ya implementados para evitar duplicar trabajo; mantener las puertas por dependencia. Los PRs #50–#53 no están autorizados para fusión por este registro.

## 6. Límites de ejecución y forma de cerrar hitos

- **No tocar Fleetia ni sus contenedores ni recursos**. El VPS es compartido: no desplegar, reiniciar, borrar o depender de nada de Fleetia; ninguna actuación sobre VPS, secretos o Supabase operativo sin autorización expresa y aislamiento completo.
- **No fusionar** PRs, aplicar migraciones operativas ni declarar GO; Draft no es aprobación. Codex pendiente de créditos para revisión independiente del PR #52; cualquier revisión autora es `COMMENTED`, no `APPROVE`.
- En desarrollo: comprobar contratos normativos y código existente, implementar el bloque funcional completo, ejecutar PostgreSQL 17 real desechable + HTTP/JWT/HMAC + ambas PWA Chromium y regresiones, inspeccionar logs y solo entonces documentar el hito. Pruebas aisladas únicamente para diagnóstico focal o requisito crítico, no como metodología de avance.
- Actualizar **[tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md)** y esta continuidad cuando aparezca un hito, fallo importante o decisión normativa. **No actualizar estados transitorios como si fueran validaciones definitivas**. Preservar los enlaces del tablero en toda futura continuidad.

**Punto exacto del relevo:** PR #53, código `92f8482a` comprobado 6/6, nuevos commits posteriores documentales; próxima intervención: auditoría de **matriz viva** y selección de siguiente hito completo, sin confundir el cierre automatizado de llamadas con reservas aprobadas o producción.


## 7. Hito documental: auditoría integral de matriz viva y priorización CV-013 — 09-11-2026

**Documento de análisis:** [SABORA_LIVE_REQUIREMENTS_MATRIX_INTEGRAL_AUDIT_2026-11-09.md](../reviews/SABORA_LIVE_REQUIREMENTS_MATRIX_INTEGRAL_AUDIT_2026-11-09.md), publicado en esta rama; **tablero actualizado §60 y matriz §5**, sin modificación funcional, normas, SQL o pruebas en este hito documental. Contraste de la documentación normativa, árbol GitHub, módulos API/SQL/PWA y resultados CI. No confundir un informe de continuidad con norma ni con aceptación.

**Corrección de estado importante:** CV-013 **no está simplemente pendiente ni sin origen**: el dashboard financiero ya tiene cálculo SQL persistido/autorizado, HTTP ADMIN/root, PWA de Configuración, filtros y pruebas integradas PG17/Chromium ([M3 #42382160546](https://github.com/jdlc86/CartaViva/actions/runs/42382160546); regresiones del SHA funcional `92f8482a`). La **exportación Excel por empresa y período no está localizada/implementada** y no se declara validada. CV-012 y la llamada/anuncios de CV-014 sí son **candidatos técnicos validados en automatización aislada**; CV-014 reservas sigue bloqueada por decisiones explícitas pendientes.

**Bloqueo documental CV-013 demostrado:** el contrato de identidad establece empresa **opcional, editable y no verificada**; el RPC de confirmación de cliente en `20261026222958_sabora_production_customer_flow_candidate.sql` inserta `company=NULL` y `employee_number=NULL` en `sabora.orders`. No existe un vínculo histórico corporativo acreditado por ese INSERT. Antes del Excel deben resolverse por decisión normativa —o localizar el contrato vinculante— las reglas de empresa histórica (declarada/fecha frente a empresa verificada), datos sin empresa, cambios posteriores, permisos de descarga y política RGPD/retención y rectificación. No recuperar empresa histórica desde el perfil editable ni confundir ID Sabora con número de empleado corporativo.

**GitHub al auditar:** 46 PR abiertos **todos Draft**; #50/#51 encadenados, #52 y #53 hermanos sobre #51. No unir sus CI ni fusionar sin permiso. `apps/api/src/server.mjs` y runtime continúan en modo `health-only` estándar, aunque existan composiciones opt-in probadas. PR #52 pendiente revisión Codex independiente sin créditos; no bloquear automáticamente la auditoría documental, pero **no** considerar #52 aprobado.

**Próximo hito funcional propuesto, NO iniciado:** **CV-013 informes/exportaciones integrales**, reutilizando el dashboard y asegurando origen histórico, permisos, filtros empresa-período, categorías dinámicas, cancelaciones, Excel seguro y E2E completo PostgreSQL 17/JWT/HMAC/Fastify/Chromium. **Puerta previa:** decisión documental de atribución y retención/acceso; no inventar política ni abrir PR funcional que dependa de la decisión ausente. CV-004/M1 permanecen P0, Stripe test M4 y caja, M6 producción, F28/R09 visual y reservas CV-014 conservan sus bloqueos. No tocar Fleetia, VPS ni Supabase operativo.

**Corte de evidencia:** último SHA funcional probado **`92f8482a` 6/6 SUCCESS**; el informe y modificaciones de matriz/continuidad son nuevos commits **solo documentales `[skip ci]`** y no implican nuevas ejecuciones.

## 8. Saneamiento del repositorio — documento dedicado enlazado (09-11-2026)

**Documento específico creado:** [SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md](../reviews/SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md); este enlace se añade **únicamente a la continuidad de la sesión 32**, sin editar continuidades anteriores ni el tablero vivo en este hito. La referencia se basa en el estado real consultado en GitHub: **46 PR abiertos, todos Draft; 49 ramas; 5 PR `dirty` (#4/#8/#10/#11/#45); 4 `unstable` (#5/#40/#47/#51); 37 `clean` solo respecto de su base**. `main` consta `protected=false` en metadatos; la consulta de su política específica devolvió 403. El plan inventaría los 46 PR con bases, fija la separación de ramas hermanas #52 y #53 y propone cuatro hitos de saneamiento S1–S4.

**Estado reconciliado tras revisar las seis continuidades 27–32:** ya se había realizado el **censo e inventario estático de 42/42 PR** (28 ancestrales, 13 divergentes y #49 candidato), reconciliación de ramas y documentación histórica, resolución técnica del conflicto #48→#49 y validación integrada 5/5 del candidato #49 el 06-11; véanse los tres informes de saneamiento enlazados en el documento dedicado. **S1 está PARCIALMENTE REALIZADO**, no parte de cero: actualizar las cuatro PR #50–#53 y cerrar paridad semántica no acreditada. **S2/S3 tienen antecedentes reales, pero NO se ha construido ni validado la combinación final #52+#53**; S4 y fusión con `main` permanecen NO AUTORIZADOS. No se han creado pruebas, no se ha integrado código en `main`, y no se han fusionado/cerrado PR ni actuado sobre producción, Fleetia, VPS o Supabase operativo. La validación 6/6 previa corresponde por separado a los SHAs funcionales de #52 y #53, no al conjunto. Se mantiene la priorización de la matriz viva y el condicionamiento normativo CV-013; la próxima intervención de saneamiento sería S1 completo antes de cambiar ramas.

## 9. Reevaluación de saneamiento con genealogía Git exhaustiva — 09-11-2026

**Expediente actualizado exclusivo de esta sesión:** [plan de saneamiento, §8](../reviews/SABORA_REPOSITORY_SANITATION_SESSION_32_2026-11-09.md). Se releyeron continuidades **20–23, 25 y 27–32**, expedientes Git/CI históricos y se compararon **los 46 HEAD abiertos frente al HEAD actual de #53**. Sesiones 24/26 sin archivo propio en esta secuencia. **Resultado directo Git:** 31 HEAD ancestros de #53, 14 divergentes y #53 referencia idéntica. Se ha completado el **censo de genealogía 46/46**; esto no certifica paridad funcional, fusión ni nueva prueba CI.

**No rehacer la estabilización lograda el 06-11:** el PR #49 quedó técnicamente estabilizado tras integrar historia #48 sin cambiar el árbol y pasó 5/5 workflows; las 42 PR históricas fueron inventariadas y sus 13 divergencias clasificadas. Quedó abierta la equivalencia funcional de cinco familias #4/#5/#8/#17/#22. Las divergencias actuales #18–#21 son la cadena de #22, #14/#31/#40/#44 corresponden a documentación histórica y **#52 es una rama nueva paralela** a #53 que conserva su propio código.

**Corrección crítica de los riesgos Git:** `dirty` de #10/#11/#45 es respecto de su **base particular**, aunque sus HEAD sí son **ancestros de #53**; no tratarlos automáticamente como bloqueo del candidato. #52 y #53 divergen desde #51 y modifican **nueve rutas comunes** (API opt-in, gestión, migraciones/pruebas y documentos); solapamiento no es prueba de conflicto, pero requiere reconciliación deliberada y **test integrado conjunto**. Sus 6/6 históricos pertenecen a SHAs **distintos**, nunca a la combinación.

**Estado de saneamiento reevaluado:** (1) **genealogía y censo actuales hechos**; (2) **paridad semántica histórica pendiente** solo en frentes justificados, no 46 auditorías nuevas; (3) **candidato #52+#53 no construido/probado**; (4) cierre/fusión de PR y cambios de `main` **NO AUTORIZADOS**; producción, Stripe test real, visual F28/R09 y M6 conservan puertas independientes. La estabilización técnica anterior permitió trabajar sobre la matriz; evitar abrir nuevas ramas sin necesidad y no convertir el saneamiento administrativo en supuesta invalidez de toda la CI.

**Este hito es investigación y documentación; no nuevas pruebas ni código funcional.** No se han cerrado/fusionado PR, modificado normativa, desplegado, aplicado migraciones al Supabase operativo ni tocado Fleetia/VPS.

## 10. Ejecución de saneamiento — integración aislada de PR #52 y #53 (09-11-2026)

**Nuevo expediente de evidencia:** [Conciliación semántica histórica y candidatura combinada](../reviews/SABORA_S32_SEMANTIC_RECONCILIATION_AND_COMBINED_CANDIDATE_2026-11-09.md); enlazado **únicamente desde la continuidad de sesión 32**, sin modificar continuidades anteriores. La revisión del código actual comparó las 5 familias históricas #4/#5/#8/#17/#22: **76 entradas de rutas, 19 blobs idénticos, 57 evolucionados y 0 ausentes**. La brecha CV-019 de variantes señalada en la auditoría del 06-11 consta implementada en el candidato posterior (`basketLineKey`, pruebas de precio/variantes); equivalencia histórica absoluta de los 57 blobs cambiados **no certificada**.

**Integración ejecutada:** [PR #54 Draft](https://github.com/jdlc86/CartaViva/pull/54), rama `integration/sabora-s32-admin-waiter-sanitization-20261109`, base PR #53 (nunca `main`). Commit `f95a49a2` de dos padres Git #52/#53, **24 archivos ADMIN exclusivos + 9 archivos compartidos reconciliados**; se conservaron HMAC, SQL roles mínimos, cierre de sesiones, llamada a camarero, SW/PWA y suites integradas. Las migraciones de #52+#53 se inventarían juntas y el smoke SQL exige **69 FORCE RLS**. No despliegue ni Supabase operativo.

**Pruebas:** seis workflows arrancaron sobre `f95a49a2`. Cuatro puertas UI/PWA llegaron a SUCCESS; Bootstrap/H6 fallaron por **aserción nueva** que leía texto de editor tras el guardado, cuando la PWA había limpiado el formulario (el borrador PostgreSQL sí conservaba el texto). Corrección causal en SHA funcional `03d1e61f`: captura del texto antes de guardar, preservando comparación exacta. **Nueva ejecución de seis workflows pendiente de cierre** en este registro; no mezclar SHAs ni afirmar aprobación independiente. Sin cierre o merge de PR, `main` intacta. Próxima puerta: comprobar esos seis resultados, corregir si falla y registrar aceptación técnica únicamente de lo probado.
