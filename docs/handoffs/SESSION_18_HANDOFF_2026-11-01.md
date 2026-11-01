# CartaViva / Sabora — continuidad viva para la sesión 18

**Creación:** 2026-11-01. **Naturaleza:** documento operativo de continuidad, **NO NORMATIVO**. **Estado:** B3/F12 **NO-GO**; PR #43 **Draft**. Este documento se actualizará en el mismo archivo al cerrar hitos significativos de la sesión 17 y antes de iniciar la sesión 18.

> La fuente de verdad son los documentos normativos vigentes en GitHub, no este handoff, las conversaciones ni los informes de continuidad. Antes de actuar, contrastar requisitos y HEAD reales. No interpretar una prueba verde como autorización de activación.

## 1. Ámbito y restricciones innegociables

- Repositorio autorizado exclusivamente: `jdlc86/CartaViva`. No modificar otros repositorios.
- Sabora: **un restaurante por instalación**, con PWA cliente y PWA gestión; preservar flujos aprobados e identidad visual premium.
- **Sin merges, despliegues, migraciones/escrituras en Supabase operativo, cambios en VPS, reinicios ni manipulación de Fleetia u otros proyectos**, salvo autorización expresa. Un eventual despliegue debe ser completamente aislado.
- Pruebas SQL solo en PostgreSQL 17 desechable y aislado. No habilitar rutas, credenciales, grants o cutover productivos.
- Priorizar hitos verticales completos y pruebas integradas; corregir fallos y repetir CI sin pedir aprobaciones rutinarias. No iniciar agentes/Codex por defecto.
- No adjudicar resultados de CI a commits distintos de los comprobados.

## 2. Lecturas obligatorias de arranque

1. Normativa: `docs/REQUISITOS_FUNCIONALES.md` y `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`; revisar también los contratos vigentes de QR, identidad, roles, pagos, cambio de mesa, cocina/sala, recogida y diseño visual. Verificar versiones reales en la rama de trabajo.
2. Matriz subordinada: `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md` (F01–F28 y R01–R10).
3. `docs/handoffs/SESSION_16_HANDOFF_2026-10-31.md` y `docs/handoffs/SESSION_17_HANDOFF_2026-10-31.md`; este último contiene la cronología extensa y el detalle de los subbloques hasta el preflight B3.
4. Informes `docs/reviews/SABORA_H6_B2_DELIVERY_PICKUP_BOARD_CANDIDATE_2026-10-31.md` y `docs/reviews/SABORA_TABLE_TRANSFER_B0_ATOMICITY_DEPENDENCIES_2026-10-31.md`.
5. PR Draft #43: https://github.com/jdlc86/CartaViva/pull/43; revisar HEAD, commits nuevos y workflows antes de editar.

## 3. Fotografía verificada al crear este handoff

- Rama del PR: `integration/sabora-h6-b2-delivery-board-contract-20261031`.
- Base: `integration/sabora-h6-end-to-end-pilot-20261030`.
- HEAD **anterior a crear este documento**: `86adbf8c8ad0c8ac47c89386cd9f92799796fe30`. La creación de este archivo produce otro SHA: **no atribuirle automáticamente las pruebas del anterior**.
- PR #43 abierto, Draft, sin merge.
- **GitHub Actions del SHA `86adbf8c` comprobadas el 2026-11-01: 3/3 SUCCESS**: Sabora CI `41321079364`, Bootstrap Sabora lockfile `41321079391`, Sabora client browser conformance `41321079419`. Se resuelve así la incertidumbre de la despedida de la sesión 16, cuando estaban en curso.
- El commit `86adbf8c` añade una prueba de modelo de privilegios: la identidad SQL no puede confirmar transferencias directamente; solo puede hacerlo tras asumir el rol autorizado, con acceso a una sola función Sabora. Los roles de la prueba se crean en una transacción que se revierte. **No se modificó ninguna base operativa**. Esta evidencia no demuestra aún que el preflight B3 pase sobre el mismo modelo en PG17 real.
- **NO-GO**: no existe aceptación final de B3/F12 ni recorrido E2E íntegro desde las PWA.

## 4. Trabajo ya existente que no se debe duplicar

