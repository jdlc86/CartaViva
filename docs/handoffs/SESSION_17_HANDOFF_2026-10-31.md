# CartaViva / Sabora — continuidad viva para la sesión 17

**Creado:** 2026-10-31. **Naturaleza:** documento operativo de continuidad, **NO NORMATIVO**. **Estado de activación:** **NO-GO**. **Actualización:** mantener este mismo archivo al cerrar hitos importantes y antes del cambio efectivo a sesión 17; no crear documentos paralelos para cada avance.

> La fuente de verdad son los documentos **normativos vigentes** del repositorio `jdlc86/CartaViva`. Este handoff, las pruebas, informes, PR y mensajes de conversación son subordinados. Verificar la versión real de los archivos normativos antes de actuar; no inferir decisiones nuevas de este resumen.

## 1. Instrucción de arranque

Trabajar exclusivamente en `jdlc86/CartaViva`. Antes de editar: consultar HEAD real de la rama de trabajo, PR Draft #43, cambios concurrentes, Actions y documentación normativa. Priorizar **hitos verticales completos** y corregir fallos de pruebas de manera autónoma, con esperas por shell o consultas a Actions, sin requerir aprobaciones rutinarias. No activar Codex/agentes por defecto. No atribuir a un SHA resultados de otro SHA.

**Restricciones:** sin merges, despliegues, migraciones o escrituras en Supabase operativo, modificaciones del VPS, reinicios ni cambios de contenedores sin autorización expresa. Fleetia y cualquier otro proyecto del VPS son intocables. Usar PostgreSQL 17 desechable y aislado para pruebas. Sabora corresponde a un único restaurante, con PWA cliente y PWA gestión. Respetar identidad visual premium y flujos aprobados.

## 2. Lecturas obligatorias

1. Normativa vigente: `docs/REQUISITOS_FUNCIONALES.md` y `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md` (comprobar existencia, rama y versión); contratos QR, identidad/roles, pagos, cocina/sala y diseño aprobado que apliquen.
2. Matriz subordinada `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md`, casos F01–F28 y R01–R10.
3. `docs/handoffs/SESSION_16_HANDOFF_2026-10-31.md` y evidencias `docs/reviews/SABORA_H6_B2_DELIVERY_PICKUP_BOARD_CANDIDATE_2026-10-31.md` y `docs/reviews/SABORA_TABLE_TRANSFER_B0_ATOMICITY_DEPENDENCIES_2026-10-31.md`.
4. PR Draft #43: https://github.com/jdlc86/CartaViva/pull/43 y sus workflows actuales. Los informes de continuidad no sustituyen la normativa.

## 3. Fotografía comprobada al crear el documento

- Rama de trabajo conocida: `integration/sabora-h6-b2-delivery-board-contract-20261031`; PR **Draft #43**. Verificar HEAD y base del PR al arrancar.
- Último commit funcional comunicado de sesión 15: `548e6028acdcc49e32687ba5bad024e4759481b9`, prueba `apps/api/src/table-change-http-cross-role-contract.test.mjs`.
- GitHub Actions **verificados para ese SHA**: Sabora CI `41214355132` SUCCESS; Bootstrap `41214354979` SUCCESS; Sabora client browser conformance `41214355248` SUCCESS.
- La prueba usa un **almacén simulado** y el mismo servicio de dominio para solicitud del cliente y decisión del camarero. Verifica autenticación, duplicados, que cocina no pueda aprobar, respuesta sin datos internos y que la aprobación **no traslade** todavía la cuenta. No acredita transacción PG17 real ni E2E PWA.
- Al crear este documento se genera un nuevo commit documental: **no extrapolar los checks del SHA `548e6028` al nuevo HEAD**.

## 4. Estado funcional y técnico

**H6/B2:** hay evidencia de lector de destino efectivo por línea, tablero Fastify cocina/sala, SSE durable y recogida/cancelación concurrente en B con autorizaciones por destino vigente. Se probaron escenarios de revocación de A y B, rotación QR, binding desalineado y reocupación mediante fixtures PG17. Estas evidencias no equivalen a traslado de mesa completo desde PWA.

