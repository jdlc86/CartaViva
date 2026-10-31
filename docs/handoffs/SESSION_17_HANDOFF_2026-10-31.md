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

## 13. Revisión estructural del SQL candidato F12 (2026-10-31)

Commit `56f1bc746517f78a0a039caafe5557dfeaf4daa8` amplía `apps/api/src/table-change-h6-contract.test.mjs` con pruebas de contrato estático para sesión/visita revocadas, autorización aprobada y vinculada a sesión de origen, bloqueo por cliente, cuentas abiertas ambiguas y replay sin segundo consumo. No se cambió la migración ni se concedió `EXECUTE`. **Pendiente:** CI de este SHA, integración PostgreSQL 17 y E2E. El commit anterior `bd1c0082345aa3ee06fa5cedf0b3e01917d0060b` seguía con workflows en progreso en la última consulta. B3 permanece NO-GO.

## 14. Inventario corregido de pruebas PG17 reales (2026-10-31)

Inspección directa de `scripts/ci/table-change-root-postgres17.test.mjs`: **ya existen** escenarios PG17 desechables de consumo de aprobación único, confirmación A→B positiva con cotización real, traslado encadenado A→B→C, rollback de confirmación, serialización advisory lock por cliente, pagos Stripe pendientes, concurrencia de dos checkouts y preservación de destinos/historial económico. No confundir estas pruebas de **candidato SQL aislado** con integración del runtime de producción: `customer-production-composition.mjs` mantiene el allowlist sin F12, `table-change-postgres-store.mjs` mantiene `applyTransfer` bloqueado y la función SQL integrada no tiene EXECUTE de runtime. **Prioridad:** cerrar composición de API + PWA + aceptación E2E, no duplicar las pruebas PG17 existentes. Última inspección de Actions de SHA `56f1bc746517f78a0a039caafe5557dfeaf4daa8`: workflows todavía `in_progress`; no afirmar PASS. B3 NO-GO.

## 15. Adaptador candidato RPC selladas (2026-10-31)

Commits `e18ae2e0c74adc72042c047f2baea25b8c3ae687` y `df9914ebfc1bfc626056efed189156a981844cbe`: nuevo `apps/api/src/table-change-sealed-rpc-candidate.mjs` con `request_customer_table_change_h6_candidate(bytea,uuid)` y `decide_customer_table_change_h6_candidate(uuid,uuid,boolean)` exclusivamente; identidad cliente y cuenta resueltas en transacción inyectada, hash de sesión de 32 bytes, staff verificado admin/waiter, parámetros enlazados, resultado SQL estricto. Seis tests en `table-change-sealed-rpc-candidate.test.mjs`. **Limitación:** adaptador no montado, sin permisos EXECUTE, sin integración del confirm H6 y sin evidencia CI aún; B3 NO-GO. Revisar el acoplamiento de `request` con el contrato HTTP (receipt `sourceTableId`/`createdAtMs`) antes de integrar, así como preflight, ownership, revocación y E2E. No tocar VPS, Fleetia ni Supabase operativo.

## 16. Compatibilidad del recibo RPC F12 con HTTP cliente (2026-10-31)

Commits `50cd5e0c01f2e35a0db387da8b9b07a17ed2c26f` y `a71ccd75c37a267d4a64d03f67a553a39f89033a`: `customer-production-http.mjs` admite recibo mínimo sellado `{id,status,expiresAtMs}` y mantiene compatibilidad con recibos extendidos que incluyen `sourceTableId` y `createdAtMs`; no inventa timestamps ni origen. Tests de recibo mínimo, privacidad y resultados malformados en `tests/customer-production-http.test.mjs`. **Pendiente:** verificar CI y PostgreSQL 17 del SHA funcional, montar composición autenticada/privilegios mínimos, notificaciones y PWA E2E; B3 NO-GO. No se activó ningún runtime ni se modificaron recursos productivos.

## 17. Prueba integrada HTTP + RPC sellada (2026-10-31)

Commit `e2c3eac2c605c2af72def35510dd183c7a37a09e` incorpora `apps/api/src/table-change-sealed-rpc-http-integration.test.mjs`: Fastify real con cookie/same-origin, rechazo de entrada destino/rol cocina, solicitud mínima, aprobación autenticada por camarero, redacción de IDs privados y replay/cooldown fallando cerrado. Query PostgreSQL **simulada** y RPC SQL todavía sin EXECUTE; la prueba no acredita permisos PG17 ni traslado real. Verificar Actions y consolidar integración PG17 + bootstrap + E2E antes de activar. B3 NO-GO.

