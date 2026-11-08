# Sabora / CartaViva — continuidad operativa de la sesión 31 (2026-11-08)

> **DOCUMENTO DE CONTINUIDAD, NO FUENTE NORMATIVA, APROBACIÓN TÉCNICA, ACEPTACIÓN VISUAL NI AUTORIZACIÓN DE PRODUCCIÓN.** Preparado al cerrar la revisión formal de la sesión 30. Los documentos normativos de GitHub prevalecen; comprobar el estado real de ramas/CI antes de actuar. Un resultado correcto acredita solo el escenario y el SHA que realmente se ejecutaron.
>
> **Tablero vivo del proyecto:** [SABORA_LIVE_PROJECT_TRACKER](../tracking/SABORA_LIVE_PROJECT_TRACKER.md), especialmente §§58–59. **Continuidad anterior:** [sesión 30](SESSION_30_HANDOFF_2026-11-08.md), especialmente §§8–10. **Revisión formal de la que parte esta sesión:** [revisión #5819709942 del PR #52](https://github.com/jdlc86/CartaViva/pull/52#pullrequestreview-5819709942). **Matriz H6:** [F01–F28 / R01–R10](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md).

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
