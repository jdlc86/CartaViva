# Sabora / CartaViva — continuidad operativa de la sesión 23 (2026-11-05)

> **Documento de continuidad vivo, NO normativo.** Sirve para que la sesión 23 y la siguiente recuperen el contexto y registren **solo los hitos integrales realmente alcanzados**. No autoriza merges, despliegues, migraciones operativas, gastos ni cambios de requisitos.
>
> **Consulta obligatoria en cada arranque:** [tablero vivo central M1–M6 / CV-001–CV-018](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y [matriz de aceptación F01–F28 / R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). Este handoff registra una fotografía y puede quedar desactualizado: verificar en GitHub el HEAD, los PR y el CI del **mismo SHA**. Las decisiones normativas tienen siempre precedencia.

## 1. Jerarquía documental — lectura obligatoria antes de implementar

1. **Normativa funcional:** [contrato funcional Sabora](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md) y [requisitos funcionales](../REQUISITOS_FUNCIONALES.md). Sabora gestiona **un único restaurante**; CartaViva actúa como directorio separado. La regla de cuentas de coste cero aprobada el 05-11-2026 está incorporada en el apartado de **Pagos** del contrato. No rescatar bloqueos antiguos ya resueltos.
2. **Normativa visual:** [contrato del sistema visual](../DESIGN_SYSTEM_CONTRACT.md), [auditoría del estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [requisitos de diseño](../design/DESIGN_REQUIREMENTS_V1.md). No inventar pantallas, baseline ni decisiones pendientes.
3. **Arquitectura y autorizaciones:** [hoja de ruta técnica](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [contrato de las dos PWA](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md), [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md) y [aislamiento respecto de Fleetia](../security/CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md).
4. **Seguimiento y aceptación (no normativos):** [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md); [matriz H6](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), especialmente §§34–35; [informe de cierre Codex 04-11](../reviews/SABORA_TABLE_CHANGE_FINAL_INTEGRAL_CLOSURE_REPORT_2026-11-04.md), [informe coste cero 05-11](../reviews/SABORA_H6_ZERO_COST_ACCOUNT_LIFECYCLE_2026-11-05.md) y [auditoría independiente 05-11](../reviews/SABORA_H6_INDEPENDENT_ZERO_COST_ACCEPTANCE_2026-11-05.md).
5. **Continuidad anterior, solo contexto histórico:** [sesión 22](SESSION_22_HANDOFF_2026-11-04.md), con sus rectificaciones de 05-11. Si un handoff y el contrato discrepan, prevalece el contrato.

**Regla de trabajo:** cerrar hitos funcionales de extremo a extremo; pruebas integradoras como norma, pruebas aisladas únicamente para diagnosticar fallos concretos o proteger requisitos críticos. Distinguir *implementado*, *pruebas ejecutadas*, *alcance funcional validado* y *pendiente/no-go*. No utilizar la repetición de micropruebas como estrategia de desarrollo.

## 2. Fotografía comprobada al abrir la sesión 23 (05-11-2026; HISTÓRICA)

- **Único repositorio donde se autoriza escribir:** [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva). No ejecutar operaciones en Fleetia ni en recursos ajenos al proyecto.
- **Cadena de PR abierta y Draft, sin merges:** [#43](https://github.com/jdlc86/CartaViva/pull/43) `integration/sabora-h6-b2-delivery-board-contract-20261031` → [#44](https://github.com/jdlc86/CartaViva/pull/44) `feat/sabora-table-change-final-closure-20261104` → [#45](https://github.com/jdlc86/CartaViva/pull/45) `audit/sabora-h6-zero-cost-integrated-acceptance-20261105`.
- **HEAD de PR #45 comprobado antes de crear este documento:** `e3b461200a0205947cc596ea6d2b29b1f99d3901`. El commit que publique este handoff será distinto; **no** trasladar los resultados de CI automáticamente al nuevo SHA.
- **Actions consultadas para `e3b46120`:** [Sabora CI](https://github.com/jdlc86/CartaViva/actions/runs/42000242640) **SUCCESS** y [Bootstrap Sabora lockfile](https://github.com/jdlc86/CartaViva/actions/runs/42000242900) **SUCCESS**. **Son dos workflows observados en ese SHA**, no un 4/4 de todas las PWA.
- **SHA funcional auditado por PR #45:** `0661e7b78ada8f4d94c43872ec64ade6d501a6ff`. [CI](https://github.com/jdlc86/CartaViva/actions/runs/41997924753) y [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/41997924755): SUCCESS; logs documentados: **51/51** en aceptación integral PG17/Fastify/Chromium, **4/4** coste cero, **2/2** H6 y Node **1.175 PASS / 0 FAIL / 2 SKIP**. No confundir esas pruebas con Stripe test real ni con un cierre visual de mesa.
- **Dictamen general:** **M1 EN CURSO; B3/B4 y producción NO-GO.** Ningún merge, despliegue, migración en Supabase operativo ni intervención en VPS autorizados por este estado.

## 3. Qué está implementado y hasta dónde está validado

### H6 / F21-R06: revisión correctiva de pedidos

El PR #44 incorpora y acredita en candidato la revisión por agotado o modificación antes de despacho: revisión inmutable del mismo pedido, diferencia de precio y consentimiento, reenvío idempotente, despacho sin reiniciar los 300 s, ACK de cocina, SSE, roles, cuentas y destino A→B. [Informe de cierre](../reviews/SABORA_TABLE_CHANGE_FINAL_INTEGRAL_CLOSURE_REPORT_2026-11-04.md). Su **prueba integral** acreditada no equivale a habilitación productiva, conformidad visual humana ni procesamiento Stripe sandbox real. No repetir este hito como si no existiera.

### Política aprobada de cuentas de coste cero

**CV-002 cerrado normativamente:** solo al terminar la **ocupación de la mesa** puede autocerrarse una cuenta gratuita que cumpla las condiciones; el fin de la visita individual, logout o vencimiento de sesión **no** son el disparador. La ocupación activa mantiene abierta su cuenta, incluso si hay pedidos gratuitos resueltos. Una cuenta con alguna ronda positiva no entra en el autocierre, aunque el saldo llegue a cero.

**CV-001 con evidencia significativa, no cerrado:** en PR #45 se observó una prueba integrada con tres comensales, cliente Chromium → Fastify → PostgreSQL 17 de roles mínimos. Al cerrar la ocupación, solo la cuenta gratuita resuelta se liquida como `system_zero_cost`; la gratuita pendiente y la cuenta con deuda permanecen abiertas. Outbox único, revocación y no atribución ficticia de entrega física. **La transición de cierre se invocó mediante RPC SQL desde el harness**, no desde un flujo de cierre probado en la PWA de gestión con JWT HTTP. [Auditoría independiente](../reviews/SABORA_H6_INDEPENDENT_ZERO_COST_ACCEPTANCE_2026-11-05.md).

**CV-003 permanece pendiente:** reconciliar evidencia individual F01–F28/R01–R10, justificar los dos SKIP Node y evitar que el informe histórico del 04-11 mantenga el bloqueo de coste cero como si estuviera vigente. No declarar cerrada la matriz por tener 51/51 ni 4/4 de otra revisión.

## 4. Secuencia lógica de hitos, sin fragmentarlos

| Hito | Estado al inicio | Trabajo y puerta de salida |
| --- | --- | --- |
| **M1 / CV-001–003** | **EN CURSO** | Cierre independiente del candidato H6: auditoría SQL/económica, evidencia integrada de transición real de gestión cuando corresponda, revisión F01–F28/R01–R10 por fila, justificación de SKIP y acta final con límites. Sin falsificar pruebas visuales ni suponer que RPC SQL = PWA gestión. |
| **M2 / CV-004–005** | PENDIENTE | Inventario de ancestros/PR y consolidación sin perder cambios; arranque real opt-in H3–H6 desde `health-only`, JWT/HMAC, roles SQL mínimos, dos PWA conectadas y readiness verdadero sobre PG17 aislado. **Nunca merge automático**. |
| **M3 / CV-006–007** | PENDIENTE | Gestión completa de mesas y QR; catálogo y categorías **dinámicas** con publicación explícita; cliente/cocina/sala y datos coherentes, pruebas integrales y diseño aprobado. |
| **M4 / CV-008–009** | BLOQUEADO parcialmente | Stripe **sandbox real**, webhooks/reembolso/reconciliación y caja/cierre por PWA gestión, sujetos a credenciales test y diseño visual aprobados. Los mocks no certifican transacciones del proveedor. |
| **M5 / CV-012–016** | PENDIENTE/BLOQUEADO por elementos | PWA independientes instalables, métricas reales, reservas/comunicaciones, estudio de imágenes Gemini y directorio CartaViva separado según contratos. Resolver decisiones y accesos antes de integrar servicios externos. |
| **M6 / CV-010–011, CV-017–018** | BLOQUEADO | Certificación piloto: seguridad, secretos, supervisión, backups/rollback, aislamiento material respecto de Fleetia, accesibilidad y aprobación visual humana, acta GO/NO-GO. **El despliegue requerirá autorización expresa separada**. |

**Prioridad de continuación:** terminar **M1** con aceptación verificable y sin bloqueos obsoletos; después abordar **M2 como bloque completo**, antes de construir pantallas de M3/M4 sobre un backend que aún arranca solo en modo health. El tablero vivo puede reajustar prioridades tras nuevos hallazgos acreditados; este handoff no las congela.

## 5. Límites y seguridad innegociables

- **No tocar Fleetia**, sus contenedores, redes, volúmenes, proxy, base de datos, recursos ni repositorio. No alterar otros proyectos del VPS. Arrancar/parar Sabora debe ser materialmente independiente.
- **No operar en VPS ni Supabase productivo**, activar servicios, cambiar secretos ni desplegar sin autorización explícita y preflight de aislamiento. Usar PostgreSQL 17 desechable y pruebas CI aisladas.
- No ampliar RLS, EXECUTE, privilegios, HMAC/JWT ni debilitar verificaciones para superar un test. La seguridad de los escenarios reales es parte de la aceptación.
- **No fusionar PR** ni ejecutar despliegue por tener CI verde. Antes de escribir, comprobar HEAD remoto, rama base, diffs y cambios concurrentes; usar escrituras condicionadas por SHA, sin force push ni sobreescritura.
- Mantener el **diseño visual aprobado**: una pantalla de caja/mesa no documentada requiere resolución visual, no improvisación. Una demo de Chromium con datos de prueba no equivale a aprobación humana.
- Toda cifra de pruebas o estado «PASS» debe quedar asociada al **SHA exacto, job y escenario observado**. Fallos/omisiones conservan su contexto y deben verificarse antes de cerrar hitos.

## 6. Registro vivo de hitos fundamentales de la sesión 23

**Al crear el documento (05-11-2026):** se registra la **situación heredada, sin hito funcional nuevo atribuido a la sesión 23**. La creación de esta continuidad y la actualización del enlace desde el tablero son solo cambios documentales. **M1 continúa EN CURSO y producción NO-GO**.

**Regla de actualización:** añadir **únicamente después** de completar un hito integral, de una auditoría que cambie el dictamen, de una decisión normativa aprobada o de un bloqueo importante. Actualizar en paralelo el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), la [matriz F/R](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) y los informes de aceptación que correspondan. No duplicar aquí una bitácora de cada test o corrección menor.

### Plantilla para cada hito validado (no registrar si no hay evidencia)

- **Fecha / Hito / IDs CV:** …
- **Decisión y estado:** IMPLEMENTADO / PRUEBAS EJECUTADAS / CANDIDATO VALIDADO / CERRADO / BLOQUEADO, con límites explícitos.
- **Qué se implementó y contrato normativo aplicado:** …
- **Escenario de aceptación real:** actores, flujo completo, PG17/API/Chromium/servicio externo, resultado observable; diferencias con mocks y pendientes.
- **Evidencia:** rama/PR Draft, SHA exacto, workflows y artefactos, F/R acreditadas, fallos corregidos y regresión.
- **Límites, riesgos, aprobaciones y siguiente hito:** …
- **Operaciones:** sin merge/despliegue/VPS/Supabase operativo/Fleetia salvo autorización explícita posterior independiente.

## 7. Entrega a la siguiente sesión

La sesión que continúe deberá **leer primero** este documento, el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), la [matriz H6](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) y la normativa aplicable; comprobar en GitHub **HEAD/CI actuales** de los PR y consultar los registros nuevos de §6. Las instantáneas y SHAs del 05-11 no sustituyen una comprobación posterior. Dejar los bloqueos reales visibles, proteger ramas de otros colaboradores y priorizar trabajo completo con aceptación integradora.

**Estado de partida de la sesión 23: candidato H6 avanzado, aceptación M1 no cerrada, producción NO-GO.**

## 8. Auditoría de aceptación CV-003 — avance fundamental documental (05-11-2026)

**Naturaleza del hito:** reconciliación **documental e independiente** de la aceptación H6, **no** cambio de aplicación, migración ni certificación funcional nueva. **Commit de la matriz:** `3fb50a633c09183be2eaf859a1f1629c88916b88`. [Matriz viva §37](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md) y [tablero vivo §10](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).

- **Inventario completo:** conciliados los dictámenes de **F01–F28** y **R01–R10** frente al informe de PR #44, §§7–36 de la matriz, la auditoría independiente PR #45, código de runtime y Actions. Las filas con evidencia candidata se distinguen de aquellas todavía **BLOQUEADAS** o **PARCIALES**. La norma de coste cero del 05-11 prevalece sobre el bloqueo histórico del 04-11.
- **Pruebas examinadas, no ejecutadas de nuevo por la revisión documental:** SHA funcional `0661e7b78ada8f4d94c43872ec64ade6d501a6ff`: [CI](https://github.com/jdlc86/CartaViva/actions/runs/41997924753) y [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/41997924755) SUCCESS; logs PostgreSQL 17/Chromium **51/51**, coste cero **4/4**, H6 **2/2**, Node **1175 PASS, 2 SKIP, 0 FAIL**. SHA posterior `e3b461200a0205947cc596ea6d2b29b1f99d3901`: [CI](https://github.com/jdlc86/CartaViva/actions/runs/42000242640) y [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/42000242900) SUCCESS. El **4/4 previo** de PR #44 fue en **otro SHA** (`3fe626ce`), no en #45; el nuevo commit documental tampoco autoriza atribuirle suites no observadas.
- **Diagnóstico preciso de los dos SKIP:** `apps/api/src/table-change-h6-contract.test.mjs` contiene dos `test.skip` sobre la función original `confirm_customer_round_h6_candidate`, cuyo orden de cuenta/transferencia no corresponde al candidato separado. La ruta candidata tiene pruebas PG17 integradas, pero `PERSIST_H6_ORDER_SQL` y el bootstrap ordinario siguen dirigidos a la función anterior. **No eliminar SKIP ni declararlos PASS**: resolver el corte real de runtime/roles y revalidar invariantes en **M2/CV-005**.
- **Bloqueos no ocultados:** cierre gratuito multicomensal desde cliente y RPC staff, pero **no** botón final de gestión/mesa/caja; Stripe test externo ausente; conformidad visual humana no aceptada; `health-only` es el arranque normal. No atribuir entrega física a estados `ready` o `claimed`.
- **Decisión de aceptación:** **CV-003 EN CURSO (reconciliación completa, puertas de aceptación pendientes)**, **CV-001 EN CURSO**, **CV-002 CERRADO normativamente**, **M1 NO CERRADO** y **producción NO-GO**. Esta auditoría no inicia el cutover M2 ni modifica estado operativo alguno.

**Próxima unidad de trabajo:** decidir y ejecutar el cierre integral realmente pendiente de M1 sin fabricar aceptación de la PWA de gestión; preparar el encadenamiento M2/CV-004–CV-005 con inventario de ramas/PR y montaje autentificado de H3–H6 en PG17 efímero, respetando los contratos y pruebas integradoras. Actualizar tanto este handoff como el tablero **solo tras hitos importantes**. No merge, no deploy, no Supabase/VPS/Fleetia.

## 9. Encargo a Codex preparado y publicado en GitHub — 05-11-2026 (DOCUMENTAL)

Se publicó [CODEX_SABORA_SESSION23_INTEGRAL_M2_M3_EXECUTION_2026-11-05.md](../assignments/CODEX_SABORA_SESSION23_INTEGRAL_M2_M3_EXECUTION_2026-11-05.md), enlazado desde el [tablero vivo §11](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y con referencia expresa, **sin reescribir**, a la [matriz viva F01–F28/R01–R10 §37](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). Este encargo es contexto operativo, **no normativa**.

**Secuencia prevista para Codex:** (1) M2 completo, CV-004/CV-005, inventario de PR y arranque aislado, opt-in, realmente integrado de H3–H6 con roles mínimos/PG17/2 PWA y revisión de dos SKIP; (2) M3 completo, CV-006/CV-007, gestión mesa/QR y catálogo/categorías dinámicas tras su puerta de entrada. Si el contrato no autoriza pantallas o un grant, registrar bloqueo y no sortearlo. Mantener `server.mjs` sin rutas operativas activadas mientras la puerta de autorización lo prohíba.

**Estado de la actividad:** instrucciones **preparadas y publicadas**, sin ejecución ni resultado de Codex acreditado todavía. Los PR #43/#44/#45 siguen siendo la referencia histórica a comprobar al inicio de la tarea; Codex debe revalidar HEAD/base/CI y trabajar mediante rama/PR Draft propio, sin force push. La publicación del encargo **no cambia** M1 EN CURSO ni el dictamen **NO-GO**; no merge, no deploy, no Supabase/VPS/Fleetia.

## 10. M2 CV-004/CV-005 — candidato validado (05-11-2026)

Se creó `integration/sabora-session23-m2-bootstrap-20261105` desde el HEAD verificado `d87dd6ac` de PR #45. El [plan e inventario](../reviews/SABORA_SESSION23_M2_INTEGRATION_PLAN_2026-11-05.md) reconcilia los 38 PR Draft observados y conserva la cadena funcional #43→#44→#45 sin merge ni reescritura.

El candidato nuevo compone H3–H6 en un arranque separado, explícitamente opt-in y sin importar ni modificar `server.mjs`: 15 logins físicos independientes, capacidades `NOLOGIN/NOINHERIT`, transacciones `SET LOCAL ROLE`, JWT+pertenencia SQL, cookies/origen, HMAC, outbox/SSE, cocina/sala y cierre idempotente. La migración no crea LOGIN, secreto, worker, endpoint ni despliegue. Los dos SKIP económicos se trasladaron a la confirmación de transferencia seleccionada y pasan como pruebas activas.

Durante PostgreSQL 17 se corrigieron defectos reales del arnés/integración: referencia fuera de ámbito, reutilización de una composición H4 antigua de privilegios directos, smoke que recreaba un rol ya versionado y reutilización de un camarero revocado para la lectura positiva. H4 queda limitado a tres RPC exactas mediante capacidad y el LOGIN conserva cero `EXECUTE` directo, tablas o secuencias. El actor M2 se valida activo con JWT+SQL y el mismo JWT recibe `403` inmediatamente tras revocarlo.

El SHA `7f90000077ab77759935cf291ac6ec637411b983` de [PR #46 Draft](https://github.com/jdlc86/CartaViva/pull/46) obtuvo [generate-lockfile PASS](https://github.com/jdlc86/CartaViva/actions/runs/42023242547) y [validate PASS](https://github.com/jdlc86/CartaViva/actions/runs/42023242569): cadena de 84 migraciones/reanudación, rollback del LOGIN B3, **51/51 PG17**, bloques H6 1/2A/2B, Chromium y puerta de secretos. Los dos SKIP quedan resueltos como pruebas activas (**0 SKIP**). API y builds de ambas PWA también pasan. Informe: [SABORA_SESSION23_M2_CANDIDATE_REPORT_2026-11-05.md](../reviews/SABORA_SESSION23_M2_CANDIDATE_REPORT_2026-11-05.md).

**Decisión:** M2 queda **CANDIDATO VALIDADO**, no fusionado ni activado. Su puerta permite iniciar M3 en rama/PR Draft propios. Producción continúa **NO-GO**; no merge, deploy, Supabase operativo, VPS ni Fleetia.

## 11. M3 integrado: puerta técnica CI superada, revisión de producto pendiente (06-11-2026)

Referencia principal: [tablero vivo §12](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). El [PR #48 Draft](https://github.com/jdlc86/CartaViva/pull/48) tiene como último SHA funcional **`a2b21121ad89d80bed0e07fc7f1dbd8f3344fb66`**. Tres gates de ese SHA en verde: [CI](https://github.com/jdlc86/CartaViva/actions/runs/42202011633), [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42202011788), [Chromium visual](https://github.com/jdlc86/CartaViva/actions/runs/42202011685). Bootstrap: 51/51 PG17, 0 SKIP. Evidencia de ambas PWA en artefacto `sabora-m3-pg17-two-pwa-browser`.

El cierre real del flujo M3 recorre publicación de plato gratuito, mesa/QR, pedido cliente, despacho H6, cocina ACK y líneas READY, pickup durable y cierre de ocupación con autocierre económico sin atribuir entrega. Se corrigieron fallos SQL de permisos mínimos del propietario M3 en revocación de visitas y consulta de `customer_accounts.id`, además de los problemas HTTP/visual y arnés SSE registrados en el PR. **No hay aceptación humana ni despliegue.** M3 se considera candidato técnico, no finalización de toda la aplicación. M1, matriz F/R, Stripe test, caja visual, observabilidad y producción siguen pendientes conforme a normativa y tablero.

No merge, no VPS, no Supabase operativo, no Fleetia. Esta nota es contexto, no fuente normativa.

## 12. Punto de relevo operativo de sesión 23 — comprobación de 06-11-2026 (11:51 Europe/Madrid)

### Fuente de verdad y restricciones inalterables

- **Repositorio único autorizado:** `jdlc86/CartaViva`. No tocar Fleetia ni otros recursos del VPS compartido. No tocar Supabase operativo. Sin merge, despliegue, reinicio, eliminación, activación ni modificaciones de infraestructura sin autorización expresa y aislamiento respecto de Fleetia.
- **Primero normativa:** [requisitos funcionales](../REQUISITOS_FUNCIONALES.md), [contrato visual aprobado](../DESIGN_SYSTEM_CONTRACT.md) y [matriz de aceptación F01–F28/R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). Este handoff y el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) orientan la ejecución; **no** sustituyen ni reinterpretaban requisitos.
- Implementar y cerrar **hitos completos**; pruebas integradoras como método normal. Pruebas aisladas solo para causa de un fallo concreto o protección de una invariante crítica. Distinguir siempre código implementado, tests ejecutados, resultado de CI, conformidad visual/producto y aceptación operacional.

### Estado verificable en GitHub

- **M2:** [PR #46](https://github.com/jdlc86/CartaViva/pull/46): **candidato técnicamente validado** en su SHA funcional documentado en §10; no fusionado ni activado.
- **M3 CV-006/CV-007:** [PR #48 Draft](https://github.com/jdlc86/CartaViva/pull/48), rama `integration/sabora-session23-m3-acceptance-20261106`. **Último SHA funcional con prueba completa verde: `a2b21121ad89d80bed0e07fc7f1dbd8f3344fb66`**. [CI #42202011633](https://github.com/jdlc86/CartaViva/actions/runs/42202011633) **SUCCESS**; [Bootstrap PG17 #42202011788](https://github.com/jdlc86/CartaViva/actions/runs/42202011788) **SUCCESS**; [smoke visual gestión #42202011685](https://github.com/jdlc86/CartaViva/actions/runs/42202011685) **SUCCESS**. Bootstrap: **51/51 PG17, 0 fail, 0 skip**; artefacto `sabora-m3-pg17-two-pwa-browser`.
- **HEAD encontrado al relevar:** `5c6e27b25c2d49252d0f4a714165cd5df9a54705`, **solo documental** (se actualizaron tablero §12 y este handoff §11). Para ese SHA, al comprobar: [gestión visual #42206194704](https://github.com/jdlc86/CartaViva/actions/runs/42206194704) **SUCCESS**; [Bootstrap PG17 #42206194764](https://github.com/jdlc86/CartaViva/actions/runs/42206194764) **EN CURSO**, sin error reportado; [CI #42206194870](https://github.com/jdlc86/CartaViva/actions/runs/42206194870) **EN CURSO**, sin error reportado. **Consultar conclusión real**; no convertir «en curso» en PASS.
- El presente registro documental constituye un commit posterior a los SHA anteriores: **no atribuirle automáticamente los resultados del commit funcional** ni relanzar suites duplicadas para editar texto.

### Qué resolvió M3 y qué NO demuestra

Se corrigieron defectos contractuales reales de lectura HTTP de mesas (`tableId` SQL frente a `id` PWA), selección/refresh de mesa, creación/QR, identidad de fixture y proxy Chromium de SSE (una conexión persistente no puede consumirse con `route.fetch`). El último error del cierre de ocupación se resolvió con **privilegios mínimos** para la revocación de visitas y para leer `customer_accounts.id` durante el JOIN bajo propietario interno `NOLOGIN/NOBYPASSRLS`; no se concedieron permisos directos al runtime M3. El recorrido integrado real de 2 PWA + Fastify + PG17 efímero publica catálogo, crea/abre mesa, valida QR, confirma ronda gratuita, realiza despacho H6, ACK de cocina, transiciones a READY con pickup durable y finalmente cierra ocupación y cuenta gratuita resuelta con `close_origin=system_zero_cost`. No afirma entrega física ni cobro.

**Conformidad humana/visual definitiva no validada**, **Stripe sandbox externo sin validar**, **caja y operación real pendientes**, **observabilidad/recuperación/autorizaciones de puesta en marcha pendientes**. Los controles de M1/CV-001/CV-003 y la matriz F/R no están cerrados por el éxito de M3. La producción sigue **NO-GO**.

### Secuencia de continuación obligatoria

1. Comprobar PR #48 (HEAD, estado Draft, base) y **los tres workflows** del último SHA; si hay FAIL, inspeccionar job/log y corregir la causa, no ocultar la prueba ni aumentar permisos sin SQLSTATE o evidencia PostgreSQL.
2. Revisar el [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), los documentos normativos y la matriz F/R antes de elegir el siguiente bloque de valor; contrastar de forma independiente la evidencia de M3 (Chromium, PG17 y roles) con el diseño aprobado, sin aceptar automáticamente las pantallas por un smoke verde.
3. Preparar el siguiente **hito integrado de aceptación y preparación operacional** con cobertura real de los requisitos restantes; tratar Stripe test, caja, recuperación/observabilidad y aceptación visual como puertas separadas. No avanzar mediante una secuencia de micropruebas repetitivas. Registrar hechos demostrados, bloqueos y NO-GO en tablero y continuidad **solo cuando cambie un hito relevante**.
4. Mantener PRs Draft y las prohibiciones de merge/despliegue/recursos compartidos hasta nueva autorización expresa.

**Nota de cronología:** las secciones §9–§10 son el estado histórico al publicarse, no afirmaciones actuales de que Codex aún no implementó M2/M3. Prevalecen las evidencias más recientes §11–§12 y el estado vivo comprobado en GitHub.

## 13. Seguimiento consolidado tras PR #48 — 06-11-2026

Referencia vigente: [tablero vivo §13](../tracking/SABORA_LIVE_PROJECT_TRACKER.md); prevalecen siempre la normativa NF/RF/DV y la matriz única F/R. El [PR #48 Draft](https://github.com/jdlc86/CartaViva/pull/48) alcanzó SHA funcional `21f9e8123e36d0dbcd2d75c152669b73f8f589f7` con **3/3 workflows SUCCESS del mismo SHA**: [CI](https://github.com/jdlc86/CartaViva/actions/runs/42213850457), [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42213850371) (**51/51, 0 SKIP**) y [Chromium gestión](https://github.com/jdlc86/CartaViva/actions/runs/42213850340). Se corrige la fotografía antigua de §12, cuando algunas ejecuciones estaban en curso. La última corrección de `M3CatalogManagementView.tsx` distingue mutación confirmada de fallo de actualización de vista y pasó esos gates.

**M3/CV-006/CV-007 = candidato técnico validado, NO cerrado como producto ni visualmente aprobado.** M1/CV-001/CV-003 siguen en curso, M4/CV-008 Stripe sandbox real bloqueado por credenciales/permiso, CV-009 caja por aprobación de flujo, M5/M6 pendientes. Revisar tablero §13 y fuentes normativas antes de abrir siguiente bloque integral; no usar micropruebas como hito ni inferir `GO` de CI.

Este registro es **documental**; no genera prueba funcional nueva ni autoriza merge, deploy, Supabase operativo, Fleetia o VPS compartido.

## 14. Revisión independiente M3 y hallazgos para continuación — 06-11-2026

Leer [tablero §14](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) e [informe independiente](../reviews/SABORA_SESSION23_M3_INDEPENDENT_ACCEPTANCE_2026-11-06.md), subordinados a la normativa. Se corrigieron dos defectos comprobados: (a) falsedad de interfaz si ocupación cerró en PG17 pero falló GET posterior, con bloqueo preventivo de nuevos cambios y recuperación obligatoria; (b) inputs de orden de categorías ilegibles por auto-colocación en columna de icono (42 px). Commit funcional `ceb6312e8b6e95c96bc2b256c0c21f21e1a5dfe4`: Bootstrap [#42219921523](https://github.com/jdlc86/CartaViva/actions/runs/42219921523) **51/51 PG17 PASS**, smoke [#42219921551](https://github.com/jdlc86/CartaViva/actions/runs/42219921551) **SUCCESS**; [CI #42219921755](https://github.com/jdlc86/CartaViva/actions/runs/42219921755) **SUCCESS**; **3/3 workflows en verde para `ceb6312e`**. Este registro documental no recibe PASS automáticamente. Evidencia real de UI en artefacto `sabora-m3-pg17-two-pwa-browser`, con `management-catalog-mobile.png` (390×844) y `management-published.png` (escritorio). El informe distingue defectos resueltos de roles de presentación y aprobación visual pendientes. M3 sigue candidato técnico; M1/M4/M5/M6 no se dan por cerrados; producción NO-GO. No merge/despliegue ni cambios en Fleetia, VPS o Supabase operativo.

## 15. Estabilización del candidato integrado M3 + CV-012 — 06-11-2026

**Hito de salud del repositorio, no cierre normativo ni despliegue.** Sin nuevos PR, merge, rebase, force push, VPS, Supabase operativo, Fleetia ni cambio de la matriz F01–F28/R01–R10. Referencia principal: [tablero vivo §15](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).

En el **PR #49 Draft existente**, rama `feat/sabora-cv012-independent-pwas-20261106`, se incorporaron por instantánea siete archivos del HEAD `ead7633bd9796324de88bb024583ad16944941e8` de PR #48. La comparación respecto del ancestro común `dab86474` demostró **cero rutas solapadas** entre esos siete archivos M3 y los 19 archivos específicos de CV-012. Se comprobaron hashes de contenido idénticos para los siete archivos después de la operación. Commit de reconciliación `071c059690b069a811bd44d65966d6d71364a233`. **La historia Git sigue divergente**; equivalencia de contenido no es un merge, rebase ni aprobación para fusionar PR.

Se amplió el comando raíz `pnpm test` para ejecutar todos los `*.test.mjs` del API y las 12 pruebas Node de gestión que estaban fuera del gate. Primera ejecución en `071c0596`: **1.339 PASS / 9 FAIL / 0 SKIP**, fallos registrados, no eliminados. Ocho se debían a una fixture de identidades SQL que no representaba los atributos actuales de funciones selladas de tablero/historial; uno a una aserción histórica que buscaba `q.status='approved'` en lugar de la guarda existente de `v_latest.status`. El commit `d075e735b53d20722183e32ebefbfd291fd74475` corrige **solo ambas pruebas históricas**, sin cambiar SQL, permisos ni runtime.

**Evidencia íntegra en el mismo SHA funcional `d075e735`: 5/5 workflows SUCCESS**:
- [Sabora CI #42229103103](https://github.com/jdlc86/CartaViva/actions/runs/42229103103): contratos, migraciones y PG17/HMAC/concurrencia/Chromium; artefactos H6 y M3.
- [Bootstrap PG17 #42229103099](https://github.com/jdlc86/CartaViva/actions/runs/42229103099): **Node 1.348/1.348 PASS, 0 SKIP; PG17 51/51 PASS, 0 SKIP; coste cero 4/4 PASS**, build/Compose/imagen.
- [Cliente Chromium #42229103205](https://github.com/jdlc86/CartaViva/actions/runs/42229103205) SUCCESS; [gestión Chromium #42229103106](https://github.com/jdlc86/CartaViva/actions/runs/42229103106) SUCCESS.
- [CV-012 dos PWA #42229103118](https://github.com/jdlc86/CartaViva/actions/runs/42229103118) SUCCESS: ámbitos SW, cachés públicos aislados, offline/online y separación por origen, con artefacto.

**Dictamen acotado:** candidato conjunto M3+CV-012 **técnicamente estabilizado bajo el alcance de CI del SHA citado**; CV-012 pasa de pendiente a **CANDIDATO TÉCNICO**, no CERRADO como producto. Permanecen sin resolver la experiencia por rol de camarero en M3, conformidad visual humana y móvil real, M1/CV-003, Stripe sandbox/caja, habilitación funcional del servidor (sigue `health-only`), 42 PR Draft y consolidación formal de historia, y certificación operacional M6. **Producción NO-GO.** El commit que publica esta nota es exclusivamente documental y no hereda automáticamente CI.

## 16. Saneamiento de la topología PR y corrección de permisos M3 — 06-11-2026

Se incorpora el [inventario independiente de estabilización Git](../reviews/SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md) como documento **no normativo** y soporte para el trabajo; la normativa funcional y visual conserva su prioridad. Su revisión de la API de GitHub acredita **42 PR abiertos, todos Draft**, diez ramas terminales y seis terminales históricas no ancestrales de #49 (#4, #5, #8, #17, #22 y #31); ninguna de esas diez ramas contiene un archivo cuya **ruta** esté ausente del árbol #49. **No** deducir de ello equivalencia semántica ni autorizar cierres. En particular, la rama #22 requiere revisar sus 32 commits de selección/cesta/consentimiento/sincronización antes de considerarla absorbida. No se ha hecho merge, rebase, force push ni se ha alterado `main`.

El commit `a4229f1dca1a26c37b087da58996b2b320d5c2b8` introduce un **candidato de corrección** de M3: capacidades `configure/qr/readiness/occupancy` proyectadas por Fastify desde personal autenticado y la lectura real PG17; PWA fail-closed ante ausencia/cambio de proyección, sin confundir presencia de métodos con privilegios; pruebas ampliadas de rol administrador/camarero en el recorrido PG17+Chromium existente y capturas de seis anchos. No se modificaron roles SQL, migraciones, `server.mjs` ni el entorno. **NO afirmar aceptación**: GitHub Actions aún no ha generado nuevas ejecuciones comprobables para este SHA al publicar esta nota. Los 5/5 workflows previos pertenecen únicamente a `d075e735`.

Puertas de estabilización todavía abiertas: 1) obtener CI íntegra sobre el nuevo candidato sin ocultar fallos; 2) reconciliar semánticamente las ramas no ancestrales; 3) decidir la consolidación de historial/PR con aprobación y sin perder trabajo; 4) revisión visual humana. Producción sigue **NO-GO**. Los cambios documentales posteriores no heredan CI.

## 17. Auditoría de preservación de seis ramas históricas — 06-11-2026

Se amplía la [revisión de topología y preservación de PR](../reviews/SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md) con reconciliación **estática y por contratos** de las seis ramas terminales no ancestrales (#4, #5, #8, #17, #22, #31), sin eliminar ni fusionar ninguna. La rama #22 mantiene cinco informes con hashes de blob idénticos, los 13 casos Node históricos y los 8 recorridos E2E originales por nombre; código y pruebas han evolucionado y aún **no** se certifica equivalencia semántica completa. #8 conserva idénticos el módulo y las pruebas de firma de capacidades. #17 conserva idéntico el informe H4. #4/#5 presentan implementaciones más recientes y no debe reintroducirse SQL antiguo sin control. #31 es contexto, no normativa.

La corrección M3 `a4229f1d` está **implementada** y la suite PG17/Fastify/Chromium incluye alternancia real admin/camarero y seis viewports, pero continúa **sin ejecución GitHub Actions acreditada en su SHA**. No citar 5/5 de `d075e735` como prueba de este cambio. Se mantienen los 42 PR Draft, las divergencias de historia, revisiones normativas y visuales pendientes y producción NO-GO. Ningún merge/despliegue ni acceso a Fleetia, VPS o Supabase operativo. Referencia de tareas: [tablero §17](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
## 18. Inventario exhaustivo de ancestralidad Git y decisión de mantener Draft — 06-11-2026

La [auditoría de estabilización](../reviews/SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md) se amplía con comparación GitHub HEAD→candidato de **todos los 42 PR**, no solo terminales: **27 HEAD ancestros, 14 HEAD divergentes y #49 idéntico a sí mismo**. Los divergentes son #4, #5, #8, #14, #17, #18, #19, #20, #21, #22, #31, #40, #44 y #48. #18–#21 son ancestros de #22, por lo que forman una familia, no cuatro unidades adicionales de posible pérdida. #48 conserva ocho commits no ancestrales aunque se copiaron siete blobs de código/documentación. Ninguna rama se considera lista para cierre/merge automáticamente.

**Sin ejecución automática nueva acreditada para el cambio funcional M3 `a4229f1d`.** El último SHA funcional probado con 5/5 workflows es `d075e735`, anterior a la proyección de permisos por rol. Mantener ese corte explícito. No hay cambios de normativa, `main`, VPS, Fleetia, Supabase operativo ni despliegue. El PR #49 sigue Draft. Ver [tablero §18](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).

## 19. Revisión H3 y limitación de GitHub Actions — 06-11-2026

[Informe de estabilización](../reviews/SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md) y [tablero §19](../tracking/SABORA_LIVE_PROJECT_TRACKER.md). La rama histórica #22 mantiene 13/13 casos Node y 8/8 escenarios Chromium originales por nombre; se han cotejado aserciones: 57/61 Node y 29/36 Chromium literalmente iguales, con adaptaciones del modelo de selección. Esto no demuestra paridad de todos los comportamientos; no se cierra el PR. Se constató adicionalmente que `configureBasketLine` agrupa por `itemId`, insuficiente para el requisito normativo de líneas separadas por personalización, pendiente de su hito funcional propio.

Para recuperar CI sin cambiar el árbol, se creó el commit vacío `9fef3f6e47c44b29df716a6b3672b9a7a0244f5d`, pero GitHub no registra ningún workflow ni check para él. La causa del no-arranque de GitHub Actions no está demostrada; **no** es correcto afirmar que la corrección M3 de `a4229f1d` haya aprobado la integración. El 5/5 PASS anterior `d075e735` permanece como último SHA funcional ejecutado. Mantener candidato/PR Draft y no intervenir en `main`, el VPS, Fleetia ni Supabase operativo. Producción NO-GO.

## 20. Hito de estabilización: conflictos PR #48/#49 resueltos y CI integral recuperada — 06-11-2026

**Punto de relevo actualizado:** [tablero vivo §20](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) e [informe de auditoría](../reviews/SABORA_REPOSITORY_STABILIZATION_GRAPH_2026-11-06.md), siempre subordinados a RF/NF/DV y matriz F/R. El bloqueo de Actions registrado en §19 era consecuencia del PR #49 con `mergeable_state=dirty`, no un saldo agotado acreditado. Reconciliación segura de HEAD #48 en rama de PR #49 mediante commit de dos padres `65b0ead2`, árbol de archivos intacto, sin merge a `main`. GitHub recuperó los cinco workflows inmediatamente.

En primera ejecución: cliente falló al descargar paquetes externos de Ubuntu y pasó al reintentar el job sobre el mismo SHA; Bootstrap y H6 CI encontraron el mismo fallo integrador de navegador/PG17 (50/51) por pérdida intencionada de selección de mesa 915 durante relevo admin↔camarero. En vez de tocar SQL/seguridad o añadir micropruebas, se corrigió la secuencia del escenario integral: cierre económico y recuperación primero, prueba real de roles después. SHA **funcional `380a4777cad82ee359cc487b58a9f030b62596c3`**.

**Cinco workflows del mismo SHA final, todos SUCCESS:** [CI H6](https://github.com/jdlc86/CartaViva/actions/runs/42253454494), [Bootstrap PG17](https://github.com/jdlc86/CartaViva/actions/runs/42253454770), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/42253454758), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/42253454543), [CV-012](https://github.com/jdlc86/CartaViva/actions/runs/42253454564). Bootstrap: 1.349/1.349 Node, 51/51 PG17, 4/4 coste cero, cero omisiones. La corrección de permisos M3 de `a4229f1d` queda cubierta por esa aceptación.

**Estado actual:** PR #49 Draft y sin conflictos (`mergeable=true/clean`), #48 ancestro, 42 PR Draft (28 ancestrales, 13 divergentes, #49); `main` sigue `42b46358`. Mantener estabilización de backlog y aceptación funcional/visual **pendientes**; no reabrir matriz como solución al Git. La deuda RF de variantes independientes de cesta continúa PENDIENTE, Stripe sandbox/caja/operación no habilitados. `server.mjs` continúa `health-only`; producción **NO-GO**. Ningún despliegue, supabase operativo, VPS, Fleetia ni recursos ajenos tocados. La presente actualización es solo documental y no acredita una corrida nueva.