## 18. Errores SQLSTATE del adaptador F12 (2026-10-31)

Commits `a209810116447f0335317918d418837a53aee200`, `4f27374354db46ced7c50223402ab5d64f4f5901`, `b58cbbb2dd770e8633242e571fdf83f0bc950b39`: adaptación exacta SQLSTATE+mensaje de `table_change_cooldown`/`table_change_approval_active` a conflicto de solicitud; `table_change_already_decided` a conflicto de decisión; denegaciones verificadas a forbidden/not found. Pruebas unitarias y HTTP cross-role actualizadas. **No activar** sin comprobar formato real de errores PostgreSQL en PG17 aislado, grants mínimos, bootstrap, E2E y resultados CI. B3 NO-GO.

## 19. Identidad SQL del camarero en RPC F12 (2026-10-31)

La firma de `sabora.decide_customer_table_change_h6_candidate(uuid,uuid,boolean)` usa `p_staff_id` como `sabora.staff_members.user_id`, **no** como identificador de fila del empleado. Se corrigió el adaptador para requerir `verifyStaff(...).userId` UUID validado y enlazar ese valor en la RPC, en vez de `.id`. Commits `b3c495c431cf38d05d670da11d1e6b5b49772b75`, `6055b028c7f7e3cf671ffcf84c1569a4f474cd2d`, `79945fc31c1e13a6ebf189f58120e652f3cb0e51`. Verificar fixtures, CI y PG17; no hay grants de runtime ni bootstrap. B3 NO-GO.

## 20. Contratos RPC y migraciones

Commits afed9404 y dcdcd10f: traduccion de cuenta ausente y cuatro pruebas de contrato entre RPC, identidad de camarero, bloqueos y ausencia de grants. No se ha habilitado runtime ni probado este bloque en PG17 real. B3 NO-GO.

## 21. Solicitud F12 sin SELECT directo de cuenta en API

Los workflows del commit dcdcd10f finalizaron SUCCESS (CI, bootstrap y navegador). Nueva migracion candidata 20261031190000: RPC de un parametro (hash de sesion), resuelve una unica cuenta abierta dentro de SECURITY DEFINER, rechaza sesiones revocadas y cuentas ambiguas y delega la validacion final a la RPC existente. Sin grants ni activacion. Adaptador usa esta RPC por defecto sin resolveAccount; conserva compatibilidad de dos parametros como candidato no apto para cutover. Commits 7620b68f, 88af9d80, 20db8c2a, 003b3534. Pruebas unitarias y de contrato; falta validar PG17 real, autorizaciones SQL minimas, transacciones, API y PWA integradas. B3 NO-GO.

## 22. Bloqueo atomico en resolucion de cuenta

Commits 0546b273 y 6fed2489: la RPC F12 resuelta adquiere el advisory lock por cliente antes de comprobar unicidad de cuenta, igual que confirmacion y decision. Test de orden de bloqueo. Sigue siendo candidata sin grants; falta PG17 aislado y E2E. B3 NO-GO.

## 23. CI tras nueva migracion F12

Commit 6fed2489: navegador SUCCESS; Sabora CI y bootstrap FAILURE. Log de CI: 1123/1124 pruebas pasan, falla auditoria obligatoria por migracion 20261031190000 sin entrada individual. Commit 199199ab registra revision de dependencias, ACL, bloqueo y efecto de datos en scripts/ci/migration-audit.mjs. Pendiente nueva confirmacion CI, PG17 real, grants y cutover. B3 NO-GO.

## 24. Segundo fallo de auditoria de migraciones

El workflow de 199199ab fallo en CI y bootstrap: la cobertura del registro ya era correcta, pero scripts/ci/migration-audit.test.mjs conservaba la asercion 65 migraciones frente a 66 reales. Corregido a 66 en e676fcc3. Navegador SUCCESS; CI y bootstrap previos FAILURE. Pendiente verificar workflows nuevos, PG17 real y runtime F12. B3 NO-GO.

## 25. CI verde y nueva prueba PG17 F12

