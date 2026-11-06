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