**F12 traslado A→B:** existe función SQL candidata aislada `sabora.confirm_customer_round_h6_transfer_integration_candidate` en `supabase/migrations/20261031010000_sabora_h6_transfer_confirmation_integration_candidate.sql`. Tiene pruebas PG17 de conservación de cuenta, consumo único, concurrencia, rollback y replay, pero **no está concedida al runtime**. La entrada H6 activa sigue sin hacer el corte funcional. Nunca quitar solamente el guard `table_change_transfer_not_integrated`: se arriesga una segunda cuenta y fragmentación de cobros.

**B3 HTTP/PWA:** existen adaptadores candidatos de solicitud y decisión, pruebas de proyección de recibos sin datos internos, y ahora prueba HTTP cruzada con store simulado (SHA `548e6028`). Falta componer de forma segura la identidad verificada y funciones SQL `SECURITY DEFINER` de privilegios mínimos, enlazar runtime/API/PWA y confirmar el traslado al primer pedido en B, no al aprobar. La función de confirmación candidata no tiene EXECUTE runtime. **B3 abierto.**

**Aceptación:** F01–F28 y R01–R10 sin acta final. Sin E2E completo cliente → solicitud → decisión sala → QR B → primer pedido → misma cuenta/pagos → cocina/sala/recogida. **NO-GO producción**.

## 5. Próximo hito prioritario: B3 vertical transaccional completo

Implementar como bloque coherente, no como serie indefinida de microparches:

1. Auditar normativa, funciones SQL, permisos, locks, RLS, actor firmado, ownership y composición Fastify antes de editar.
2. Crear/componer entradas SQL mínimas para solicitud y decisión de camarero con identidad verificada, bloqueo transaccional, expiración y revocaciones; no dar permisos directos sobre tablas al runtime.
3. Integrar confirmación del primer pedido en B bajo concesión aprobada y QR/visita B válidos; conservar **un único account_id**, origen histórico, pagos y saldos; redirigir solo líneas pendientes; consumir concesión exactamente una vez en la misma transacción. La aprobación por sí sola no mueve la cuenta.
4. Preflight exacto de capacidades, allowlist de funciones y grants mínimos; no habilitar parcialmente F12 ni alterar Supabase operativo.
5. Conectar cliente, camarero, cocina/sala, SSE durable y PWA respetando los flujos y el diseño visual aprobado.
6. Ejecutar PG17 real aislado: replays, concurrencia, rollback, roles/RLS, QR revocado, reocupación A/B, sesiones revocadas, pagos pay_now/pay_at_end, cierre y carreras con recogida. Ejecutar Playwright/axe/responsive y regresión completa. Corregir y repetir; asociar resultados al SHA concreto.
7. Actualizar informe de hito, PR Draft #43 y **este mismo handoff**. Mantener NO-GO mientras no se cumplan las puertas de aceptación y revisión independiente.

## 6. Archivos clave para inspeccionar

- `apps/api/src/table-change-http-cross-role-contract.test.mjs`
- `apps/api/src/table-change-postgres-store.mjs`
- `apps/api/src/table-change-h6-contract.test.mjs`
- `scripts/ci/table-change-root-postgres17.test.mjs`
- `scripts/ci/order-operations-read-postgres17.test.mjs`
- `supabase/migrations/20261031010000_sabora_h6_transfer_confirmation_integration_candidate.sql`
- `supabase/migrations/20261030230000_sabora_h6_line_delivery_confirm_lifecycle_candidate.sql`
- `supabase/migrations/20261031110000_sabora_h6_pickup_effective_destination_authorization_candidate.sql`

Revisar además migraciones posteriores y composición API reales. Migraciones aditivas, sin reescribir historial aplicado.

## 7. Registro vivo de hitos

| Fecha | Hito | Evidencia | Alcance / estado |
| --- | --- | --- | --- |
| 2026-10-31 | H6/B2 destino/recogida/SSE y seguridad de reocupación | Detalle en handoff sesión 16 | PASS técnicos aislados; NO-GO F12 |
| 2026-10-31 | B3 adaptadores HTTP y puerta de corte | `85b6610` y posteriores, detalle sesión 16 | Contratos candidatos; B3 abierto |
| 2026-10-31 | Solicitud cliente y decisión camarero HTTP con store simulado | `548e6028`; Sabora CI `41214355132`, Bootstrap `41214354979`, browser `41214355248`: SUCCESS | PASS de tests del commit; **no** PG17 transaccional ni E2E |
| 2026-10-31 | Creación handoff sesión 17 | Commit de creación: consultar GitHub | Documento no normativo; verificar CI de su HEAD |