Commit e676fcc3: los tres workflows terminaron SUCCESS: Sabora CI 41233543221, bootstrap lockfile 41233543269 y browser 41233543216. Commit 13479832 agrega a scripts/ci/table-change-root-postgres17.test.mjs una prueba contra PG17 descartable: verifica SECURITY DEFINER y owner, ausencia de EXECUTE para anon/authenticated/H6 runtime, rechazo de hash de sesion falsificado y malformado con SQLSTATE 42501/22023, sin crear solicitudes. Resultado del nuevo commit aun pendiente de CI. La prueba negativa no certifica flujo positivo ni grant operativo; B3 NO-GO.

## 26. F12 pruebas PostgreSQL 17 de solicitud positiva y ambiguedad

Commit 13479832 obtuvo los tres workflows SUCCESS: CI 41234873106, bootstrap 41234873137, navegador 41234873203. Commit e2c40dc1 agrega al arnes PG17 dos escenarios transaccionales reales: sesion valida con una unica cuenta abierta y visita QR crea solicitud pendiente sin cambiar la vinculacion, rechaza duplicado en cooldown; dos cuentas abiertas del mismo cliente provocan 42501 y cero solicitudes. Pendiente verificar CI del nuevo commit. La seleccion de cuenta unica es una decision candidata y debe contrastarse con la normativa de cuentas antes del cutover; no hay grants ni rutas productivas. B3 NO-GO.

## 27. Fallo de aislamiento en dos escenarios PG17 F12 y correccion

Commit e2c40dc1: browser SUCCESS, CI y bootstrap FAILURE. Block 2B PG17: 33/35 tests, dos nuevos escenarios chocan con customer_profiles_pkey (23505), no fallo funcional del RPC demostrado. Commits 119c5a2b, ecc52df5, be30ebf2: fixtures dedicadas por escenario con customer, cuentas, mesas, sesiones y visita aisladas, preservando formato de identificador publico. Pendiente certificar nuevo CI. B3 NO-GO, sin grants ni cutover.

## 28. Aislamiento adicional de hash de sesion en PG17

CI de be30ebf2: navegador SUCCESS, Sabora CI y bootstrap FAILURE; PG17 Block 2B 33/35 por violacion de customer_sessions_token_hash_key (23505) en los dos escenarios nuevos. Los identificadores de cliente/mesa ya estaban aislados, pero ambos fixtures reutilizaban el hash global de sesion. Commit 0bd69048 asigna token hash distinto por escenario y lo utiliza al invocar la funcion; nueva CI pendiente. B3 NO-GO.

## 29. PG17 validacion de formato de visit_key

CI de 0bd69048: browser SUCCESS, CI/bootstrap FAILURE; los dos escenarios F12 alcanzaron INSERT de customer_accounts y fallaron por customer_accounts_visit_key_check (23514), antes de invocar RPC. Commit 0c20190e adapta los visit_key de fixtures al formato de longitud canonico, sin cambiar restricciones de base de datos. CI pendiente. B3 NO-GO.

## 30. Auditoria de uso de token en escenarios F12

Revision de los dos escenarios PG17 tras corregir visit_key detecto dos referencias residuales al tokenHash global: comparacion de requesting_session_hash y llamada de cuenta ambigua. Commit 1e4679b9 sustituye ambas por scenarioA.token y scenarioB.token. Los workflows de 0c20190e seguian en ejecucion en el momento de la revision; CI del nuevo commit pendiente. B3 NO-GO.

## 31. PG17 descubre fallo real min(uuid) y migracion correctiva

CI de 1e4679b9: browser SUCCESS, CI/bootstrap FAILURE, PG17 33/35; los dos escenarios F12 llegan a la funcion SQL y fallan con 42883 function min(uuid) does not exist. Esto es un defecto real del RPC candidato, no de las fixtures. Commit f6adef4a crea migracion incremental 20261031200000_sabora_h6_resolved_request_uuid_aggregate_fix_candidate.sql con CREATE OR REPLACE, cambia min(a.id) a min(a.id::text)::uuid, conserva SECURITY DEFINER, owner y REVOKE sin tocar migracion previa. Commit 96a55d9b agrega revision individual al inventario de migraciones; e671b854 actualiza total auditado a 67. CI correctiva pendiente. B3 NO-GO, sin cutover ni grants.

## 32. Correccion sintactica del inventario de migraciones

