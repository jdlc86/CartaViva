# CartaViva / Sabora — continuidad viva para la sesión 16

**Creado:** 31-10-2026. **Naturaleza:** documento de continuidad operativo, **NO NORMATIVO**. **Estado:** vivo; actualizar al cerrar cada hito importante y antes de cambiar de sesión. **Estado de activación:** **NO-GO**.

> **Jerarquía:** la fuente de verdad es la documentación **normativa** vigente en GitHub `jdlc86/CartaViva`. Este handoff, los informes de revisión, planes, comentarios de PR y los mensajes de ChatGPT son subordinados. Si hay contradicción, prevalece la normativa. No inventar ni reinterpretar decisiones funcionales, de seguridad ni visuales.

## 1. Instrucción de arranque para la sesión 16

Continúa el desarrollo de **CartaViva / Sabora** directamente mediante herramientas GitHub, de manera autónoma y con **hitos verticales completos**, no una secuencia indefinida de microcorrecciones. Antes de escribir, consulta el **HEAD real**, PR Draft, commits recientes, Actions y normativa. Este documento es una fotografía que puede quedar obsoleta por commits de otra sesión. No afirmar PASS sin ejecución y evidencia del SHA concreto. Si fallan pruebas, leer logs, corregir y repetir, esperando por shell o consultando Actions sin pedir al usuario aprobaciones de rutina. **No activar Codex ni agentes de GitHub por defecto:** la idea de automatización de agentes quedó aparcada para evitar complejidad adicional.

**Repositorio único autorizado:** `jdlc86/CartaViva`. Se permiten ramas, código, commits, PR Draft y Actions **solo** en ese repositorio. **Prohibidos sin autorización expresa:** merges, despliegues, migraciones o escrituras en Supabase operativo, modificaciones de VPS, reinicios, cambios de contenedores o cualquier operación sobre Fleetia y otros proyectos. El VPS es compartido: Sabora debe ser completamente aislable y nunca afectar a Fleetia. Para pruebas SQL usar PostgreSQL 17 **desechable y aislado**. Sabora corresponde a **un solo restaurante**, con PWA cliente y PWA gestión. Respetar diseño premium, identidad visual y flujos aprobados.

## 2. Primeras lecturas obligatorias (en este orden)

