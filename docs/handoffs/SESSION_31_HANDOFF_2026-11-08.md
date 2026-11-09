# Sabora / CartaViva — continuidad operativa de la sesión 31 (2026-11-08)

> **DOCUMENTO DE CONTINUIDAD, NO FUENTE NORMATIVA, APROBACIÓN TÉCNICA, ACEPTACIÓN VISUAL NI AUTORIZACIÓN DE PRODUCCIÓN.** Preparado al cerrar la revisión formal de la sesión 30. Los documentos normativos de GitHub prevalecen; comprobar el estado real de ramas/CI antes de actuar. Un resultado correcto acredita solo el escenario y el SHA que realmente se ejecutaron.
>
> **Tablero vivo del proyecto:** [SABORA_LIVE_PROJECT_TRACKER](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), especialmente §§58–59. **Continuidad anterior:** [sesión 30](SESSION_30_HANDOFF_2026-11-08.md), especialmente §§8–10. **Revisión formal de la que parte esta sesión:** [revisión #5819709942 del PR #52](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5819709942). **Matriz H6:** [F01–F28 / R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md).

## Estado vigente verificado — 09-11-2026 (leer antes de los hitos históricos)

Esta instantánea **sustituye las fotografías de partida** de §§2–4 y los estados provisionales de §§7, 9, 11, 13 y 14 exclusivamente en cuanto a implementación/CI; se preservan esos apartados por trazabilidad. **No modifica los documentos normativos.**

- **PR:** [#52 — gobierno de titularidad](https://github.com/jdlc86/CartaViva/pull/52), abierto, **Draft**, no fusionado ni desplegado; se apoya en #51 y #50, también Draft según la comprobación anterior. El código de producción/Supabase operativo, VPS y Fleetia no se ha modificado.
- **Último commit de código funcional realmente probado:** [`12c2371e6899811fe56416eed089f2a29d2fa0ba`](https://github.com/jdlc86/CartaViva/commit/12c2371e6899811fe56416eed089f2a29d2fa0ba). **6/6 workflows `completed/success`** del mismo commit: [Bootstrap PG17 #42537660195](https://github.com/jdlc86/CartaViva/actions/runs/42537660195), [H6 #42537660214](https://github.com/jdlc86/CartaViva/actions/runs/42537660214), [cliente #42537660140](https://github.com/jdlc86/CartaViva/actions/runs/42537660140), [gestión #42537660201](https://github.com/jdlc86/CartaViva/actions/runs/42537660201), [CV-012 #42537660268](https://github.com/jdlc86/CartaViva/actions/runs/42537660268) y [funcional↔UI #42537660110](https://github.com/jdlc86/CartaViva/actions/runs/42537660110).
- **RF-01 y RF-02:** corregidos en código y **validados mediante recorrido automatizado integrado** PostgreSQL 17 + JWT/HMAC + Fastify + Chromium (escenario titularidad **1/1 PASS**; H6 bloques **1/2A/2B PASS**). RF-01 conserva ADMIN activo legacy como elegible en oferta y recuperación ROOT, mostrando ID completo cuando falta ficha visual. RF-02 rechaza la capacidad HMAC expirada durante una espera real de bloqueo de fila, sin propuesta, auditoría, notificación ni transferencia. Detalle y evidencia: **§§14–15** y [tablero §§68–69](../tracking/SABORA_LIVE_PROJECT_TRACKER.md).
- **Semántica normativa que no se altera:** al pulsar **Solicitar titularidad**, el servidor resuelve al ADMIN titular actual como destinatario; el solicitante no lo elige. ROOT solamente gobierna la recuperación excepcional, no adquiere escritura ordinaria. RV-03 fue retirado como bloqueo contractual.
- **Cuarta revisión formal ya emitida:** [#5820453799](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5820453799) — **SIN NUEVOS BLOQUEOS DEMOSTRADOS, CANDIDATO TÉCNICAMENTE VALIDADO PARA REVISIÓN INDEPENDIENTE**. El evento real GitHub es `COMMENTED` por la misma cuenta autora, no `APPROVE`. La siguiente puerta es la **revisión y decisión expresa de un revisor independiente**. **No cerrar ni fusionar el PR por tener CI verde.** F28/R09 visual humana, M4 Stripe real, M6 operación y funcionalidades CV-014 aún pendientes según normas/tablero; sin GO productivo.
- **HEAD documental al preparar esta actualización:** `293d3af58e79a41514aa4756dce5f8a13f471877`. Entre este HEAD y el commit funcional únicamente habían cambiado `docs/handoffs/SESSION_31_HANDOFF_2026-11-08.md` y `docs/tracking/SABORA_LIVE_PROJECT_TRACKER.md`. Esta actualización es otra edición **documental `[skip ci]`** y no requiere atribuirle un CI nuevo.

## 1. Qué debe leer la sesión 31 antes de intervenir

**Normativa de requisitos y flujos (no reinterpretar desde esta continuidad):**

- [REQUISITOS_FUNCIONALES](../REQUISITOS_FUNCIONALES.md) y [contrato funcional consolidado](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md): un Sabora = un restaurante; preservar deudas individuales, tercero pagador identificado, devolución al pagador/medio original, idempotencia, pagos, caja y cambio de mesa.
- [Contrato de diseño](../DESIGN_SYSTEM_CONTRACT.md), [auditoría visual aprobada](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md), [requisitos visuales](../design/DESIGN_REQUIREMENTS_V1.md) y [trazabilidad funcional ↔ PWA](../design/FUNCTIONAL_UI_COVERAGE.json). El aspecto de pruebas y cualquier maqueta no equivalen a aprobación humana. Preservar la banda de anuncios y los flujos aprobados.
- [ROOT/ADMIN escritor único](../architecture/SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md), [titularidad ADMIN, incluida la rectificación vinculante 20-10](../security/ADMIN_WRITE_OWNERSHIP_V1.md), [operaciones de solicitud/cesión/recuperación](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md), [matriz administrativa](../security/SABORA_ADMIN_RESOURCE_PERMISSION_MATRIX.md), [identidad SQL](../security/SABORA_SQL_ADMIN_IDENTITY_CONTRACT.md) y [puerta de autorización](../SABORA_AUTHORIZATION_GATE.md).
- [Hoja de ruta y aislamiento](../architecture/SABORA_TECHNICAL_ROADMAP_INFRASTRUCTURE_V1.md), [dos PWA independientes](../architecture/CARTAVIVA_DIRECTORY_INDEPENDENT_PWAS.md), [aislamiento respecto a Fleetia](../security/CARTAVIVA_FLEETIA_ISOLATION_AUDIT_20261025.md).

**Jerarquía:** decisión expresa y normativa vinculante > criterios de aceptación > evidencia de código y pruebas del SHA > seguimiento/informes > continuidades. Los informes [candidato de gobierno](../reviews/SABORA_ADMIN_OWNERSHIP_GOVERNANCE_INTEGRAL_CANDIDATE_2026-11-08.md) y [auditoría de seguridad SEC-01–04](../reviews/SABORA_ADMIN_OWNERSHIP_INDEPENDENT_SECURITY_AUDIT_2026-11-08.md) documentan evidencias, **no crean normas**.

## 2. Fotografía de GitHub al preparar la sesión — 08-11-2026

Repositorio **único autorizado**: [jdlc86/CartaViva](https://github.com/jdlc86/CartaViva). Cadena de PR **abiertos, Draft y SIN FUSIONAR**:

| PR | Alcance | Base → rama |
| --- | --- | --- |
| [#50](https://github.com/jdlc86/CartaViva/pull/50) | Correspondencia funcional ↔ UI / aceptación visual diferida | `feat/sabora-cv012-independent-pwas-20261106` → `feat/sabora-visual-contract-governance-20261107` |
| [#51](https://github.com/jdlc86/CartaViva/pull/51) | CV-014 comunicaciones/M3/M5 | rama #50 → `feat/sabora-cv014-communications-full-flow-20261108` |
| [#52](https://github.com/jdlc86/CartaViva/pull/52) | Gobierno titularidad ADMIN, revisión de seguridad | rama #51 → `feat/sabora-admin-ownership-end-to-end-20261108` |

- **Último SHA funcional probado:** [`d7dfa98307fcf7bc9b2d41bf91c63c9ca620d7f1`](https://github.com/jdlc86/CartaViva/commit/d7dfa98307fcf7bc9b2d41bf91c63c9ca620d7f1), con **6/6 workflows completed/success**.
- **HEAD comprobado antes de crear esta continuidad:** `c2685bea378b60b299d66aacac8f9e65a429d03d`. Comparación `d7dfa983...HEAD`: **cuatro commits posteriores que solo cambian documentación**, sin nuevas modificaciones de código ejecutable. **La creación/enlace de esta sesión 31 añade documentación, no implica nuevas pruebas.**
- **Resultado de revisión formal en GitHub:** [#5819709942](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5819709942), estado real `COMMENTED`, veredicto motivado **CAMBIOS REQUERIDOS / NO APROBADO**. La conexión usada pertenece a quien abrió el PR; **no existe aprobación independiente de otro revisor**. Nunca interpretar el texto del comentario como evento GitHub `REQUEST_CHANGES` o `APPROVE`.

**Evidencia funcional válida para SEC-01–SEC-04, no para RV-01/RV-02:**

| Workflow del SHA `d7dfa983` | Evidencia |
| --- | --- |
| Bootstrap PostgreSQL 17, identidades SQL, JWT/HMAC/Fastify/Chromium de gobierno y regresiones de firmas nulas | [42521463148](https://github.com/jdlc86/CartaViva/actions/runs/42521463148) — SUCCESS |
| H6 integral, bloques 1/2A/2B, RLS, concurrencia y Chromium | [42521463167](https://github.com/jdlc86/CartaViva/actions/runs/42521463167) — SUCCESS |
| CV-012, instalación y separación de las dos PWA | [42521463163](https://github.com/jdlc86/CartaViva/actions/runs/42521463163) — SUCCESS |
| PWA gestión, Chromium | [42521463175](https://github.com/jdlc86/CartaViva/actions/runs/42521463175) — SUCCESS |
| PWA cliente, Chromium | [42521463189](https://github.com/jdlc86/CartaViva/actions/runs/42521463189) — SUCCESS |
| Cobertura funcional ↔ UI | [42521463203](https://github.com/jdlc86/CartaViva/actions/runs/42521463203) — SUCCESS; **la aceptación visual final no fue ejecutada/aprobada** |

Se inspeccionaron logs de Bootstrap y H6: pruebas PostgreSQL 17 de firmas nulas, gobierno firmado, bloqueo de ROOT en escritura ordinaria, cesión, ROOT forzoso y H6 pasaron. **No se ha probado ni corregido aún RV-01/RV-02.** Los commits `[skip ci]` no trasladan pruebas a otro SHA.

## 3. Estado del hito ADMIN: lo conseguido frente a lo pendiente

**Implementación candidata presente (PR #52):** varios ADMIN permitidos, como máximo un ADMIN activo titular de escritura administrativa; ADMIN no titular solicita, titular ofrece, actor legitimado acepta/rechaza/cancela; ROOT **solo gobierna** la recuperación/reasignación forzosa a ADMIN activo con motivo y auditoría, **no ocupa titularidad ni escribe configuración ordinaria**. Revalidación durable y transaccional, SQL mínimo con FORCE RLS, HMAC, JWT en API, logs de auditoría, notificaciones durables consultables por actualización, pantalla real de Equipo y denegación del propietario anterior tras transferir. Rutas y PWA siguen **opt-in**; `server.mjs` habitual health-only, sin activación operativa.

**SEC-01 a SEC-04: corregidos técnicamente y probados en el SHA `d7dfa983`**. Ataque HTTP real, pentest externo o operación productiva **no acreditados**. La revisión formal posterior encontró DOS NUEVOS defectos bloqueantes:

### RV-01 (alto) — aislamiento de identidad en cambio de sesión

- **Evidencia:** en [`apps/management/src/main.tsx`](../../apps/management/src/main.tsx), `mountAuthenticatedManagementApp` crea gateways operativo, M3 y titularidad, pero `managementSessionFence.replace(operationsGateway)` registra/revoca automáticamente solo el primero. El disposer tardío de la sesión anterior es quien revoca los otros. En [`ownership-governance-gateway.js`](../../apps/management/src/ownership-governance-gateway.js), la lógica de `revoke()`/epoch no bloquea la operación mientras ese método no se haya llamado.
- **Riesgo en alcance:** sustitución de sesión A→B sin ejecutar antes el disposer de A puede dejar trabajo asíncrono de A vivo en los otros gateways. Las firmas/roles SQL son defensa adicional, no sustituyen el cierre de la sesión local.
- **Cierre exigido:** revocación/cercado coordinado de todos los canales al reemplazar identidad, sin que un disposer antiguo afecte a B; prueba **integrada** con dos identidades, token diferido y acción pendiente en la PWA real contra el backend autorizado, sin pérdidas de seguridad ni reuso de proyecciones de A.

### RV-02 (alto) — selección inequívoca del destinatario de cesión/recuperación

- **Evidencia:** [`OwnershipPanel.tsx`](../../apps/management/src/views/OwnershipPanel.tsx) muestra al ADMIN elegible solo como sufijo `…UUID`, proveniente de la proyección SQL de la migración [`20261108150000`](../../supabase/migrations/20261108150000_sabora_admin_ownership_governance_rpc_candidate.sql).
- **Riesgo:** el titular o ROOT podría transferir el único permiso administrativo a un ADMIN equivocado por falta de una identidad reconocible en la selección.
- **Cierre exigido:** determinar **primero** en la normativa/datos del directorio cuál es el identificador humano autorizado (sin inventar permisos ni acceso a datos ajenos); incorporar proyección acotada y selección clara en PWA real, con confirmación vinculada al usuario elegido si así lo exigen los contratos existentes. Acreditar cesión normal y reasignación ROOT en Chromium y PostgreSQL 17, incluyendo controles negativos de divulgación.

**Estas dos incidencias son el siguiente hito indivisible.** No rebajar severidad por tener CI anterior verde, ni abrir una colección de micropruebas sin completar el recorrido operativo.

## 4. Secuencia de trabajo exigida para la sesión 31

1. **Revalidar GitHub y contratos** al arrancar: HEAD del PR #52, base apilada, revisión #5819709942, normativa actual, matriz, diseño aprobado y estado de checks; revisar si alguien ya corrigió RV-01 o RV-02 antes de escribir. No tocar otros repositorios.
2. **Cerrar RV-01 + RV-02 como un bloque integral en PR #52**: frontera de sesión de todos los gateways; identidad del destinatario desde una fuente permitida; recorrido completo de solicitud/cesión/rechazo/cancelación/force con pérdida de autorización anterior, concurrencia, auditoría y notificaciones, sin cambiar semántica ROOT ni conceder accesos SQL genéricos.
3. **Validación integrada del nuevo SHA funcional:** PostgreSQL 17 **desechable** + identidades SQL mínimas + JWT/HMAC + Fastify + Chromium PWA Gestión con A→B, acciones asíncronas, elección inequívoca de destinatario (titular/ROOT), reintentos y denegaciones. Repetir la regresión H6 y los **seis workflows** vinculados exactamente al SHA final; corregir causas y relanzar el conjunto necesario sin quitar aserciones ni sustituir pruebas de integración por tests pequeños. Distinguir implementado / ejecutado / validado.
4. **Nueva revisión formal y cierre documental:** contrastar código/SQL/CI con las dos observaciones; resolver únicamente si hay evidencia, actualizar [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), esta continuidad y comentario/revisión de PR. Si se requiere aprobación de un tercero, no atribuirla a la misma cuenta autora. **Nunca fusionar ni desplegar por tener CI verde**; pedir autorización expresa para esas acciones.
5. Tras RV-01/02 y la revisión, volver a priorización normativa de hitos pendientes; no cerrar reservas, pagos ni aceptación visual por asociación.

## 5. Resto del proyecto: NO-GO que la sesión 31 debe preservar

- **CV-014:** comunicaciones/anuncios constituyen candidatura técnica integrada; **reservas anticipadas** y **«llamar camarero»** siguen pendientes según [sesión 30](SESSION_30_HANDOFF_2026-11-08.md) y tablero; antes de un nuevo bloque comprobar implementación y contratos.
- **M4 económico:** la evidencia existente no demuestra Stripe sandbox real, captura, refund bancario ni liquidación física. Preservar identidad del pagador tercero y reembolso a esa persona y medio, sin duplicar deuda.
- **F28/R09 y diseño premium:** aceptación visual HUMANA de PWA real pendiente; capturas automáticas, pruebas de accesibilidad y mockups no sustituyen la imagen y flujos aprobados. No mostrar propuesta gráfica como pantalla realmente ejecutada.
- **M6 producción:** secretos/propietarios, roles operativos, origen/dominios, bootstrap y rollback, observabilidad/recuperación, Stripe real/sandbox según puerta, aislamiento del VPS y autorización de despliegue pendientes.
- **PR #50/#51/#52:** todavía Draft y apilados; no están en `main`. La rama `main` fue observada como **no protegida**; no asumir bloqueos técnicos de merge ni modificar reglas sin indicación del usuario.

## 6. Límites permanentes y política de evidencias

- Autorizadas actuaciones de desarrollo, commits, PR Draft y CI **exclusivamente** en `jdlc86/CartaViva`. **Ningún merge, despliegue, reinicio, eliminación o migración productiva sin autorización expresa.**
- **No tocar Fleetia**, ni código, contenedores, redes, volúmenes, credenciales o cualquier recurso de su VPS compartido; Sabora no puede depender del ciclo de vida de Fleetia. No acceder/alterar el Supabase operativo `byhvmumqivmunkmomhup.supabase.co` para validar candidatos; usar PG17 aislado.
- No ampliar permisos administrativos a ROOT, cocina, camareros o clientes. Comprobar siempre rol/estado durable, único ADMIN titular, SQL/RLS y firmas dentro de la transacción; no confiar en JWT obsoleto ni controles visuales.
- Cerrar **hitos completos**. Pruebas focalizadas solo si diagnostican un fallo concreto o protegen una invariante crítica; aceptación mediante pruebas **integradoras** y evidencia del mismo commit.
- Registrar únicamente hitos relevantes y para cada uno: ruta + SHA, alcance implementado, pruebas efectivamente ejecutadas con run IDs, funcionalidades validadas y limitaciones abiertas. Si CI está pendiente, decirlo expresamente.

**Punto de arranque inequívoco:** revisión formal #5819709942 sobre PR #52 **no aprobada por RV-01 y RV-02**; último funcional validado `d7dfa983`, seis workflows correctos *solo para las correcciones anteriores*; preparar cierre íntegro de ambas observaciones antes de plantear aprobación/merge.

**Navegación:** [tablero vivo](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) · [sesión 30](SESSION_30_HANDOFF_2026-11-08.md) · [PR #52](https://github.com/jdlc86/CartaViva/pull/52) · [revisión #5819709942](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5819709942).

## 7. Sesión 31 — implementación candidata RV-01 y RV-02, bajo CI

**Commit funcional:** [`1dcd7c9199c6a0d8323f778f62499b77a392f5f1`](https://github.com/jdlc86/CartaViva/commit/1dcd7c9199c6a0d8323f778f62499b77a392f5f1). Se modificaron **nueve archivos** del PR #52, sin fusionar ni desplegar:

- **RV-01:** `main.tsx` registra un único `sessionChannel` que revoca en conjunto `operationsGateway`, `m3Gateway` y `ownershipGateway` cuando otra identidad lo sustituye; el último gateway usa también `AbortController` y epoch. Se añadió regresión de cercado a la suite de gestión.
- **RV-02:** migración **incremental** `20261108180000_sabora_ownership_eligible_admin_identity_candidate.sql` aporta al RPC firmado existente solo nombre, apellidos y código operativo del ADMIN activo, desde `staff_enrollments` y política SELECT restringida al propietario SQL sellado; no concede SQL directo a runtime, no divulga email, no altera mutaciones, contratos ni migraciones históricas. `OwnershipPanel.tsx` excluye destinatarios sin identidad acreditada de la selección.
- **Recorrido integrado ampliado:** `ownership-governance-postgres17.test.mjs` genera personal real de fixture en PostgreSQL 17, verifica los destinatarios identificables, cesión y reasignación ROOT, ausencia de divulgación de email, sustitución A→ROOT con petición de credencial pendiente, rechazo de POST antiguo y disposer tardío sin revocar ROOT.
- Registro de migración actualizado en `scripts/ci/migration-audit.mjs`. La migración sigue siendo **candidata**; no se aplicó en Supabase operativo.

**Estado de CI en esta anotación: en ejecución; NO atribuir éxito a RV-01/RV-02 todavía.** Workflows del nuevo SHA: [Bootstrap PG17 #42526384882](https://github.com/jdlc86/CartaViva/actions/runs/42526384882), [H6 #42526384924](https://github.com/jdlc86/CartaViva/actions/runs/42526384924), [CV-012 #42526384885](https://github.com/jdlc86/CartaViva/actions/runs/42526384885), [gestión Chromium #42526384961](https://github.com/jdlc86/CartaViva/actions/runs/42526384961), [cliente Chromium #42526384972](https://github.com/jdlc86/CartaViva/actions/runs/42526384972) y [funcional↔UI #42526384955](https://github.com/jdlc86/CartaViva/actions/runs/42526384955). No trasladar 6/6 del SHA anterior; comprobar/corregir y repetir la batería completa si alguna ejecución falla.

PR #52 **Draft / NO-GO**, revisión [#5819709942](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5819709942) aún sin nueva aprobación. Permanecen F28/R09, M4 Stripe real, CV-014 reservas/llamar camarero y M6. No se han tocado Fleetia, VPS ni Supabase operativo.

## 8. Resultado final CI RV-01/RV-02: 6/6 success sobre un único SHA funcional — 08-11-2026

**Cierre de la ejecución que estaba pendiente en §7.** SHA funcional [`1dcd7c9199c6a0d8323f778f62499b77a392f5f1`](https://github.com/jdlc86/CartaViva/commit/1dcd7c9199c6a0d8323f778f62499b77a392f5f1) terminó con **6/6 workflows GitHub Actions `completed/success`**, verificados directamente, sin reutilizar resultados del SHA anterior:

- [Bootstrap PG17 + migraciones y regresión JWT/HMAC/Fastify/Chromium titularidad #42526384882](https://github.com/jdlc86/CartaViva/actions/runs/42526384882): **SUCCESS**; logs de job `generate-lockfile`, test real `PG17 JWT/HMAC Fastify and management Chromium: ownership requests, transfer, ROOT force and stale writer denial` **1/1 PASS, 0 FAIL**. Incluye RV-01 (cambio A→ROOT y operación diferida) y RV-02 (identidad humana de destinatario y ausencia de divulgación de email).
- [H6 integral #42526384924](https://github.com/jdlc86/CartaViva/actions/runs/42526384924): **SUCCESS**; job `validate`, regresión consolidada sobre el mismo SHA.
- [Instalación separada dos PWA #42526384885](https://github.com/jdlc86/CartaViva/actions/runs/42526384885): **SUCCESS**.
- [Chromium PWA gestión #42526384961](https://github.com/jdlc86/CartaViva/actions/runs/42526384961): **SUCCESS**.
- [Chromium PWA cliente #42526384972](https://github.com/jdlc86/CartaViva/actions/runs/42526384972): **SUCCESS**.
- [Puerta funcional ↔ UI #42526384955](https://github.com/jdlc86/CartaViva/actions/runs/42526384955): **SUCCESS**. La aceptación visual final explícita sigue diferida, no se convierte en aprobación humana.

**Distinción:** RV-01/RV-02 están **implementados y pasan la validación automatizada integral** de los escenarios indicados. La revisión formal anterior [#5819709942](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5819709942) permanece `COMMENTED`, no es una nueva aprobación `APPROVE`, y no acredita revisión externa ni pentest. Para cerrar la puerta formal falta cotejo de código frente a la revisión y registro de su resultado, sin fusión implícita.

**HEAD documental al comprobar:** `d7f2b60b0fe3fb57e481578c3b4209a7d7f44e9c`, dos commits posteriores al SHA funcional, únicamente en este handoff y tablero. Este nuevo registro `[skip ci]` tampoco es un SHA funcional probado. PR #52 sigue abierto Draft, no fusionado. No se tocó Supabase operativo, Fleetia ni el VPS; M4, M6, CV-014 restante y F28/R09 siguen NO-GO.

## 9. Segunda revisión formal PR #52: CI 6/6 confirmado, dos nuevos hallazgos — 08-11-2026

**Evidencia inalterada:** commit funcional `1dcd7c9199c6a0d8323f778f62499b77a392f5f1` terminó con los **6/6 workflows SUCCESS** detallados en §8. La aceptación visual final de `functional-ui-gate` fue **SKIPPED**, no aprobada. No se han ejecutado pruebas nuevas tras este SHA para los hallazgos descritos a continuación.

**Segunda revisión GitHub:** [#5819882152](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5819882152), enviada como `COMMENTED` por la misma cuenta autora del PR, con dictamen técnico **CAMBIOS REQUERIDOS / NO APROBADO**. La revisión inicial [#5819709942](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5819709942) detectó RV-01/RV-02. Se reconoce su mejora y el E2E positivo, pero **el cierre formal sigue bloqueado**:

- **RV-03 (alto), solicitud entrante de ADMIN sin identidad visual acreditada:** `OwnershipPanel.tsx` filtra `selectable` para `offer` y `force`, pero no deshabilita `Aceptar` para una propuesta `request` cuyo solicitante `p.toOwnerId` se muestre como `Identidad no acreditada`. La proyección con `LEFT JOIN staff_enrollments` puede devolver nombre/código NULL y el RPC permite aceptar a un ADMIN activo aunque no exista ficha operativa legible. Se podría transferir al receptor no identificable para el humano. **El test E2E actual solo sembró tres ADMIN con ficha completa.** Corregir fail-closed de decisión con una vía legítima para perfiles legacy según normativa; validar explícitamente ausencia de aceptación/traspaso cuando falte identidad y éxito posterior tras identificación.
- **RV-04 (medio), resultado tardío del gateway de titularidad:** `ownership-governance-gateway.js` coteja `revoked/epoch` tras `fetchImpl` pero no tras `response.json()`. Un transporte que ignore AbortSignal podría entregar un resultado viejo después de la revocación de sesión mientras se decodifica. **Riesgo defensivo, no explotación demostrada.** Añadir última comprobación tras parse y cubrir transición A→B con respuesta diferida.

**Siguiente hito integral:** corregir RV-03 + RV-04 sin ampliar privilegios, completar el recorrido PG17 real + JWT/HMAC + Fastify + Chromium con ADMIN activo sin inscripción válida / respuesta JSON diferida, y repetir H6 y 6 workflows del mismo nuevo SHA. Después reabrir revisión formal; no autoaprobar. PR #52 Draft, no merge ni despliegue; preservar F28/R09, M4, M6, aislamiento Fleetia/VPS/Supabase operativo.

**Nota histórica:** el §7 decía CI pendiente y el §8 lo actualiza con CI 6/6; este §9 añade el dictamen posterior sin anular las pruebas ya ejecutadas. Los commits de seguimiento `[skip ci]` no equivalen a nueva validación.

## 10. Rectificación normativa de RV-03: el servidor enruta la solicitud — 08-11-2026

La precisión del propietario motivó una comprobación estricta de la **fuente normativa**, no un cambio inventado en el protocolo. **Contrato obligatorio:** [`ADMIN_WRITE_OWNERSHIP_V1.md`](../security/ADMIN_WRITE_OWNERSHIP_V1.md), «Operaciones de titularidad» punto 1: la solicitud se dirige **automáticamente desde el servidor** al ADMIN titular vigente; el ADMIN solicitante no elige destinatario. [`SABORA_OWNERSHIP_OPERATION_CONTRACT.md`](../security/SABORA_OWNERSHIP_OPERATION_CONTRACT.md): en `request` el titular actual es decisor, el ADMIN solicitante es el posible nuevo titular.

**SQL verificado, migración `20261108180000`:** `request` rechaza `targetUserId` informado, bloquea el singleton `FOR UPDATE`, resuelve `v_from=v_owner` y `v_to=v_actor`; al aceptar, comprueba el estado de la propuesta, propietario vigente y ADMIN activo beneficiario. La PWA llama a `perform('request')` sin elegir destinatario. No hay defecto acreditado de enrutamiento de solicitudes.

**Rectificación formal en GitHub:** [comentario de revisión #5820055796](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5820055796). **RV-03 queda DESCARTADO como defecto bloqueante de contrato**: la segunda revisión (§9) confundió una mejora razonable de identificación visual con una nueva condición normativa para aceptar solicitudes. Los contratos consultados no exigen bloquear a un ADMIN activo porque no tenga ficha visible de nombre/código. No implementar denegación basada en esa ausencia sin decisión expresa; mantener la legibilidad de perfiles legacy como observación UX no bloqueante. La revisión histórica §9 se conserva para trazabilidad, pero su calificación de RV-03 se entiende **sustituida por esta rectificación**.

**RV-04 continúa como observación técnica pendiente**: completar la comprobación `revoked/epoch` tras `await response.json()` en el gateway de titularidad y demostrar el resultado con respuesta tardía de la sesión anterior. Evitar convertir este endurecimiento en cambios del contrato de solicitud.

**Sin código nuevo ni pruebas adicionales en esta rectificación.** RV-01 y el recorrido nominal RV-02 conservan 6/6 workflows del SHA funcional `1dcd7c91`; la aceptación humana F28/R09, M4, M6 y autorización de merge/despliegue siguen pendientes. PR #52 Draft.

## 11. Candidato RV-04: cierre de respuesta JSON tardía tras revocar sesión — 08-11-2026

**Implementación versionada:** [`20e75bd6ad34cf45012131bb50803c32c6f780ec`](https://github.com/jdlc86/CartaViva/commit/20e75bd6ad34cf45012131bb50803c32c6f780ec) en el PR #52 Draft, **sin fusión ni despliegue**. La revisión normativa del §10 continúa prevaleciendo: `request` se enruta automáticamente al titular actual desde el servidor; **RV-03 no es bloqueo**.

**Cambio único de comportamiento RV-04:** `apps/management/src/ownership-governance-gateway.js` revalida `revoked/epoch` tanto al resolver `fetchImpl` como **después de `await response.json()`**, y distingue el error `session_revoked` de un fallo de red si el cuerpo se aborta. Una respuesta tardía de la identidad anterior nunca debe resolverse como éxito ni proyección reutilizable tras `revoke()`. No cambia solicitudes, destinatarios, HTTP ni permisos SQL.

**Prueba integradora añadida al recorrido EXISTENTE**, no nueva suite aislada: `scripts/ci/ownership-governance-postgres17.test.mjs` mantiene la prueba PostgreSQL 17 + identidad SQL limitada + JWT/HMAC + Fastify + PWA/Chromium y añade una lectura firmada real cuyo cuerpo JSON se **retiene tras parsearse**; se revoca la sesión antigua, se comprueba lectura autorizada de una identidad nueva, se libera el JSON antiguo y se exige rechazo `session_revoked` sin entregar datos antiguos. Antes de RV-04 ya existía la regresión de token diferido A→ROOT.

**Estado de validación al registrar: CI del nuevo SHA EN EJECUCIÓN, todavía no afirmar PASS.** Workflows de [CI H6 #42532910370](https://github.com/jdlc86/CartaViva/actions/runs/42532910370), [Bootstrap PG17/Chromium #42532910424](https://github.com/jdlc86/CartaViva/actions/runs/42532910424), [cliente Chromium #42532910371](https://github.com/jdlc86/CartaViva/actions/runs/42532910371), [gestión Chromium #42532910369](https://github.com/jdlc86/CartaViva/actions/runs/42532910369), [dos PWA #42532910422](https://github.com/jdlc86/CartaViva/actions/runs/42532910422) y [puerta funcional UI #42532910414](https://github.com/jdlc86/CartaViva/actions/runs/42532910414). Este último terminó SUCCESS en comprobación preliminar; verificar 6/6 **sobre `20e75bd6`**. Documentos `[skip ci]` no equivalen a código probado.

**Próxima puerta:** inspeccionar logs de prueba integrada RV-04, corregir y ejecutar de nuevo si falla, y registrar el cierre exacto por SHA y nueva revisión técnica. Permanecen pendientes aprobación visual humana F28/R09, M4 Stripe real, M6 y restantes CV-014. Ninguna operación sobre Fleetia, VPS o Supabase operativo.

## 12. RV-04 validado: seis workflows correctos sobre el mismo SHA funcional — 08-11-2026

**Actualización del estado provisional del §11:** el commit funcional [`20e75bd6ad34cf45012131bb50803c32c6f780ec`](https://github.com/jdlc86/CartaViva/commit/20e75bd6ad34cf45012131bb50803c32c6f780ec) terminó con **6/6 workflows `completed/success`**, verificados en GitHub (y no heredados de `1dcd7c91`):

- [Bootstrap PostgreSQL 17 #42532910424](https://github.com/jdlc86/CartaViva/actions/runs/42532910424): **SUCCESS**. Registro del job `generate-lockfile` #128890871173: escenario integrado `PG17 JWT/HMAC Fastify and management Chromium: ownership requests, transfer, ROOT force and stale writer denial` **1/1 PASS, 0 FAIL**, incluyendo la nueva verificación de la decodificación JSON tardía de RV-04 dentro de ese escenario.
- [H6 integral #42532910370](https://github.com/jdlc86/CartaViva/actions/runs/42532910370): **SUCCESS** (job `validate` #128890871187).
- [PWA cliente Chromium #42532910371](https://github.com/jdlc86/CartaViva/actions/runs/42532910371): **SUCCESS**.
- [PWA gestión Chromium #42532910369](https://github.com/jdlc86/CartaViva/actions/runs/42532910369): **SUCCESS**.
- [Instalación independiente de ambas PWA #42532910422](https://github.com/jdlc86/CartaViva/actions/runs/42532910422): **SUCCESS**.
- [Cobertura funcional↔UI #42532910414](https://github.com/jdlc86/CartaViva/actions/runs/42532910414): **SUCCESS**; aceptación final visual humana no acreditada.

**Conclusión de evidencia:** RV-04 **implementado y validado en la batería integrada automatizada**. En `ownership-governance-gateway.js` la época se comprueba después de decodificar JSON y se distingue `session_revoked` cuando el abortado ocurre durante esa espera; E2E demuestra que una respuesta antigua demorada no se entrega y que la identidad siguiente conserva su lectura firmada legítima. RV-03 sigue retirado como bloqueo contractual según §10; la solicitud sigue enrutada al titular por el **servidor**.

**No declarar aprobado el PR solo por CI:** falta una revisión formal posterior a RV-04, y la conexión `jdlc86` es la misma cuenta autora. PR #52 sigue Draft, sin merge, sin despliegue; F28/R09 humana, M4, M6 y restantes CV-014 continúan sin GO. Los commits documentales con `[skip ci]` posteriores no añaden cambios funcionales ni validaciones nuevas.

## 13. Tercera revisión formal integral PR #52 — 09-11-2026

**Nueva revisión GitHub:** [#5820221994](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5820221994), enviada como `COMMENTED` por la cuenta autora (no `APPROVE` de tercero). Dictamen motivado: **CAMBIOS REQUERIDOS / NO APROBADO**. La revisión no cambia código ni ejecuta pruebas adicionales: ha inspeccionado el PR completo de 32 archivos, los contratos normativos del escritor único y la API/PWA/SQL, más evidencias existentes.

**SHA funcional realmente probado:** [`20e75bd6ad34cf45012131bb50803c32c6f780ec`](https://github.com/jdlc86/CartaViva/commit/20e75bd6ad34cf45012131bb50803c32c6f780ec), **6/6 workflows SUCCESS** descritos en §12. En el HEAD documental examinado `35c7b558e612a28033495be775bc3d8e11914d35`, los cuatro commits posteriores eran únicamente documentación; ni un commit documental `[skip ci]` ni el gate final visual `SKIPPED` implican prueba funcional/aceptación humana nueva. PR #50/#51/#52 permanecían abiertos Draft.

**Conformidades examinadas:**
- `request` siempre va dirigido por el **servidor** al ADMIN titular vigente, nunca al seleccionado por el solicitante; se rechaza `targetUserId` del cliente.
- `accept/reject/cancel` revalidan actor, propuesta y propietario actual en transacción; ROOT solo reasigna excepcionalmente a ADMIN activo con motivo/auditoría, no ejerce escritura ordinaria.
- JWT, rol/estado durable, SQL runtime aislado, firma HMAC, singleton con bloqueo, replay, avisos durables, pruebas de concurrencia y revocación posterior al JSON (RV-04) tienen escenarios positivos y negativos automatizados. Ninguna valoración implica pentest, certificación externa ni GO productivo.

**Bloqueo RF-01 (alto):** `apps/management/src/views/OwnershipPanel.tsx` filtra destinatarios de `offer` y `force` por `givenName+familyName+operationalDisplayId`. La proyección SQL de `20261108180000` incluye miembros ADMIN activos con `LEFT JOIN staff_enrollments`, que puede ser `NULL` para personal legacy. La PWA impide al ADMIN titular ofrecer y a ROOT recuperar/ceder a un ADMIN activo que no tenga ficha visual completa. **La normativa exige ADMIN activo, no ficha de identidad visual como precondición de transferencia**. Los tres ADMIN de fixture del E2E tienen inscripción nominal y no detectan el caso. Resolver la identificación en UI de manera inequívoca usando proyección/autoridad permitida, sin añadir una elegibilidad inventada ni exponer contactos. Esto es **distinto del RV-03 retirado**: sigue sin exigirse que una solicitud entrante sea denegada por falta de ficha, y sigue correctamente enrutada por servidor.

**Riesgo RF-02 (seguridad, reproducción aún pendiente):** `supabase/migrations/20261108180000_sabora_ownership_eligible_admin_identity_candidate.sql` captura `v_now` y verifica `expiresAtMs` tras bloquear singleton, pero **antes** de esperar bloqueos de personal, propuesta y destinatario; no revalida el vencimiento HMAC y de la clave justo antes de mutar. No se afirma explotación, fallo PG17 comprobado ni equivalencia automática con otros RPC. Reproducir bajo PostgreSQL 17 desechable con una identidad SQL real limitada, capacidad de vigencia corta y lock de personal retenido hasta la expiración; exigir rechazo sin cambios económicos, titularidad, propuestas, auditoría ni avisos. Si se confirma, revalidar la capacidad y clave al final de los locks respetando su orden normativo y repetir la regresión.

**Único siguiente hito integral:** corregir RF-01 y diagnosticar/solucionar RF-02 en un solo bloque completo; PostgreSQL 17 + JWT/HMAC + Fastify + Chromium + regresión H6; 6/6 CI en nuevo SHA funcional; nueva revisión del PR. No avanzar con pruebas pequeñas o nuevas funcionalidades entre medias. PR #52 Draft, sin merge, despliegue o acción sobre Fleetia/VPS/Supabase operativo. No alterar requisitos F28/R09, M4, M6 ni CV-014.

## 14. Reparación conjunta RF-01/RF-02 implementada, nueva CI pendiente — 09-11-2026

**Revisión causal previa:** [tercera revisión #5820221994](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5820221994). **Nuevo commit funcional:** [`12c2371e6899811fe56416eed089f2a29d2fa0ba`](https://github.com/jdlc86/CartaViva/commit/12c2371e6899811fe56416eed089f2a29d2fa0ba), PR #52 **Draft**, no fusionado ni desplegado.

**RF-01:** `OwnershipPanel.tsx` mantiene la elegibilidad que devuelve el servidor para todo `staff_members` con `admin/active`, sin exigir que tenga una ficha de `staff_enrollments` reciente. Para un ADMIN legacy sin nombre/código disponible, la UI muestra `ADMIN activo sin ficha operativa · ID completo <UUID>` (identificador sin truncar, no una identidad personal inventada) y avisa de comprobar el destinatario. No se altera la atribución automática de `request`: el servidor resuelve al titular actual; selección explícita solo en oferta `offer` y reasignación ROOT `force`. El RPC mantiene su validación durable de rol/estado.

**RF-02:** nueva migración **incremental forward-only** `supabase/migrations/20261109010000_sabora_ownership_post_lock_expiry_candidate.sql`: reemplaza únicamente `admin_ownership_action_candidate(jsonb,text,text)` conservando propietario NOLOGIN `sabora_ownership_fn_owner`, `SECURITY DEFINER`, RLS/ACL y orden de locks. Captura caducidad de la clave bajo `FOR SHARE` y comprueba con `clock_timestamp()` el vencimiento HMAC/clave **después del lock de personal antes de replay** y **después de lock de propuesta/destinatario justo antes de escribir**. Una operación que expiró durante una espera debe fracasar sin transferencia, auditoría ni aviso. No se aplicó a Supabase operativo.

**Prueba integradora ampliada, NO suite atomizada:** `scripts/ci/ownership-governance-postgres17.test.mjs` agrega ADMIN activo sin inscripción; recorre proyección firmada, cesión real desde Chromium, recuperación ROOT y aviso; además retiene `staff_members FOR UPDATE` desde otra transacción PG17 mientras entra una solicitud HTTP JWT con HMAC corto y verifica que `pg_stat_activity` realmente muestra una espera de lock antes de liberar; exige HTTP 403, cero propuestas/auditorías/avisos y titular inalterado. Registro `scripts/ci/migration-audit.mjs` actualizado.

**EVIDENCIA TODAVÍA NO CERRADA**: nueva batería del SHA funcional `12c2371e` iniciada automáticamente: [Bootstrap PG17 #42537660195](https://github.com/jdlc86/CartaViva/actions/runs/42537660195), [H6 #42537660214](https://github.com/jdlc86/CartaViva/actions/runs/42537660214), [cliente #42537660140](https://github.com/jdlc86/CartaViva/actions/runs/42537660140), [gestión #42537660201](https://github.com/jdlc86/CartaViva/actions/runs/42537660201), [dos PWA #42537660268](https://github.com/jdlc86/CartaViva/actions/runs/42537660268) y [funcional/UI #42537660110](https://github.com/jdlc86/CartaViva/actions/runs/42537660110). Solo el último tenía SUCCESS al registrar; **no atribuir 6/6 hasta verificar los seis**. Si falla, diagnosticar y corregir íntegramente antes de dictamen.

Siguientes puertas: inspección de logs de migración y E2E, H6 y seis workflows sobre mismo SHA; revisión formal posterior y aprobación independiente. Permanecen F28/R09 humana, M4 Stripe real, M6 y CV-014 restante NO-GO. No modificar Fleetia, VPS ni Supabase operativo; sin merge/despliegue.

## 15. RF-01/RF-02: seis workflows correctos y cierre técnico automatizado — 09-11-2026

**Actualización que sustituye el CI pendiente de §14:** el commit funcional [`12c2371e6899811fe56416eed089f2a29d2fa0ba`](https://github.com/jdlc86/CartaViva/commit/12c2371e6899811fe56416eed089f2a29d2fa0ba) ha terminado con **6/6 GitHub Actions `completed/success`** sobre ese mismo SHA, sin reutilizar el 6/6 del commit `20e75bd6` anterior.

| Workflows comprobados en GitHub | Resultado |
| --- | --- |
| [Bootstrap PG17 + driver Node #42537660195](https://github.com/jdlc86/CartaViva/actions/runs/42537660195) | **SUCCESS**. Job #128905443164: migración nueva aplicada en PostgreSQL 17 desechable; escenario `PG17 JWT/HMAC Fastify and management Chromium: ownership requests, transfer, ROOT force and stale writer denial` **1/1 PASS, 0 FAIL**. El escenario incluye ADMIN legacy en cesión/recuperación y capacidad HMAC real que caduca tras esperar lock de personal; confirma 403, ausencia de auditoría/propuesta/aviso y conservación de titular. |
| [Sabora CI / H6 #42537660214](https://github.com/jdlc86/CartaViva/actions/runs/42537660214) | **SUCCESS**. Job `validate` #128905443295: logs verifican `PASS Block 1`, `PASS Block 2A` y `PASS Block 2B: real PostgreSQL 17, HMAC, concurrency and Chromium E2E`. |
| [Chromium cliente #42537660140](https://github.com/jdlc86/CartaViva/actions/runs/42537660140) | **SUCCESS** |
| [Chromium gestión #42537660201](https://github.com/jdlc86/CartaViva/actions/runs/42537660201) | **SUCCESS** |
| [CV-012 dos PWA #42537660268](https://github.com/jdlc86/CartaViva/actions/runs/42537660268) | **SUCCESS** |
| [Puerta funcional↔UI #42537660110](https://github.com/jdlc86/CartaViva/actions/runs/42537660110) | **SUCCESS**; la aceptación visual final humana continúa diferida, no se deduce del workflow. |

**Dictamen técnico acotado:** RF-01 y RF-02 **implementados y validados en integración automatizada**; no hay fallo nuevo demostrado en esta batería. RF-01 no cambia que `request` la dirija el servidor al titular actual; en `offer/force`, los ADMIN legacy activos permanecen elegibles por su identidad completa, aunque no tengan ficha operativa nominal. RF-02 verifica la revalidación HMAC/key expiry después del lock, sin efectos durables de una autorización caducada. Todo el código del hito está en el SHA funcional señalado; cualquier commit `[skip ci]` posterior solo añade evidencia documental.

**Puertas restantes:** nueva revisión formal del PR #52 sobre este código (las revisiones anteriores siguen `COMMENTED` y no son un `APPROVE` externo), autorización explícita antes de merge, migraciones operativas o despliegue; F28/R09 visual humana, M4 Stripe real, M6 y CV-014 restante siguen NO-GO. No se modificó Fleetia, VPS, Supabase operativo ni otro proyecto del servidor.

## 16. Cuarta revisión formal integral del PR #52 — 09-11-2026

**Acta:** [revisión #5820453799](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5820453799) registrada en PR [#52 Draft](https://github.com/jdlc86/CartaViva/pull/52) con evento real `COMMENTED`, **nunca `APPROVE` independiente**. **Dictamen limitado:** «Candidato técnicamente validado para revisión independiente; no se han demostrado nuevos bloqueos en el alcance revisado». Contrato normativo por encima de informes y continuidad.

**Alcance contrastado:** los 33 archivos cambiados del PR frente a `feat/sabora-cv014-communications-full-flow-20261108`; contratos ADMIN/ROOT, propuesta y destinarización por servidor, API opt-in, sesión/JWT, HMAC/SECURITY DEFINER/LOGIN mínimo, locks y RLS, PWA de equipo, identidad legacy, directorio y lifecycle administrativo, auditoría, notificaciones, idempotencia, regresiones M3/M5 y H6. No se realiza certificación de pentest externo ni se valida una instalación operativa. No se modifica código funcional en esta revisión.

**Evidencia exacta:** último SHA funcional [`12c2371e6899811fe56416eed089f2a29d2fa0ba`](https://github.com/jdlc86/CartaViva/commit/12c2371e6899811fe56416eed089f2a29d2fa0ba) — **6/6 workflows completos `SUCCESS`** (enlaces y jobs en §15). Bootstrap PG17/JWT/HMAC/Fastify/Chromium de titularidad **1/1 PASS** con ADMIN legacy, revocación y HMAC expirado tras bloqueo; H6 bloques **1, 2A y 2B PASS** con PG17/concurrencia/Chromium. El workflow de cobertura funcional/UI pasa, pero el job `visual-final-acceptance-gate` fue **`SKIPPED`**, no hay aprobación visual humana. Después del SHA funcional, hasta el HEAD revisado `80f67eab3cd413fc72c2d57815af945da24303d5`, solo cambió esta continuidad y el tablero; no extrapolar CI a commits de documentación.

**Cierre técnico de hallazgos:** RV-01/RV-02/RV-04 y RF-01/RF-02 corregidos y respaldados por regresiones/recorridos automatizados; RV-03 quedó retirado como exigencia no normativa. `request` se dirige **en el servidor** al ADMIN titular actual y el solicitante no escoge destinatario. `offer/force` pueden designar al ADMIN activo destinatario; ROOT solo reasigna excepcionalmente a otro ADMIN, nunca se vuelve escritor ordinario. SQL verifica propietario, rol/estado activo y expiración HMAC dentro de la transacción, con auditoría y avisos persistidos.

**Siguiente paso y límites:** solicitar revisión por cuenta/persona **independiente** y registrar su decisión explícita sobre #52; no confundir esta cuarta revisión autora con autorización de merge. Permanecen PR #50/#51/#52 Draft, aceptación visual humana F28/R09, Stripe test real M4, CV-014 restante, M6 y puertas de producción sin GO. Sin despliegue, merge, migración Supabase operativa ni acceso/modificación a Fleetia/VPS. Este apartado §16 sustituye, solo para la lectura del estado vigente, las llamadas históricas de §§13–15 a realizar otra revisión formal por la cuenta autora.