- Confirmación candidata `sabora.confirm_customer_round_h6_transfer_integration_candidate`, que conserva una cuenta económica y consume la concesión en la transacción del primer pedido en B; sin EXECUTE productivo.
- RPC candidatas selladas de solicitud y decisión, adaptadores HTTP y contratos de identidad, todavía sin montaje operativo.
- Selector explícito `PERSIST_H6_TRANSFER_ORDER_SQL` en `apps/api/src/customer-production-flow.mjs`; la entrada por defecto sigue utilizando `PERSIST_H6_ORDER_SQL`. No cambiar el default aisladamente.
- Preflight candidato `apps/api/src/table-change-b3-confirmation-preflight-candidate.mjs`: identidad de login, NOINHERIT, ausencia de BYPASSRLS y privilegios directos, SET exclusivo del rol B3, EXECUTE mínimo. Sin migración de activación runtime.
- Pruebas reales PG17 de transferencia, rollback, concurrencia, replay y seguridad de pagos; cobertura HMAC de pickup positivo en B tras revocar A y negativos por cierre de B, QR rotado, visita revocada y sesión reocupada. Estas pruebas **no equivalen** al recorrido único integrado de solicitud→decisión→QR B→pedido→cuenta/pagos→pickup.
- El lector H6/B2 de destino efectivo y el tablero de cocina/sala, eventos durables y SSE ya tienen cobertura parcial integrada.

## 5. Próximo hito prioritario de la sesión 18 (o continuación de la 17)

**Cerrar B3/F12 como un bloque vertical verificable**, no por microparches:

1. Reconciliar HEAD y normativa, confirmar que el preflight B3 acepta en PostgreSQL 17 real exactamente el modelo de roles ensayado en `86adbf8c`; verificar denegación directa, SET ROLE restringido, EXECUTE exclusivo y fallos cerrados por grants adicionales.
2. Revisar ownership, RLS, locks, HMAC, revocaciones y transacciones de RPC de solicitud/decisión y confirmación. Crear únicamente los elementos mínimos candidatos de aislamiento que hagan falta; **ningún grant a Supabase operativo**.
3. Componer HTTP autenticado de cliente y camarero con confirmación H6 transferida **solo en candidato aislado**. La aprobación no mueve la cuenta; la primera confirmación válida en B consume una vez la concesión y preserva `account_id`, saldo, pagos e historial. Mantener el runtime normal fail-closed.
4. Integrar la PWA cliente y gestión según flujos/diseño aprobados, tablero, cocina/sala, pickup y SSE; evitar filtración de datos internos.
5. Ejecutar un recorrido PostgreSQL 17/Fastify/Chromium real: pedido en A, solicitud, aprobación, escaneo QR B, primer pedido B, transferencia única, cobros y líneas pendientes, recogida en B tras revocar A. Incluir negativas de caducidad pendiente (90 s), duplicados, rechazo, QR/visitas revocados, reocupación, concurrencia, rollback, replay y cierre de cuenta; no alterar garantías de pay_now/pay_at_end.
6. Completar F01–F28/R01–R10, Playwright/axe/responsive, auditoría de migraciones, regresión completa y Actions. Registrar cada PASS/FAIL con SHA y run ID. No declarar GO sin aceptación integral y revisión independiente.
7. Actualizar informe de hito, PR #43 y **este mismo archivo**, sin confundir validación técnica con autorización de despliegue.

## 6. Archivos técnicos de entrada

- `apps/api/src/table-change-b3-confirmation-preflight-candidate.mjs`
- `apps/api/src/table-change-b3-confirmation-preflight-candidate.test.mjs`
- `apps/api/src/table-change-isolated-sql-composition-candidate.mjs`
- `apps/api/src/table-change-sealed-rpc-candidate.mjs`
- `apps/api/src/customer-production-flow.mjs`
- `apps/api/src/table-change-postgres-store.mjs`
- `apps/api/src/table-change-http-candidate.mjs`
- `scripts/ci/table-change-root-postgres17.test.mjs`
- `scripts/ci/h6-postgres17.test.mjs`
- `supabase/migrations/20261031010000_sabora_h6_transfer_confirmation_integration_candidate.sql`
- `supabase/migrations/20261031110000_sabora_h6_pickup_effective_destination_authorization_candidate.sql`

Verificar también migraciones posteriores; no reescribir historial de migraciones.

## 7. Registro vivo de hitos

| Fecha | SHA | Evidencia | Estado |
| --- | --- | --- | --- |
| 2026-11-01 | `86adbf8c` | Sabora CI `41321079364`, Bootstrap `41321079391`, browser `41321079419`: **3/3 SUCCESS** | Prueba de aislamiento SQL, sin cutover; B3 NO-GO |
| 2026-11-01 | Commit de creación: consultar GitHub | Nuevo documento de continuidad de sesión 18 | Solo documentación; CI de este nuevo HEAD pendiente de comprobar |