**Protocolo de actualización:** tras cada hito importante editar **este mismo archivo** con fecha, HEAD, rama, PR, qué se implementó, pruebas PG17/Playwright/CI con run IDs y conclusión, límites y siguiente acción concreta. Preservar evidencias históricas y corregir afirmaciones superadas explícitamente. No confundir código, test, CI verde, merge ni GO.

## 8. Prompt corto para la sesión 17

> Continúa autónomamente CartaViva/Sabora en `jdlc86/CartaViva`. Lee primero normativa vigente y luego `docs/handoffs/SESSION_17_HANDOFF_2026-10-31.md`; comprueba HEAD, PR Draft #43 y CI. Prioriza **cerrar B3/F12 verticalmente**: solicitud cliente, aprobación camarero sin traslado inmediato, QR B, primera confirmación transaccional con cuenta única, consumo único, pagos y entrega/recogida segura. Implementa SQL mínimo privilegiado, composición HTTP/PWA y PG17 + Playwright E2E; corrige fallos y actualiza PR y este handoff tras hitos. Sin merges, despliegues, Supabase operativo, VPS ni tocar Fleetia. Mantén NO-GO hasta aceptación verificable.

## 9. Inspección directa de código en sesión 16 (2026-10-31)

Lectura directa en la rama del PR #43 de `docs/REQUISITOS_FUNCIONALES.md`, `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `apps/api/src/table-change-postgres-store.mjs`, `apps/api/src/table-change-service.mjs` y `apps/api/src/table-change-http-candidate.mjs`.

**Bloqueos concretos comprobados:** `createTableChangePostgresStore` requiere `withTransaction`, `resolveAccount` y `verifyStaff` externos; su `applyTransfer` lanza `table_change_transfer_not_integrated`. El servicio de dominio reserva el consumo para `consumeInOrderTransaction`, que requiere `applyTransfer` dentro de la transacción del pedido. La superficie HTTP de decisión es candidata y exige `forRoles`, identidad y staff verificados. Por tanto, no retirar el guard ni publicar la ruta sin componer las dependencias de seguridad y el corte transaccional completo. Esta inspección es análisis, **no implementación ni prueba nueva**. Siguiente acción: revisar las migraciones candidatas y el bootstrap API real, diseñar la composición de privilegios mínimos y ejecutar pruebas PG17 aisladas antes de habilitar F12.

## 10. Continuación: invariantes HTTP adicionales (2026-10-31)

Commit funcional `db4f6852ae59139cdc0be389952ae4ecd1c40689` en `apps/api/src/table-change-http-cross-role-contract.test.mjs`: el store simulado de la prueba ahora conserva el bloqueo de una autorización aprobada no consumida y rechaza el replay de una decisión ya resuelta. Se añaden aserciones HTTP 409 para una nueva solicitud tras aprobación y para la segunda aprobación. **Alcance:** prueba de contrato HTTP simulada; no es todavía integración PostgreSQL 17 ni PWA E2E. Consultar los workflows de este SHA antes de certificar PASS. B3 sigue abierto y NO-GO. Siguiente paso: composición transaccional SQL/HTTP/PWA con privilegios mínimos y verificación real aislada.

## 11. Verificación CI del refuerzo HTTP (2026-10-31)

GitHub Actions del **SHA funcional** `db4f6852ae59139cdc0be389952ae4ecd1c40689` comprobados como **3/3 SUCCESS**: Sabora CI `41222762292`, Bootstrap Sabora lockfile `41222762287` y Sabora client browser conformance `41222762341`. Esta verificación certifica exclusivamente las suites ejecutadas para ese commit, no integración PG17 transaccional ni E2E F12. B3 permanece **NO-GO**.

## 12. Protección fail-closed en servicio F12 (2026-10-31)

Commit `bd1c0082345aa3ee06fa5cedf0b3e01917d0060b`: tres pruebas nuevas en `apps/api/src/table-change-service.test.mjs` para ausencia de aprobación, origen erróneo/destino igual y propagación de error de persistencia sin declarar éxito. **No implica** que el runtime transaccional esté integrado; B3 permanece abierto, NO-GO. Comprobar CI del commit antes de certificar resultados.