1. Normativa: `docs/REQUISITOS_FUNCIONALES.md` y `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, en particular «Cambio de mesa con consumición activa — decisión funcional 2026-10-30» y «Coordinación de recogida en sala — decisión aprobada (27-10-2026)». Revisar además contratos normativos de QR, identidad/roles, pagos, PWA y diseño visual que sean aplicables. **Verificar existencia y versión reales de cada archivo**.
2. Matriz de ejecución subordinada: `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`, casos F01–F28 y R01–R10.
3. Evidencias: `docs/reviews/SABORA_H6_B2_DELIVERY_PICKUP_BOARD_CANDIDATE_2026-10-31.md` y `docs/reviews/SABORA_TABLE_TRANSFER_B0_ATOMICITY_DEPENDENCIES_2026-10-31.md`.
4. Este handoff, el PR Draft actual y su historial; no usar documentos antiguos como fuente normativa.

## 3. Punto de partida verificable al crear este documento

- PR Draft abierto: **#43**, <https://github.com/jdlc86/CartaViva/pull/43>.
- Rama: `integration/sabora-h6-b2-delivery-board-contract-20261031`.
- Base observada del PR: `integration/sabora-h6-end-to-end-pilot-20261030`.
- HEAD **observado antes de crear este handoff**: `5114938f00e3d24f165df985f7983e195962db61`. **Reconsultar HEAD y CI después del commit que crea este documento**.
- Referencia previa de activación: PR Draft #40, rama `integration/sabora-activation-readiness-20261028`; no confundir su alcance con el PR #43 ni asumir merge.
- Hitos anteriores y evidencias de H1–H6 en la documentación del repositorio. Los resultados de un SHA anterior no certifican un HEAD posterior.
- Última evidencia explícita de CI para compatibilidad H4/H6: SHA `7af20b531339a395850b2a05faa98b7df11a0868`, Sabora CI `41188630375` **SUCCESS** y Bootstrap `41188630379` **SUCCESS**, recogida en el informe H6/B2. Verificar los workflows del HEAD actual antes de continuar.

## 4. Trabajo integrado, con límites claros

**Candidato H6/B2 de tablero y recogida:**
- Tablero autenticado Fastify de cocina/sala con lector PostgreSQL de destino efectivo por línea; muestra B después de un traslado de destino A→B.
- Ciclo `ready → claim` (primero gana), `cancel` (libera), `reclaim`, con versiones e idempotencia; `picked_up` legado no equivale a la semántica aprobada de «Voy a recoger».
- Eventos durables por audiencias `waiter`/`kitchen`, destino B, versión y reconexión SSE HTTP real con `Last-Event-ID`; comprobado en PG17 aislado. Commit `5bfbc9033a00a0f4a4b786ae55b15bf6ece9c61c`, Sabora CI `41187140753` y Bootstrap `41187140749` SUCCESS.
- Regresión negativa de revocación de visita histórica A tras mover el destino de línea a B: HTTP 403, sin cambio de asignación/versión, sin outbox nuevo, sin persistencia idempotente y sin mutación de identidad económica. Commits `b1ef28a` y `16888b9`; no confundir **rechazo seguro** con **traslado funcional**.
- Compatibilidad H4/H6: preflight de función opcional H6 mediante `to_regprocedure` y `COALESCE(...,false)`, con test. SHA `7af20b5` con CI verde.
- Inventario de dependencias y puertas de aceptación: `docs/reviews/SABORA_TABLE_TRANSFER_B0_ATOMICITY_DEPENDENCIES_2026-10-31.md`. Es diseño pendiente de comprobar, no implementación.

**Límites importantes:** el escenario H6/B2 de tablero actualiza la proyección SQL de destino de forma controlada; **por separado**, existen pruebas PG17 de confirmación integrada A→B en la función candidata aislada. Ninguna de esas dos evidencias acredita todavía el recorrido solicitud → aprobación → QR B → primera confirmación → consumo de concesión **desde PWA con runtime habilitado**. Tampoco hay GO de producción ni activación del servidor por defecto.

## 5. Bloqueo central que debe resolver la sesión 16: F12, traslado real y atómico

**Precisión crítica verificada en la sesión 15 (31-10-2026):** ya existe una **función de confirmación de transferencia candidata y aislada**: `sabora.confirm_customer_round_h6_transfer_integration_candidate`, migración `supabase/migrations/20261031010000_sabora_h6_transfer_confirmation_integration_candidate.sql`. **No tiene permiso EXECUTE para el runtime**; la función H6 de producción candidata sigue rechazando el traslado. Por tanto, el trabajo pendiente **no consiste en implementar F12 desde cero**: consiste en auditar y completar la candidata existente, corregir autorización de recogida, demostrar aislamiento y aceptación visual, y solo plantear el cutover cuando todos los contratos estén validados. El fichero `scripts/ci/table-change-root-postgres17.test.mjs` ya incluye pruebas PG17 de confirmación positiva A→B, consumo único, concurrencia, pagos, cadena A→B→C, guardas negativas y rollback. **No repetir ni ignorar esos tests.** Sus nombres no equivalen a habilitación productiva ni a E2E de navegador. Esta precisión sustituye cualquier afirmación anterior de este handoff que sugiera ausencia total de implementación SQL F12.

**Código fuente concreto a inspeccionar antes de modificar:**
- `supabase/migrations/20261030230000_sabora_h6_line_delivery_confirm_lifecycle_candidate.sql`: `sabora.confirm_customer_round_h6_candidate` tiene el guard `table_change_transfer_not_integrated` y después invoca `persist_customer_order_candidate`, selecciona/crea `customer_accounts` por mesa y crea ronda/pago. **No quitar solo el guard:** sin refactor puede generar una **segunda cuenta** y fragmentar cobros.
- `supabase/migrations/20261030160000_sabora_h6_operational_binding_foundation_candidate.sql`: `customer_account_operational_bindings`, `order_round_delivery_destinations`.
- `supabase/migrations/20261030220000_sabora_h6_line_delivery_destination_foundation_candidate.sql`: `order_line_delivery_destinations` y FKs de identidad económica.
- `supabase/migrations/20261030124000_sabora_table_change_candidate.sql` y `20261030190000_sabora_h6_table_change_request_decision_candidate.sql`: concesión sin destino, plazo configurable de solicitud y decisión de camarero.
- `apps/api/src/table-change-postgres-store.mjs`: `applyTransfer` aún falla cerrado; no activar mediante mutación de cuenta parcial.
- `supabase/migrations/20261027190334_sabora_pickup_claim_cancel_candidate.sql`: `manage_pickup_task_h6_candidate` revalida visita de origen A, por lo que **bloquea recogida legítima en B cuando A se revoca**. Corregir con scope operativo vigente y protección contra reocupación, sin ampliar permisos.
- `scripts/ci/order-operations-read-postgres17.test.mjs`: escenario de PG17/Fastify/SSE A→B y prueba negativa de revocación; ampliar a confirmación real y pruebas positivas/negativas de B.
- Revisar migraciones posteriores y composición API antes de reemplazar funciones. **Migraciones aditivas**, nunca reescribir historia aplicada; mantener owners sellados, grants mínimos, RLS, auditoría de migraciones y tests.

**Criterio de hito completo:** confirmar un nuevo pedido en B con QR válido, sesión/visita actual y autorización previamente aprobada, consumiendo **una sola vez** la concesión, manteniendo el mismo `account_id`, historial económico, pagos, saldos y origen de pedidos previos; redirigir **solo líneas pendientes** a B y actualizar versiones/binding dentro de la **misma transacción**. Evitar deadlocks verificando orden real de bloqueos entre solicitud, decisión, persistencia, pagos, cierre y recogida. Idempotencia y reintentos no deben consumir otra concesión ni duplicar cargo, ronda o evento.

**Pruebas obligatorias:** concurrencia de dos confirmaciones, replay, rollback tras fallos, QR revocado, cierre/reocupación de A y B, revocación de sesión/visita, permisos de rol, RLS y aislamiento entre cuentas/comensales, cobro `pay_now`/`pay_at_end`, cocina/sala/SSE con destino correcto, navegador real Playwright/axe/responsive según identidad visual aprobada. Cumplir la matriz normativa F01–F28/R01–R10, o declarar explícitamente cada caso pendiente. No presentar tests unitarios o SQL fixtures como E2E visual.

## 5 bis. Auditoría concreta de la candidata F12 (sesión 15, 31-10-2026)

Lectura directa de `20261031010000_sabora_h6_transfer_confirmation_integration_candidate.sql`: la función aislada **sí** resuelve cuenta abierta y binding, exige aprobación antes de persistir, invoca la persistencia existente, conserva `v_account.id`, crea ronda y destino de líneas, y **consume la concesión dentro de la misma transacción** mediante `consume_customer_table_change_h6_candidate`. Los cobros se generan después de ese consumo, dentro de la misma transacción PostgreSQL, de modo que una excepción posterior debería revertir el conjunto; esta propiedad requiere las pruebas PG17 ya existentes y casos adicionales de fallo. La función está expresamente **sin GRANT EXECUTE para los runtimes** y no sustituye la entrada H6 sellada actual.

**Riesgo preciso a revisar antes de cutover:** el código comprueba la existencia de una aprobación antes de persistir, pero la validación autoritativa y consumo real se hace después de crear pedido y ronda, dentro de la transacción. Verificar que la función consumidora vuelve a comprobar identidad, origen, estado de mesa/QR y unicidad bajo locks; si falla, toda la confirmación debe revertirse. Confirmar además que los replays devuelven ronda histórica sin consumir otra concesión y que no hay conflictos de locks con personal/cierre. La autorización de recogida sigue consultando A en `manage_pickup_task_h6_candidate`; **no** activar F12 hasta resolverla y probar B activa/reocupada.

Esta auditoría no ejecuta PostgreSQL ni acredita un nuevo PASS; es lectura de código y ajuste del punto de partida. El objetivo siguiente sigue siendo **un bloque vertical** de autorización de recogida por destino operativo con pruebas positivas/negativas PG17 y, después, cutover F12 y aceptación E2E, sin multiplicar parches.

## 6. Secuencia recomendada de trabajo

1. Reconciliar normativa, HEAD y PR #43; revisar CI y cambios concurrentes. No duplicar trabajo ya realizado.
2. Elegir **una implementación vertical transaccional completa** de F12 con contrato, SQL, API y pruebas PG17; revisar `persist_customer_order_candidate`, idempotencia, bloqueos y ownership **antes** de editar. Si es necesario dividir, hacerlo por fronteras funcionales verificables, no microparches.
3. Cerrar autorización de recogida post-A en B y revocación/reocupación sin heredar permisos; comprobar outbox/SSE y roles reales.
4. Integrar PWA cliente y sala con flujos y diseño aprobados; Playwright/axe y evidencias visuales.
5. Ejecutar regresión, migración audit, PG17 desechable, GitHub Actions; corregir y relanzar hasta verde; documentar limitaciones reales.
6. Actualizar informe de hito, PR Draft **y este mismo documento de continuidad**, dejando SHA, workflow, PASS/FAIL y bloqueos. Mantener NO-GO mientras falten requisitos o revisión independiente.

## 7. Protocolo de actualización permanente de este handoff

**Este archivo es el punto estable para la sesión 16**. Al completar un hito importante, **editar este mismo archivo** en GitHub, no generar una nueva versión dispersa ni sustituir normativa. Actualizar: fecha, rama/PR/HEAD observado, bloque cerrado, archivos relevantes, evidencia de PG17/Playwright/CI del SHA exacto, restricciones, riesgos y **siguiente acción concreta**. Preservar la historia relevante; marcar superseded cuando cambie una conclusión. Cada commit documental cambia HEAD: verificar sus checks o dejar explícito «pendiente». No confundir «PR abierto», «código implementado», «CI verde» y «GO producción».

### Cambio de código pendiente de aceptación — autorización de recogida por B (31-10-2026)

Se añadió la migración aditiva `20261031110000_sabora_h6_pickup_effective_destination_authorization_candidate.sql` (commit `d034d9b`) que sustituye la comprobación de visita **histórica A** de `manage_pickup_task_h6_candidate` por la combinación de destino efectivo por línea, `customer_account_operational_bindings` vigente, mesa/sesión activa, `ordering_state='open'`, visita actual no revocada y versión QR. Conserva el orden de bloqueo binding → mesa → visita → línea → tarea, la firma HMAC y el resto de la lógica de idempotencia, transición y eventos. Se registró en la auditoría de migraciones (commit `7c5115a`) y se incrementó el total esperado a 65 (commit `51f54f4`).

**IMPORTANTE: CÓDIGO CANDIDATO NO CERTIFICADO.** Faltan resultados de CI/PG17 y una regresión **positiva** que demuestre recogida en B tras revocar A, además de negativos ante revocar/reocupar B, QR cambiado y binding desalineado. No habilitar F12 ni declarar GO solo por esta migración. Revisar los locks y privilegios reales en PostgreSQL antes de aceptar. El documento se actualiza mientras seguimos en sesión 15.

### Pruebas PG17 del nuevo alcance de recogida — en validación

Los primeros CI de la migración `20261031110000` mostraron una **regresión real**, no un cierre: el fixture integrado `integratedFixture` no creaba `customer_account_operational_bindings` y el escenario B2 simulaba mover el destino de línea a B sin crear visita B ni actualizar binding. Con la nueva autorización, esas acciones reciben HTTP 403. Se corrigió el fixture base para incluir binding (`ae857528`) y se amplió el escenario Fastify/PG17 para crear ocupación B, verificar **cancelación positiva en B después de revocar A**, y **rechazo en B después de revocar B** sin efectos parciales (`e86ba57e`). La expectativa de outbox pasa a 10 tras la cancelación positiva.

**Evidencia de fallo:** Sabora CI `41189585019` y `41189613226` fallaron en el bloque PG17/Chromium (HTTP 403 en lugar de 200; dos reclamaciones 403 en vez de 200/409). **No son pruebas superadas**. Los commits de corrección requieren nuevo CI sobre HEAD y revisión de cualquier fallo de privilegios, bloqueo o fixtures; verificar antes de continuar. No desactivar controles de seguridad para hacer pasar tests.

### Hito técnico validado: autorización de recogida B tras cierre de A

**Evidencia nueva:** SHA `e86ba57e0461390a78c14c21ab0cfc358c0342ab`, **Sabora CI SUCCESS** (run `41189844286`) y **Bootstrap SUCCESS** (run `41189844344`). El escenario integrado PG17/Fastify confirma destino B, concurrencia de camareros, idempotencia, eventos por destino, SSE, recogida/cancelación positiva tras revocar A y denegación sin efectos tras revocar B. También se ejecutan los bloques de regresión incluidos en el workflow. Los fallos anteriores de fixtures quedaron superados en este SHA. El commit documental posterior `6dd4d85` estaba en ejecución al realizar esta comprobación; **consultar su estado y el HEAD vigente**.

**Límites del PASS:** es un escenario integrado con destino A→B configurado por fixture, **no** el cutover runtime de la función de confirmación de transferencia F12 ni un recorrido completo de PWA de solicitud/aprobación/QR/primer pedido. Mantener **NO-GO producción** y continuar con pruebas de reocupación de B, carrera entre traslado y recogida, roles/RLS, integración F12 y aceptación visual.

### Reocupación de B y rotación QR — prueba integrada añadida

Commit `67c9ad3`: extensión del escenario real Fastify + PG17 `PG17 H6/B2 authenticated Fastify board reflects A-to-B...` para rotar `session_id` y `qr_version` de la mesa B **después de cerrar su visita** y comprobar que el intento de pickup devuelve 403, sin alterar la tarea, insertar solicitud idempotente ni emitir eventos. Se mantiene la cuenta histórica y el destino de la línea sin reescribir. **Resultado del nuevo commit pendiente de CI; no confundir con el PASS anterior `e86ba57e`.** También constan PASS Sabora CI `41189890385` y Bootstrap `41189890332` sobre `6dd4d85`.

### Evidencia de reocupación B y rotación QR (31-10-2026)

El test PG17/Fastify de **reocupación B** en `67c9ad3be9059d5760da92e23ee7ec711cc5876e` está **validado**: Sabora CI `41190272680` SUCCESS y Bootstrap `41190272726` SUCCESS. El commit documental `5f7347e` también tiene Sabora CI `41190303881` SUCCESS y Bootstrap `41190303883` SUCCESS.

Se añadió en `c4f5bfc67f928f59dedfde37f6fe55ac307c16e4` una **prueba separada** de rotación del QR B mientras la visita y sesión siguen activas; debe responder 403 sin mutar tarea ni crear idempotencia. La prueba restaura la versión QR **solo dentro del fixture aislado** antes de ejecutar las comprobaciones de revocación y reocupación posteriores. **CI de `c4f5bfc` en curso al registrar este hito; no atribuirle PASS todavía.**

La evidencia sigue siendo del tablero/recogida con proyección A→B de fixture. No valida la activación de confirmación transaccional F12 desde PWA. Mantener NO-GO.

### Cobertura negativa independiente: QR y binding (31-10-2026)

**Rotación QR B con visita aún activa:** commit `c4f5bfc`, Sabora CI `41190462513` **SUCCESS**, Bootstrap `41190462507` **SUCCESS**. Verifica denegación 403 por QR rotado sin cambiar la sesión ni revocar la visita.

**Binding económico-operativo desalineado con B, aun con QR B válido:** commit `e98452d`, nueva regresión PG17/Fastify que mueve temporalmente el binding de la cuenta a A mientras el destino por línea sigue en B, exige 403 sin cambiar tarea ni crear idempotencia y restablece binding B dentro del fixture aislado. **Nuevo CI pendiente**. Esto separa el control de binding del control QR y de la revocación de visita; no se habilita todavía la confirmación F12 real.

### Reocupación real de B por un segundo cliente (31-10-2026)

La prueba inicial de reocupación rotaba sesión/QR, pero **no creaba una visita activa del segundo ocupante**. Esa diferencia importa: una mesa vacía tras el cierre no equivale a una mesa realmente reocupada. El commit `03b2d61` completa el fixture con **otro perfil de cliente**, visita válida bajo la **nueva sesión B** y `authorized_qr_version=2`, y vuelve a exigir que la tarea del ocupante anterior sea 403 sin mutaciones, idempotencia ni eventos. **Este nuevo escenario todavía requiere CI propio**; los PASS previos cubren la versión más débil. Además, `e98452d` cubre el binding desalineado pendiente de su CI.

**Siguiente hito funcional prioritario:** dejar de multiplicar negativas aisladas y cerrar integración de `confirm_customer_round_h6_transfer_integration_candidate` con la entrada runtime bajo autorización y pruebas de flujo completo (solicitud, decisión, QR B, primera confirmación, cuenta/pagos y entrega), sin dar GRANT a producción ni modificar Supabase operativo. Revisar específicamente replay del pedido A tras transferencia y carreras con cierre de cuenta.

### Registro vivo de hitos

| Fecha | Hito / cambio | SHA / evidencia | Estado |
| --- | --- | --- | --- |
| 31-10-2026 | H6/B2 lector de destino, recogida concurrente y SSE real A→B | `5bfbc903`; CI `41187140753` y Bootstrap `41187140749` | PASS técnico aislado; **NO-GO** traslado F12 |
| 31-10-2026 | Revocación A rechazada sin efectos parciales | `b1ef28a`, `16888b9` | Regresión negativa; **NO-GO** recogida positiva en B |
| 31-10-2026 | Preflight H4 compatible con RPC H6 opcional | `7af20b5`; CI `41188630375`, Bootstrap `41188630379` | PASS focalizado |
| 31-10-2026 | Inventario F12 y puertas de cierre | `65b34ec` | Documentado; implementación pendiente |
| 31-10-2026 | Creación de handoff vivo sesión 16 | `14a48f845ad0d816f79a92eda157e58ab36c1dca` | Documento de continuidad, no normativa |\n| 31-10-2026 | Recogida B válida tras revocar A y bloqueada tras revocar B, Fastify/PG17/SSE | `e86ba57e`; CI `41189844286` SUCCESS; Bootstrap `41189844344` SUCCESS | **PASS técnico aislado**, NO-GO F12 runtime |\n| 31-10-2026 | Autorización de recogida por destino efectivo B: migración y auditoría (CI/PG17 pendiente) | `d034d9b`, `7c5115a`, `51f54f4` | Implementado candidato; **NO-GO** hasta pruebas |\n| 31-10-2026 | Reconciliación: F12 ya dispone de RPC aislada y pruebas PG17, sin grant runtime | `20261031010000`, `table-change-root-postgres17.test.mjs` | Implementación candidata parcial; NO-GO cutover |

## 8. Prompt corto para iniciar la sesión 16

> Continúa autónomamente CartaViva/Sabora en **`jdlc86/CartaViva`**. Lee primero la **normativa GitHub** y luego **`docs/handoffs/SESSION_16_HANDOFF_2026-10-31.md`**; verifica HEAD, PR Draft #43 y CI actuales. Prioriza cerrar **F12: traslado A→B transaccional con cuenta económica única, concesión consumida una vez, entrega pendiente y recogida segura**, seguido de E2E visual. Implementa bloques completos, PG17 aislado, pruebas/CI con esperas y correcciones autónomas; actualiza documentación, PR y **este mismo handoff** al lograr hitos. **Sin merges, despliegues, Supabase operativo, VPS ni tocar Fleetia**. No declares GO sin evidencias.

**Nota final:** el handoff no autoriza operaciones adicionales ni cambia contratos. La sesión 16 debe contrastar cualquier diferencia con la normativa actual antes de actuar.