CI e671b854: navegador SUCCESS, CI y bootstrap FAILURE antes de PG17; Block 1 Node 1122/1123 por SyntaxError en scripts/ci/migration-audit.mjs. La nueva entrada de auditoria quedo separada por doble coma. Commit 025c6815 corrige la sintaxis. No se debe inferir que la migracion PG17 esta validada hasta completar el nuevo pipeline. B3 NO-GO.

## 33. CI verde y proteccion de regresion PG17 F12

Los tres workflows de 025c6815 finalizaron SUCCESS: Sabora CI 41238638765, Bootstrap lockfile 41238638918, navegador 41238638788. La migracion incremental para PostgreSQL 17 y los dos escenarios de F12 superaron la aceptacion consolidada. Commit b80a8652 agrega prueba contractual de regresion que exige min(a.id::text)::uuid, SECURITY DEFINER, propietario minimo y ausencia de GRANT EXECUTE en el reemplazo. La CI de este nuevo commit debe comprobarse por separado. B3 sigue NO-GO: no hay cutover, ni grants runtime, ni montaje de rutas operativas.

## 34. F12 HTTP integrado ejercita ruta SQL de un argumento

Commit c82011cd actualiza prueba Fastify HTTP cliente/camarero para ejecutar REQUEST_TABLE_CHANGE_H6_RESOLVED_SQL, sin resolveAccount ni SELECT directo en login de API; comprueba exactamente un argumento hash de 32 bytes, bloqueo duplicado, autorizacion de camarero, rechazo cocina, privacidad y que aprobacion no mueve la cuenta. Esta prueba sigue usando SQL simulado, no reemplaza PG17. En la revision, el navegador de b80a8652 estaba SUCCESS, CI y bootstrap aun en ejecucion. B3 NO-GO, sin permisos ni montaje runtime.

## 35. HTTP F12 verde y control real PG17 de superficie EXECUTE

Los workflows de c82011cd terminaron SUCCESS: Sabora CI 41239753803, Bootstrap 41239753797 y navegador 41239753942. Commit 2bc57a1a agrega prueba PostgreSQL 17 de catalogo para la funcion resolved request: SECURITY DEFINER, owner sabora_h6_fn_owner y EXECUTE denegado a anon, authenticated, sabora_h6_customer_runtime, operations_runtime, provider_runtime y sabora_admin_writer. Esta prueba no crea roles, grants ni hace cutover; el nuevo pipeline debe comprobarse. B3 NO-GO.

## 36. Reconciliacion de puerta B2/B3 con normativa

Releidos docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md y docs/reviews/SABORA_TABLE_TRANSFER_B0_ATOMICITY_DEPENDENCIES_2026-10-31.md. La puerta funcional no se cierra por aprobar solicitud/decision ni por PG17 aislado del RPC: F12 exige primera confirmacion de pedido en B, misma cuenta economica y consumo unico de aprobacion, redireccion solo de pendientes, preservacion de pagos/historia, carreras y rollback. B2 requiere pruebas transaccionales de confirmacion/transferencia y B3 navegador real cliente/sala/cocina, no solo HTTP SQL simulado. Los tres workflows de 2bc57a1a seguian in_progress durante esta revision. No se han habilitado grants ni cutover; B3 NO-GO.

## 37. Candidato de composicion F12 con SQL exacto y pools separados

Commits dd00c9e7 y 25f7533a: nuevo apps/api/src/table-change-isolated-sql-composition-candidate.mjs y prueba asociada. Separa pool cliente de operaciones, usa role-scoped transaction con SET LOCAL ROLE sabora_f12_customer_runtime / sabora_f12_operations_runtime y listas SQL exactas de una funcion por capacidad. La solicitud solo invoca resolved_candidate(hash), decision solo RPC de personal; prueba rollback y rechazo cocina. No se crean roles ni se conceden EXECUTE, no se monta ruta, no se toca composicion H6 activa. El siguiente hito necesita migracion de roles/grants minima, preflight real PG17 de identidad y superficie, y E2E completo; no considerar esta composicion una activacion. CI pendiente para 25f7533a. Workflows de 2bc57a1a seguian in_progress en ultima consulta. B3 NO-GO.

## 38. Fallo de Bootstrap en conformidad tactil Chromium y correccion de sincronizacion

