# Sabora / CartaViva — S36: verificación cruzada de la matriz viva, F01–F28/R01–R10 y primera prueba operativa (2026-11-11)

> **INFORME DE AUDITORÍA DOCUMENTAL CON CONTRASTE ACTUAL EN GITHUB. NO ES NORMATIVA NI REVISIÓN INDEPENDIENTE NI CERTIFICACIÓN DE PILOTO.** Conserva el corte anterior y actualiza únicamente hechos verificados; no interpreta un test aislado o CI global como aceptación funcional, humana, de proveedor ni de producción.

## 1. Fuentes y corte

- **Normas prevalentes:** [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), [RF](../REQUISITOS_FUNCIONALES.md), [escritor ADMIN único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [sistema de diseño](../DESIGN_SYSTEM_CONTRACT.md), [estilo aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [seguridad/arranque](../SABORA_AUTHORIZATION_GATE.md), [hitos completos](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md).
- **Matriz de aceptación H6:** [SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md), **§§4–5 y §40**. La sección 40 contiene trazabilidad **fila por fila de las 28 F y 10 R** sobre el SHA `0402e63a...`, **no una aceptación global**.
- **Auditoría transversal CV-001–CV-019:** [SABORA_LIVE_REQUIREMENTS_MATRIX_INTEGRAL_AUDIT_2026-11-09.md](SABORA_LIVE_REQUIREMENTS_MATRIX_INTEGRAL_AUDIT_2026-11-09.md), corte **histórico** de #53 y 46 PR abiertos, no estado Git vigente.
- **Matriz UI funcional:** [FUNCTIONAL_UI_COVERAGE.json](../design/FUNCTIONAL_UI_COVERAGE.json), derivación de cobertura y marcadores, no acta visual humana; la reserva CV-014 figura `PENDIENTE`.
- **Estado actual trazado:** [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), [continuidad 36](../handoffs/SESSION_36_HANDOFF_2026-11-11.md) y [preflight PR #56](SABORA_S36_PR56_INTEGRATION_PREFLIGHT_2026-11-11.md).

**Consulta a GitHub al corte S36:** **1 PR abierto, #56 Draft**, SHA `ba0530f4531e30afa70322d4b967ee49037be2ba`, sin merge; `main` conserva el código anterior al PR. La comparación `branch #56 → main` devuelve diferencias exclusivas de `main` en cuatro rutas **documentales** (continuidades S35/S36, preflight S36 y tablero), no funcionales en ese corte. No se realizó merge ni prueba nueva por este informe.

**Seis workflows de un mismo SHA #56 `completed/success`:** [Bootstrap #43067975140](https://github.com/jdlc86/CartaViva/actions/runs/43067975140), [Sabora CI #43067974953](https://github.com/jdlc86/CartaViva/actions/runs/43067974953), [gestión #43067974907](https://github.com/jdlc86/CartaViva/actions/runs/43067974907), [cliente #43067974930](https://github.com/jdlc86/CartaViva/actions/runs/43067974930), [CV-012 #43067975008](https://github.com/jdlc86/CartaViva/actions/runs/43067975008), [UI/cobertura #43067975055](https://github.com/jdlc86/CartaViva/actions/runs/43067975055). Los logs Bootstrap contienen `ok 1 - PG17 JWT/HMAC single Fastify with ADMIN ownership and waiter calls, two PWAs, transfer, ROOT force and stale writer denial` y `ok 22` del subtest de invitaciones/outbox anteriormente fallido; Sabora CI tiene `[H6] PASS Block 2B`. El `40P01` histórico no tiene explicación causal documentada.

## 2. Matriz viva de alcance CV-001–CV-019: reconciliación del corte histórico

**Sin eliminar ni alterar IDs**. Los estados describen la aceptación integral, no la cantidad de código. La evidencia automatizada de #56 corresponde **al PR**, no a `main`. Las referencias a #50–#55 de las actas antiguas son históricas y no constituyen PR abiertos actuales.

| ID | Estado contrastado al corte S36 | Evidencia, restricción o cambio respecto a 09-11 |
| --- | --- | --- |
| **CV-001** | Candidato técnico / aceptación integral pendiente | Coste cero y cierre H6 probados en PG17, pero F20/F28 y R03–R05/R09 no aceptados íntegramente |
| **CV-002** | Aclaración normativa cerrada | Fin de ocupación define cierre de cuenta cero según contrato; no implica GO económico |
| **CV-003** | 38/38 filas auditadas / NO-GO global | §40 sigue siendo la base probatoria fila a fila; no equivale a 38 filas `CERRADO` |
| **CV-004** | **Saneamiento administrativo S4 completado** | **Cambio material:** 46 PR abiertos era fotografía antigua. #54/#55 fusionados, PR redundantes cerrados, **#56 único abierto** |
| **CV-005** | Candidato opt-in / **P0 de primera prueba real** | `apps/api/src/server.mjs` sigue solo con `/health` y `/ready`; `api-runtime-config.mjs` rechaza modos operativos y secretos de producción; no arranque H3–H6 real |
| **CV-006** | Candidato técnico validado en PG17/Chromium | Mesas/QR/ciclo operativo; en #56 el permiso efectivo refleja titularidad, pero aún no está en `main` ni aprobado visualmente |
| **CV-007** | Candidato técnico PG17/Chromium; **corrección de UI en #56** | Catálogo con lector independiente de Mesas y permisos efectivos de ADMIN; no atribuir sus 6/6 a `main`; visual humana pendiente |
| **CV-008** | Bloqueado para validación completa | Stripe **sandbox remoto real**, firma/captura/reembolso/conciliación; simulado ≠ proveedor |
| **CV-009** | Parcial/bloqueado | Caja y pagos de terceros en candidato; UI de caja, controles y aceptación económica aún pendientes |
| **CV-010** | Bloqueado P0 de instalación | Logins SQL mínimos, secreto/CA/HMAC/JWT, aprovisionamiento y supervisión de Sabora |
| **CV-011** | Bloqueado P0 de instalación | Aislamiento material VPS/Fleetia, reversión/backup/restore Sabora-only, sin modificar terceros |
| **CV-012** | Candidato técnico validado en CI | Dos PWA instalables, workflows `success`; móviles/dispositivos reales aún no validados |
| **CV-013** | Dashboard candidato; Excel corporativo no acreditado | RF exige exportación empresa/período e históricos. Auditoría 09-11 detectó ausencia del circuito integral y atribución empresarial inmutable no definida; #56 no añade exportador ni norma de privacidad |
| **CV-014** | Anuncios/llamada candidatos integrados; reservas pendientes | CV-014 PG17/2 PWA, llamada a sala y avisos; **reservas anticipadas no implementadas** y parámetros de RF aún por decidir |
| **CV-015** | Bloqueado para integración real | Estudio de Imágenes Google Gemini: proveedor, original/versiones, aprobación, almacenamiento y cuotas, sin inferir servicio de UI |
| **CV-016** | Pendiente | Directorio independiente CartaViva; no confundirse con instalación restaurante ni Supabase operativo |
| **CV-017** | Bloqueado por aprobación humana | Diseño premium e imágenes autorizadas, F28/R09; Playwright/axe/capturas no sustituyen aceptación del propietario |
| **CV-018** | NO-GO de piloto integral | Hito global de seguridad, matriz, pagos/recuperación y despliegue. **Un ensayo técnico acotado no constituye CV-018 cerrado** |
| **CV-019** | Candidato técnico con UI humana pendiente | Variantes de un mismo plato y edición de cesta integradas históricamente; aceptación de experiencia visual no acreditada |

## 3. Matriz F01–F28: comprobación de estados sin ascensos automáticos

Se verificó la presencia y el dictamen de **cada una de las 28 filas** en [§40.1 de la matriz](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md). Las pruebas del PR #56 de permisos de gestión refuerzan autorización/sesión, pero **no prueban por sí solas las 28 F ni certifican Stripe y F28**.

| IDs | Estado que corresponde conservar | Razón / puerta abierta |
| --- | --- | --- |
| **F01–F06** | CANDIDATO | QR, primera confirmación, solicitud, unicidad y continuidad en origen; variantes de UX y aceptación global pendientes |
| **F07–F11** | CANDIDATO | Ventana/caducidad, aprobación/rechazo y no traslado prematuro; confirmar textos/tiempos y UX aprobada |
| **F12** | **CANDIDATO opt-in, activación pendiente** | Transferencia atómica A→B en PG17/Fastify/Chromium, sin arranque real H3–H6 desde `server.mjs` |
| **F13–F19** | CANDIDATO | Concesión, QR/mesa, cuenta individual y destinos operativos; no prueba entrega física ni aceptación humana |
| **F20** | **PARCIAL / BLOQUEADO proveedor** | Pagos parciales y efectivo en PG17; Stripe sandbox remoto, refunds/capturas/reconciliación sin prueba |
| **F21–F27** | CANDIDATO | Ventana 300 s, carreras, rollback, replay, SSE y roles/auditoría; sin cierre global ni validación de entorno real |
| **F28** | **BLOQUEADO aceptación visual humana** | Capturas y axe no constituyen conformidad humana ni UI de caja final aceptada |

**Balance sin cambio de categoría:** 26 `CANDIDATO` (incluye F12 opt-in), 1 `PARCIAL` (F20) y 1 `BLOQUEADO` (F28). No son 26 funcionalidades aceptadas.

## 4. Matriz R01–R10: comprobación de estado y evidencia posterior

| ID | Dictamen conservado | Verificación y límite |
| --- | --- | --- |
| **R01** | CANDIDATO | Migraciones PG17 efímero en Bootstrap #56 `success`; **no** aplicadas a Supabase operativo |
| **R02** | CANDIDATO | RLS/grants/roles/HMAC en E2E, extensión #56 de titular efectivo; independiente seguridad actual pendiente |
| **R03** | PARCIAL | Concurrencia local de cuentas/cesión/sala, **sin** Stripe proveedor y cierres reales |
| **R04** | PARCIAL | Rollback interno probado; recuperación externa Stripe/infraestructura real no acreditada |
| **R05** | PARCIAL | Cuenta/efectivo/coste cero, sin refund/captura/conciliación real sandbox |
| **R06** | CANDIDATO | Agrupación, cocina, sala, recogida y eventos candidatos; operación física sin aceptar |
| **R07** | CANDIDATO | SSE, aislamiento, reconexión/cursores candidatos; recuperación de proceso real no probada |
| **R08** | **CANDIDATO opt-in; arranque bloqueado** | API JWT/HMAC/PG17/roles de pruebas, no montaje del proceso `server.mjs` |
| **R09** | **BLOQUEADO** | Falta conformidad humana DV/F28; Playwright no la sustituye |
| **R10** | **CANDIDATO TÉCNICO ACTUALIZADO solo para #56** | **6/6 Actions `success` en `ba0530f4`**; no fusionado, no prueba de `main` post-merge ni explotación operativa |

**Balance sin ascenso a `CERRADO`:** R01/R02/R06/R07/R08 candidatos; R03/R04/R05 parciales; R09 bloqueado; R10 candidato técnico con evidencia nueva en PR #56. No se atribuyen todas las pruebas de `ba0530f4` a cada subcaso de la matriz H6.

## 5. La matriz frente a la primera prueba en el entorno de producción usado como piloto

**Bloqueo común P0 (no resuelto por CI):** `CV-005 + F12/R08`, porque `apps/api/src/server.mjs` registra únicamente `/health` y `/ready`, y `api-runtime-config.mjs` solo acepta `health-only`. Los arneses `startDisposableM3Runtime`/composiciones opt-in **son código ensayado en CI**, no arranque de instalación real.

**Precondiciones P0 adicionales:** integrar/autorizadamente #56 y comprobar CI de `main`; diseñar/aprobar bootstrap de procesos conforme a contratos, ejecutarlo en PG17 aislado con dos PWA y negativas; preflight/aplicación Sabora-only de migraciones en Supabase compatible; roles y secretos exclusivos; dominio/TLS; aislamiento material del VPS compartido y parada/reversión/restauración sin tocar Fleetia; observabilidad/alertas; datos ficticios; recorrido móvil QR→visita→catálogo→pedido→agrupación→cocina→sala→cuenta, incluidos reintentos y fallos. Despliegue/VPS/Supabase operativo **requieren autorización expresa**. Ningún paso anterior fue realizado por esta verificación.

**Puertas para aceptación integral distinta del primer smoke:** CV-008/F20/R03–R05 (Stripe sandbox remoto y caja), F28/R09/CV-017 (validación estética humana), CV-013 (Excel y atribución empresarial), CV-014 reservas y decisiones pendientes, CV-015 Gemini (proveedor/consumos), CV-016 directorio. Su exclusión de una prueba técnica **debe quedar explícita** y no significa eliminación del requisito normativo.

## 6. Resultado y mantenimiento de la matriz

- **Verificado:** documentos normativos, 19 CV, 28 F, 10 R y cobertura UI; comparación actual del único PR #56 con `main`; seis workflows `success` del SHA candidato; `server.mjs` y configuración efectiva. La matriz base sigue conservando evidencia válida histórica por subescenario y **desactualización del censo Git/CI**.
- **Corrección del diagnóstico:** la auditoría general del 09-11 hablaba de 46 PR Draft. Ese dato es histórico; el nuevo corte tiene **solo #56 abierto**, y las seis CI del HEAD #56 están cerradas correctamente. Las categorías F/R mantienen sus límites; R10 gana evidencia del SHA nuevo pero no puede declararse aceptado en `main`.
- **No verificado ni realizado:** ejecución de 38 escenarios individuales de cero en un único entorno final, revisión independiente sobre `main`, aceptación visual humana, Stripe proveedor, bootstrap operativo, Supabase/VPS, merge, despliegue o uso de credenciales reales. No escribir `CERRADO` sin prueba por escenario/entorno y aprobación normativa pertinente.
- **Recomendación de hito integral:** siguiente bloque M2/CV-005 de **arranque operativo auténtico y controlado** con dos PWA, PostgreSQL, permisos y recuperación, después de conciliar #56; no multiplicar PR o reducir la normativa por escoger el primer smoke.

_Este informe es un **nuevo corte** enlazable desde las matrices históricas y el tablero; preserva intactas las pruebas de 06/09-11 y su estado en el momento en que se ejecutaron._