**Protocolo:** actualizar este mismo documento después de hitos importantes de sesión 17/18, indicando fecha, rama, HEAD, PR, cambios reales, pruebas por SHA, errores pendientes y siguiente acción. Rectificar expresamente conclusiones superadas; no borrar el historial útil.

## 8. Prompt corto para arrancar la sesión 18

> Continúa CartaViva/Sabora exclusivamente en `jdlc86/CartaViva`. Lee normativa vigente y `docs/handoffs/SESSION_18_HANDOFF_2026-11-01.md`, contrasta handoffs 16/17, HEAD, PR #43 Draft y CI. Prioriza cerrar B3/F12 como bloque completo: preflight de permisos PG17 real, RPC cliente/camarero selladas, confirmación atómica del primer pedido en B con cuenta única, HTTP/PWA, pagos, pickup y SSE; aceptación F01–F28/R01–R10 y E2E real. Corrige y repite pruebas, documenta hitos en este mismo archivo. Sin merges, despliegues, Supabase operativo, VPS ni tocar Fleetia. Mantén NO-GO hasta evidencia integral.

## 9. Continuación sesión 17 — preflight B3 contra catálogo PG17 real (2026-11-01)

- Commit `93961ae524ac3eb35474b90ba2b5355bdc4f07bc`: ampliada la suite `scripts/ci/table-change-root-postgres17.test.mjs` para crear un rol B3 y login **dentro de una transacción reversible**, conceder solo SET y EXECUTE de confirmación, asumir la identidad mediante `SET LOCAL SESSION AUTHORIZATION` y ejecutar el preflight **real** `assertB3ConfirmationCapabilities` contra catálogos PG17. La prueba exige login/session_user exactos y rechazo implícito de cualquier superficie extra; el rollback elimina los roles de prueba.
- **Estado de evidencia:** commit publicado, **CI de `93961ae5` todavía no verificada** al redactar esta actualización. No registrar PASS hasta obtener el resultado real. Si falla, corregir la prueba o el diseño y repetir, sin tocar Supabase operativo.
- Los tres workflows del commit documental anterior `c7ea83b4` estaban en curso durante la inspección; consultar su estado final por SHA.
- Sin cambios en roles operativos, sin despliegue ni merge. PR #43 Draft; B3/F12 NO-GO.
- Próximo paso: esperar/verificar GitHub Actions del commit de prueba; después continuar con composición vertical candidata HTTP/PWA/transferencia/pickup, con aceptación real F01–F28/R01–R10.

## 10. Refuerzo de pruebas negativas PG17 (2026-11-01)

- Commit `be6dd8f2d1df0a157e1027d424665391a184ea36`: en la misma transacción PG17 desechable de B3, el preflight comprueba primero el login mínimo, después **rechaza un EXECUTE adicional otorgado al rol B3**, y después **rechaza un EXECUTE directo otorgado al login**. Todo se revierte; no hay grants persistentes ni activación de rutas.
- La prueba utiliza el RPC H6 de confirmación ya presente como permiso extra, y verifica el rechazo por etapas `function-surface` y `login-function-surface`. **CI de este commit pendiente de comprobación**; si PostgreSQL rechaza algún cambio de sesión/autorización, corregir y volver a ejecutar antes de marcar PASS.
- En inspección anterior: para `1cb23160` navegador SUCCESS, Sabora CI y Bootstrap en curso; volver a consultar los resultados por SHA. PR #43 Draft, B3 NO-GO.

## 11. Cierre verificado de subhito de preflight B3 PG17 (2026-11-01)

- **HEAD validado `2fe88b0249244e362da0a5a247a03e0e085c8438`: GitHub Actions 3/3 SUCCESS**: Sabora CI `41322188110`, Bootstrap Sabora lockfile `41322187947`, Sabora client browser conformance `41322187942`.
- Esto incluye los tests positivos y negativos del preflight B3 sobre catálogo real de PostgreSQL 17 desechable, con concesiones adicionales deliberadas y revertidas al finalizar la transacción. El resultado permite cerrar **el subhito de validación de privilegios**, no el hito funcional B3/F12 completo.
- **Siguiente hito integral:** composición candidata que conecte solicitud/decisión HTTP autenticadas, confirmación atómica al primer pedido en mesa B, PWA, proyección de entrega, SSE, pickup y pagos; aceptación F01–F28/R01–R10 y regresión real. No hacer cutover ni ampliar grants productivos.
- El commit que incorpora esta actualización documental tendrá otro SHA: sus workflows deben verificarse por separado. PR #43 Draft, B3/F12 NO-GO.