Para commit 25f7533a: Sabora CI SUCCESS 41242098673; browser SUCCESS 41242098527; Bootstrap FAILURE 41242098445. Log job 124657915679: scripts/ci/order-operations-read-postgres17.test.mjs, escenario Chromium+JWT+Fastify, asercion del boton 'Voy a recoger' hit target >=44x44 justo despues de SSE/cancelacion; 12/13 pruebas del archivo pasan. CSS ya declara button min-height:44px y .button; el fallo puntual no demuestra causa definitiva de layout. Commit 1a526722 espera via waitForFunction a que el boton realmente alcance 44x44 antes de mantener la asercion original, sin relajar accesibilidad. Reejecutar los tres workflows y, si falla de nuevo, inspeccionar geometria/CSS real en vez de suprimir la comprobacion. B3 NO-GO.

## 39. F12 preflight SQL aislado y negativo de privilegios

Commits cbfac5a1 y 74c3768b: nuevo preflight candidato de identidad y superficie de funciones SQL para pools cliente/operaciones independientes, login sin herencia ni privilegios elevados, membresia SET solo en su rol, cero privilegios directos de tablas/secuencias y exactamente una RPC por rol. Pruebas negativas de SUPERUSER, BYPASSRLS, INHERIT, membresia cruzada, grants adicionales, SQL incorrecto, errores de consulta y pools compartidos. Aun no hay migracion que cree los roles ni grants y este preflight no se conecta a la composicion H6 activa; las pruebas actuales son con mocks. Pendiente CI y validacion real PG17 con login aislado. B3 NO-GO.

## 40. Correccion de superficie efectiva de privilegios F12

En revision de seguridad del preflight se detecto que inspeccionar solo ACL directas de la capacidad no prueba la superficie ejecutable real: puede omitir concesiones PUBLIC/heredadas y confundir sobrecargas. Commits eaa4814e y f3cd10c0 sustituyen la consulta por has_function_privilege(role,oid,'EXECUTE') sobre todas las funciones del esquema sabora y comparan firmas regprocedure completas. Pruebas actualizadas para las firmas exactas y superficie ampliada. No hay roles F12 ni grants ni despliegue; falta PG17 real y CI posterior. El anterior CI Bootstrap tuvo fallo 44px en Chromium; commit 1a526722 mantiene umbral y espera layout; verificar sus workflows antes de cierre. B3 NO-GO.

## 41. Cierre de brecha SET ROLE transversal en preflight F12

Commits 5be02c30 y f2c9cc3e: preflight no se limita ya a verificar SET sobre las dos capacidades F12 conocidas; enumera todos los roles que el login puede asumir via pg_has_role(...,'SET') y exige exactamente el suyo. Nuevas pruebas negativas para roles adicionales y ausencia de rol. Evita aprobar un login que pueda asumir un tercer rol privilegiado. Esta puerta sigue siendo candidata, no hay grants ni activacion; validar CI y PostgreSQL 17 con roles reales. B3 NO-GO.

## 42. Prueba real PG17 de ACL efectiva F12

Commits e19fc840 y db2216c7 agregan al arnes PG17 disposable un rol NOLOGIN transaccional de prueba, con concesion y revocacion de EXECUTE sobre RPC F12, comprobacion de firmas y de fuga por GRANT TO PUBLIC. Compara contra la superficie base del esquema (no presupone ausencia de otras funciones PUBLIC) y revierte toda la transaccion. Es evidencia de consulta ACL real, no aun prueba de conexiones con logins F12 separados ni autorizacion para crear roles/grants permanentes. CI pendiente; no habilitar composicion activa. B3 NO-GO.

## 43. Preflight F12: distincion login NOINHERIT y capacidad SET ROLE

Revision de seguridad: un login NOINHERIT puede recibir EXECUTE directamente o via PUBLIC; verificar solo la superficie de su rol F12 no basta. Commits 154aed98, 03f6f5af, 9379022c y correccion final aeb4b69e, 5643d07c: el preflight comprueba separadamente rol F12 (exactamente una RPC) y login previo a SET LOCAL ROLE (cero RPC ejecutables en esquema sabora), ademas de membresia SET unica, permisos de tabla/secuencia y ausencia de atributos elevados. Pruebas de mocks cubren concesiones directas/PUBLIC simuladas; PG17 agrega login NOINHERIT y grants transaccionales para comprobar la diferencia real. La politica de cero funciones en login puede requerir revocacion de grants PUBLIC heredados en un entorno aislado antes de pasar: no relajar el control por comodidad. CI aun pendiente. B3 NO-GO.
