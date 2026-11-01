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

## 44. CI F12 verde y prueba PG17 de SET ROLE explicito

Commit 5643d07c: tres workflows SUCCESS (Sabora CI 41243201287, Bootstrap PG17 41243201426, browser 41243201280). Se agrega commit 0c854a4b: prueba PG17 transaccional en base desechable que crea rol de capacidad NOLOGIN y login NOINHERIT, concede membresia SET TRUE/INHERIT FALSE, verifica ausencia de EXECUTE antes de SET ROLE y disponibilidad al asumir rol explicitamente. Su CI esta pendiente; no confundir prueba de rol con validacion de login remoto/pools productivos. No se crea ni concede rol F12 operativo. B3 NO-GO.

## 45. Diagnostico y correccion PG17 de prueba NOINHERIT

El commit 0c854a4b produjo CI Sabora FAILURE 41244046055 y Bootstrap FAILURE 41244046104: 37/38 tests PG17, unico fallo en test SET ROLE por `permission denied for schema sabora` al usar has_function_privilege con firma textual bajo login sin USAGE; navegador SUCCESS 41244046099. Commit d013c41e resuelve el OID de la funcion antes de asumir el login restringido y consulta has_function_privilege(current_user,oid,'EXECUTE'), sin ampliar permisos del login. CI de la correccion pendiente. No relajar el control NOINHERIT ni otorgar USAGE al login para hacer pasar el test. B3 NO-GO.

## 46. Correccion PG17 validada y limite funcional de resolucion F12

Commit d013c41e validado con tres workflows SUCCESS: Sabora CI 41245439616, Bootstrap PG17 41245439769 y navegador 41245439601. Se cierra la regresion de has_function_privilege por firma textual bajo login sin USAGE del esquema, usando OID pre-resuelto. Revision del contrato normativo `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`: el cambio de mesa debe preservar la cuenta individual y no mezclar consumos de otros clientes; no existe autorizacion para escoger arbitrariamente una de varias cuentas abiertas. El RPC F12 resolved falla cerrado ante ambiguedad, que sigue siendo bloqueo funcional a resolver con una seleccion autenticada de cuenta sin SELECT directo del login. No activar rutas, roles ni grants hasta demostrarlo con pruebas reales PG17 y E2E. B3 NO-GO.

## 47. Cobertura obligatoria F12 en el gate principal

Auditoria detecto que `pnpm test` no incluia pruebas F12 nuevas pese a workflows verdes anteriores: esas ejecuciones NO demostraban los tests de preflight/composicion/HTTP. Commit 4627b48d corrige asercion del mock que esperaba dos queries cuando el preflight hace tres (identidad, funcion rol, funcion login). Commit 6585fb18 incorpora `table-change-isolated-sql-preflight-candidate.test.mjs`, `table-change-isolated-sql-composition-candidate.test.mjs` y `table-change-sealed-rpc-http-integration.test.mjs` al script `test` obligatorio; H6 Block 1 y `pnpm check` pasan ahora por ellos. CI del nuevo gate pendiente: si falla, corregir causa y repetir, sin dar por acreditados tests omitidos. B3 NO-GO.

## 48. Gate principal F12 acreditado; siguiente hito funcional

Commit 6585fb18050a0e1e36db8d40195862201feeeb43: tres workflows SUCCESS, Sabora CI `41264249688`, Bootstrap PG17 `41264249658`, browser `41264249842`. Las pruebas de preflight F12, composicion SQL aislada y contrato HTTP sellado estan ahora dentro de `pnpm test` y por tanto del gate H6. No confundir el HTTP mock con integracion SQL real ni dar GO de B3. Inventario de bloqueo funcional vigente (`docs/reviews/SABORA_TABLE_TRANSFER_B0_ATOMICITY_DEPENDENCIES_2026-10-31.md`): confirmacion H6 aun debe integrar traslado en flujo activo, recogida debe validar binding operativo de B tras cierre de A, y la PWA necesita E2E completo. Siguiente hito debe abarcar implementacion conjunta de confirmacion + recogida + SSE + pruebas PG17/Playwright, sin grants a runtime ni despliegue mientras no exista autorizacion y evidencia. No relajar aislamiento ni elegir una cuenta economica arbitrariamente ante ambiguedad.

## 49. F12 factory verificada (candidata, sin montaje)

Commit a0204ef2 incorpora `createVerifiedIsolatedTableChangeSqlCandidate`: antes de crear el servicio sellado ejecuta `assertF12SqlCapabilities` sobre los dos pools/login SQL independientes; un fallo impide entregar el servicio. Commit 982a8d2c agrega pruebas de denegacion ante grants indebidos de login y de aceptacion tras preflight dual; ambas integradas en `pnpm test` desde 6585fb18. No se han creado roles/grants ni montado rutas, y la factoría original no verificada sigue disponible como candidata para pruebas, por lo que el cutover exige revisar y usar expresamente la verificada. CI del commit nuevo pendiente. B3 NO-GO.

## 50. F12 factory dual-login: CI PASS y controles negativos adicionales

Commit 982a8d2c validado en Sabora CI `41270325492`, Bootstrap PG17 `41270325493`, browser `41270325524`, todos SUCCESS. La factoría verificada sigue candidata, sin roles ni grants reales ni montaje. Commit 4fd4d1a5 añade regresiones obligatorias que rechazan identidad de login cambiada y logins esperados compartidos, sin ejecutar transacciones de negocio ni inspeccionar el segundo pool tras fallo del primero. La ejecución CI de este último commit está pendiente. El control de login en arranque no sustituye la verificación de credenciales reales ni evita por sí solo deriva de privilegios después del arranque; pendiente definir controles de cutover antes de B3. No declarar GO.

## 51. CI F12 identidad y guardas de confirmacion

Commit 4fd4d1a5: tres workflows SUCCESS (Sabora CI 41291468559, Bootstrap PG17 41291468557, browser 41291468576). Inspeccion de `table-change-h6-contract.test.mjs` detecto que el contrato de orden de cuenta/aprobacion/persistencia, consumo de grant y aislamiento del cutover NO figuraba en `pnpm test`; commit cfe94013 lo incorpora al gate principal. Dos pruebas de readiness de la funcion H6 ACTIVA permanecen `test.skip` por defecto: no presentar el candidato como flujo activo completado. CI nuevo pendiente. B3 NO-GO, sin despliegues.

## 52. Confirmacion candidata: riesgo de persistencia antes de consumir grant

Commit cfe94013 acreditado con Sabora CI 41291805713, Bootstrap PG17 41291805707 y browser 41291805741, todos SUCCESS. Auditoria de la funcion candidata confirma que `persist_customer_order_candidate` se invoca antes de `consume_customer_table_change_h6_candidate`; esto no demuestra que el primer pedido B pueda persistirse con binding aun en A ni que mantenga cuenta unica. Se documenta prueba de aceptacion PG17 real y rollback en `docs/reviews/SABORA_TABLE_TRANSFER_B0_ATOMICITY_DEPENDENCIES_2026-10-31.md` commit 2afbe8fb. Priorizar bloque completo de persistencia/transferencia y recogida, no mas tests superficiales. B3 NO-GO.

## 53. F12 cuenta abierta sin binding: bloqueo antes de persistir

Se añade migracion candidata `20261101010000_sabora_h6_transfer_missing_binding_guard_candidate.sql` (commits 4f87e106, acaa212e) que reescribe por OID exacto solo la funcion sellada de confirmacion transferida y rechaza `h6_open_account_binding_missing` cuando existe cuenta abierta del cliente sin binding operativo, antes de `persist_customer_order_candidate`. Evita entrar en rama de nueva cuenta bajo inconsistencia; no toca funcion activa ni concede EXECUTE. Commit d546ac71 incorpora prueba contractual al gate `pnpm test`. Falta comprobar migracion sobre PG17 real y flujos funcionales de A→B, concurrencia y rollback; NO-GO hasta resultados. No deploy.

## 54. CI de migracion 20261101010000: auditoria obligatoria

CI del commit d546ac71 falló en Sabora CI 41292809096 y Bootstrap 41292809057 por `migration_audit_coverage_mismatch:missing=20261101010000_sabora_h6_transfer_missing_binding_guard_candidate.sql`, no por evidencia de fallo SQL. Se ha registrado la migracion en `scripts/ci/migration-audit.mjs` con permisos, dependencias, impacto de locks y datos (commits f4f34458, correccion de sintaxis 04dc871c). Nuevos workflows 41292910636 / 41292910603 / 41292910601 en progreso. No dar PASS hasta ver resultados; tampoco inferir prueba A→B real del inventario.

## 55. CI migracion 68: inventario consistente y gate en ejecucion

Tras registrar migracion 68 en auditoria, CI 41292910636 y Bootstrap 41292910603 fallaron exclusivamente por test `scripts/ci/migration-audit.test.mjs` que exigia literalmente 67 migraciones (`68 !== 67`); browser 41292910601 SUCCESS. Commit 8e1161b7 cambia la asercion a longitud del inventario revisado y exige al menos 68, manteniendo fail-closed para faltantes o sobrantes. Nuevas ejecuciones: Sabora CI 41293140119, Bootstrap 41293140124, browser 41293140152. Pendientes resultados y prueba funcional PG17 de transferencia. No afirmar cierre B3.

## 56. PG17: correccion del guard de binding tras auditoria de migraciones

Commit 8e1161b7 corrige prueba de recuento de migraciones; workflows 41293140119 y 41293140124 alcanzaron Block 2B PG17, pero fallaron con `h6_transfer_binding_guard_drift`. Se verifico en la migracion previa `20261031030000` que el branch real ya utiliza `v_binding_id` tipado, no `IF FOUND` ni `v_binding.id`; commit 55e3ddaf ajusta el patron de reescritura de la funcion candidata. Su CI detecto test contractual obsoleto que aun esperaba `v_binding.id`; commit f0c7799a lo actualiza. Workflows 41293618050/41293618028/41293618018 en curso. No confundir estos arreglos con una prueba funcional A→B superada; B3 NO-GO.

## 57. PG17 real del guard F12 sin binding

Los tres workflows del commit f0c7799a terminaron SUCCESS: Sabora CI 41293618050, Bootstrap PG17 41293618028, navegador 41293618018. Se incorpora prueba SQL real en `scripts/ci/table-change-root-postgres17.test.mjs`, commit bea335ed, para cliente con cuenta abierta sin binding y primera confirmacion en destino B: exige error `h6_open_account_binding_missing` SQLSTATE 42501 y cero pedidos B / grants, conservando una sola cuenta. CI del nuevo commit: Sabora 41294202929 y Bootstrap 41294202925 en curso, navegador 41294202902 SUCCESS al redactar. Esta prueba negativa NO acredita el camino positivo aprobado A→B ni F12–F23 completos. B3 NO-GO; no merge ni deploy.

## 58. PG17 positivo de consumo atomico F12 (sin cutover)

Commit bea335ed supera Sabora CI 41294202929, Bootstrap 41294202925 y navegador 41294202902, los tres SUCCESS: queda validado el rechazo de cuenta abierta sin binding en PG17 real. Commit c1e37a13 añade al gate `scripts/ci/table-change-root-postgres17.test.mjs` un caso positivo sobre la primitiva sellada `consume_customer_table_change_h6_candidate`: prepara pedido B asociado a la cuenta A, grant aprobado, consume grant y verifica continuidad de cuenta/saldo/historia, binding B, consumo unico y rechazo de replay. Es prueba de primitiva, NO de confirmacion integrada desde API ni de entrega SSE. CI 41296999844 / 41296999807 / 41296999885 en curso al registrar. Si falla, corregir fixture o SQL segun evidencia y relanzar. B3 NO-GO; sin merge/deploy.

## 59. PG17 F12 consumo positivo PASS y rollback ante pedido ajeno

Los tres workflows del commit c1e37a13 terminaron SUCCESS: Sabora CI 41296999844, Bootstrap 41296999807, navegador 41296999885. Queda acreditado el consumo atomico de un grant aprobado por la primitiva sellada con preservacion de la cuenta/saldo/historia, binding a B y replay denegado. Commit 52be4f1f amplia el mismo escenario PG17 con intento de consumir usando order UUID inexistente: espera `table_change_order_scope_forbidden` SQLSTATE 42501, grant aun approved, binding A y saldo inalterado, antes del consumo positivo. CI de este ultimo: Sabora 41299619497, Bootstrap 41299619346, navegador 41299619427 en curso al documentar. Sigue pendiente prueba HTTP confirmacion real A→B, redireccion de entregas, simultaneidad B/C y rollback completo; B3 NO-GO. Sin merge/deploy.

## 60. F12 PG17 entregas mixtas y QR revocado

Commit 52be4f1f PASS en los tres workflows: Sabora CI 41299619497, Bootstrap 41299619346 y navegador 41299619427. Commit 2de2e34c añade revocacion de QR B durante el consumo, esperando `table_change_destination_forbidden` y conservacion del grant/binding; workflows 41300158328/41300158320/41300158363 pendientes al consultar. Commit f8465784 extiende la prueba PG17 de consumo positivo con un pedido historico A de dos lineas, una pendiente y otra recogida: exige que solo la pendiente pase a B, la recogida y el resumen de ronda mixta queden en A y sus versiones sean coherentes. Workflows 41300203989/41300204079/41300204088 en curso. Estas son pruebas de la primitiva sellada con fixture SQL, no confirman aun el flujo integrado cliente/API. B3 NO-GO, sin merge/deploy.

## 61. PG17 QR y entregas mixtas PASS; revocacion de sesion F16

Los commits 2de2e34c (QR destino revocado) y f8465784 (linea pendiente redirigida B, linea recogida y ronda mixta historicas A) superaron sus tres workflows, incluido Sabora CI con PostgreSQL 17: QR Sabora 41300158328, Bootstrap 41300158320, navegador 41300158363; mixtas Sabora 41300203989, Bootstrap 41300204079, navegador 41300204088. Commit 3d3a5ae0 añade en la misma prueba PG17 el rechazo de consumo con sesion del cliente revocada, exige SQLSTATE 42501, conserva grant aprobado y binding A, restaura sesion en transaccion de prueba y consuma validamente. Esta prueba nueva aun requiere CI. La confirmacion HTTP real y concurrencia B/C siguen pendientes; B3 NO-GO; sin merge/deploy.

## 62. F16 PG17 cuenta liquidada y sesion revocada

Commit 3d3a5ae0 agrega rechazo de sesion revocada antes del consumo F12, conservando grant/binding y permitiendo luego el caso valido; CI 41300521855 / 41300521806 / 41300521807 seguia en curso al consultar. Commit 829bf9f8 agrega rechazo de cuenta economica no abierta, con estado preservado y posterior consumo valido. La revision contra la migracion normativa `20261027122858_sabora_h6_events_payments_operations_candidate.sql` encontro que el estado permitido es `settled`, NO `closed`; corregido en commit 256d92cf. La prueba final debe pasar PG17 antes de darlo por cerrado. Sigue sin cubrirse confirmacion HTTP real, carrera B/C ni rollback integrado; B3 NO-GO. Sin merge/deploy.

## 63. F17 cierre funcional del destino no ordenable (candidato aislado)

La revision del consumidor F12 detecto que verificaba visita/QR vigente pero no `dining_tables.ordering_state`: una mesa cerrada podia consumir grant y transferir cuenta si el pedido destino estaba persistido. Se introduce migracion candidata `20261101020000_sabora_h6_transfer_destination_open_guard_candidate.sql` (commit 7ebe614b), que modifica exclusivamente la funcion sellada de consumo para exigir estado `open`, preserva owner y REVOKE y no altera runtime. Auditoria de migracion incorporada en a6a7191a. La prueba PG17 del consumo positivo ahora cierra B con QR valido, exige `table_change_destination_forbidden` y ausencia de efectos, reabre B y realiza consumo positivo; commit final 4bb40fd1. Se corrigio el fixture conforme a `20261021250000_sabora_table_ordering_lifecycle_candidate.sql`: estados reales open/paused/closed, no blocked. CI Sabora 41300878426, Bootstrap 41300878403, navegador 41300878734 en curso al documentar. B3 NO-GO, sin merge/deploy.

## 64. F17 CI rojo diagnosticado y corregido sin relajar guard

Commit 4bb40fd1: Sabora CI run 41300878426 FAIL en bloque 2B PG17, test 40, `table_change_destination_forbidden` SQLSTATE 42501 al ejecutar el consumo positivo. Bloque 2A de migraciones PASS, navegador SUCCESS. Causa comprobada: la mesa B del fixture se creaba en estado `closed` por defecto normativo, y la nueva funcion exigia `open` correctamente. Commit fa36e68d abre expresamente la mesa B en el fixture antes de la comprobacion positiva; la prueba negativa sigue cerrandola y reabriendola. No se relajo la seguridad ni se cambio runtime. Nuevos workflows Sabora 41301155537, Bootstrap 41301155479 y navegador 41301155546 en curso. B3 NO-GO; sin merge/deploy.

## 65. F15 autorizacion aprobada no caduca con TTL de solicitud

Commit a55556f4 amplia el escenario PG17 de consumo atomico de F12/F16/F17 con F15: tras aprobar, `expires_at` se fija en pasado para simular superar los 90 segundos; la autorizacion debe permanecer `approved` y el mismo consumo positivo A→B debe prosperar. Esta prueba evita tratar incorrectamente el TTL de una solicitud pendiente como caducidad del permiso aprobado, conforme al contrato normativo. Sabora CI 41301299712, Bootstrap 41301299705 y navegador 41301299718 en curso al documentar. La correccion del fixture F17 `fa36e68d` tambien estaba pendiente de Sabora/Bootstrap, navegador SUCCESS. No activar runtime: B3 NO-GO; sin merge/deploy.

## 66. Diagnostico CI F17: efectos persistentes de revocacion QR

El commit fa36e68d siguio fallando en PG17 test 40 (`table_change_destination_forbidden`, 42501), aunque la mesa B se abrio. La causa mas probable tras inspeccionar la secuencia es que la prueba revocaba QR mediante incremento de `qr_version` y despues restauraba solo ese numero, sin restaurar posibles efectos de revocacion de visitas producidos por triggers. Para preservar el significado de la prueba negativa y el positivo posterior, commit 30e931a9 aisla la rotacion QR completa en SAVEPOINT y ROLLBACK; commit 52e0785a aplica el mismo aislamiento al cierre/reapertura de mesa B. No se cambia el guard de consumo. Pendiente CI de este commit; si sigue rojo inspeccionar `customer_table_visits.revoked_at` y triggers de rotacion/cierre. Los tests integrados de B/C y rollback del checkout real siguen siendo el hito prioritario. B3 NO-GO, sin merge/deploy.

## 67. F15 restriccion temporal PG17 respetada

CI de 52e0785a: Sabora 41301582727 y Bootstrap 41301582819 FAIL en test PG17 F12/F15, mientras navegador 41301582966 SUCCESS. Causa exacta SQLSTATE 23514 `customer_table_change_requests_check`: el fixture F15 ponia solo `expires_at` en el pasado, pero la restriccion normativa exige `decided_at < expires_at` para aprobaciones. Commit 2c8f83a4 cambia conjuntamente `created_at` (-5min), `decided_at` (-4min) y `expires_at` (-3min) para modelar una aprobacion autenticamente antigua sin relajar SQL. CI nueva Sabora 41301888547, Bootstrap 41301888648, navegador 41301888630 pendiente. B3 NO-GO, sin merge/deploy.

## 68. Regresion PG17 F15/F17 cerrada; siguiente bloque integral pendiente

Commit de codigo `2c8f83a46915898cef0f02d40b09a9d75b96e6b6`: **3/3 workflows SUCCESS**: Sabora CI `41301888547`, Bootstrap `41301888648`, navegador `41301888630`. Se valida en PG17 desechable el escenario F12/F15/F16/F17 con concesion aprobada mas antigua que el plazo, QR revocado, sesion revocada, cuenta settled, mesa destino cerrada, rollback de escenarios negativos y consumo unico con destino operativo B y entregas pendientes. Las funciones siguen selladas; no confundir el resultado con aceptacion de B3.

**Siguiente bloque completo prioritario:** autorizacion de recogida H6 tras transferencia real A→B, cuando la visita A ya fue revocada/cerrada, conservando autorizacion estricta de B y rechazando reocupacion, QR/sesion caducados, pickup duplicado y contaminacion entre comensales. La documentacion tecnica `docs/reviews/SABORA_H6_B2_DELIVERY_PICKUP_BOARD_CANDIDATE_2026-10-31.md` demuestra el defecto actual: `manage_pickup_task_h6_candidate` consulta visita historica A y devuelve 403; no basta el lector de destino B ni el SSE ya probados. El cierre debe comprender migracion SQL candidata aislada, privilegios minimos, prueba PG17 positiva/negativa, HTTP real con JWT, SSE y regresion global, sin activar `server.mjs`. F01–F28/R01–R10 y E2E visual completos siguen pendientes; B3/B4 NO-GO, sin merge/deploy.

## 69. Reconciliacion del bloqueo pickup con el HEAD real

Inspeccion directa de GitHub: `supabase/migrations/20261031110000_sabora_h6_pickup_effective_destination_authorization_candidate.sql` **ya sustituye** la comprobacion historica A por autorizacion del destino efectivo, binding de cuenta, visita y QR vigentes, con propietario y permisos restringidos. Esta registrada en `scripts/ci/migration-audit.mjs`. La seccion 68 debe leerse como **falta de aceptacion positiva integrada**, no como ausencia de implementacion SQL. El informe `docs/reviews/SABORA_H6_B2_DELIVERY_PICKUP_BOARD_CANDIDATE_2026-10-31.md` se reconcilio en commit `388d3dd1`. No duplicar migracion; prioridad: PG17 + HTTP HMAC/JWT real con A revocada, pickup positivo B, negativos B cerrada/QR rotado/reocupacion y eventos. B3 NO-GO, sin merge/deploy.

## 70. Puerta PG17 para autorizacion de recogida por destino efectivo

Commit `2eb1918a2d7e739658c591faeee8f22d45230c64` incorpora una prueba PostgreSQL 17 desechable en `scripts/ci/table-change-root-postgres17.test.mjs` para la funcion H6 de pickup ya existente: SECURITY DEFINER, owner `sabora_h6_fn_owner`, solo rol de operaciones con EXECUTE, destino de linea en lugar de visita historica, binding cuenta/mesa/sesion/visita, QR vigente, mesa abierta, visita no revocada y rechazo SQLSTATE 42501 de HMAC falso. No se cambia la migracion SQL ni los permisos; se evita duplicar la solucion ya existente. CI `41305308175` Sabora, `41305308181` Bootstrap, `41305308223` navegador iniciados, pendientes de conclusion al documentar. **No confundir esta prueba de contrato SQL con el E2E positivo HTTP A→B tras revocacion de A**, todavia pendiente. B3 NO-GO, sin merge/deploy.

## 71. Aceptacion PG17 post-confirmacion A→B: revocacion origen y seguridad destino

Commit `2eb1918a2d7e739658c591faeee8f22d45230c64`: **3/3 SUCCESS** (Sabora CI `41305308175`, Bootstrap `41305308181`, navegador `41305308223`). Commit `d74ef5afdd4c377d4a7a76ff52f7229a2b55d760` amplia el escenario PG17 de **confirmacion integrada real A→B** y pagos Stripe pendientes: revoca la visita historica A, comprueba que la entrega pendiente del pedido antiguo conserva el ambito operativo valido B, comprueba que rotar QR B o cerrar B lo invalida, revierte ambos escenarios con SAVEPOINT para aislar triggers y verifica restauracion del ambito B. No se modifica el SQL de negocio ni grants. Nuevas Actions Sabora `41306255232`, Bootstrap `41306255336`, navegador `41306255260`, pendientes. Esta prueba consulta el mismo conjunto de invariantes que la RPC de pickup, pero **no invoca aun la RPC con capacidad HMAC real**; falta la aceptacion positiva/negativa del HTTP autenticado con pickup y SSE. B3 NO-GO, sin merge/deploy.

## 72. Regresion post-transfer A→B cerrada y punto de integracion existente

Commit `d74ef5afdd4c377d4a7a76ff52f7229a2b55d760`: **3/3 SUCCESS** (Sabora CI `41306255232`, Bootstrap `41306255336`, navegador `41306255260`). Se comprueba en PG17 desechable el checkout integrado A→B, revocacion de visita A, vigencia de la entrega pendiente en B, denegacion por rotacion de QR B y cierre de B con aislamiento SAVEPOINT y restauracion de ambito. Esta verificacion es SQL conductual de invariantes, no la accion pickup.

Para cerrar el hito sin crear arneses duplicados, reutilizar `scripts/ci/h6-postgres17.test.mjs`: ya dispone de los cuatro pools de logins SQL separados, `createH6StaffCapabilityIssuer`, `createH6OperationsRepository`, `MANAGE_PICKUP_TASK_H6_SQL`, `registerH6OperationsHttp` y pruebas HTTP de ciclo real. Combinarlo con el fixture de confirmacion transferida de `scripts/ci/table-change-root-postgres17.test.mjs`, sin ejecutar en Supabase operativo ni montar la funcion candidata en produccion. Demostrar RPC pickup firmada positiva despues de revocar A y negativas de QR B rotado, visita B revocada, mesa B cerrada, nueva ocupacion y replay; verificar eventos SSE y ausencia de mutaciones en rechazos. **No hay evidencia todavia de ese cierre E2E**, por tanto B3/B4 NO-GO. No merge/deploy.

## 73. Prueba de pickup real con HMAC tras revocar A

Commit `0dc618875a807798aec292e17c71733ee3a59d63` extiende el arnes PG17 de `scripts/ci/h6-postgres17.test.mjs`: sobre un pedido HTTP confirmado y una tarea pickup `ready`, prepara en BD desechable el destino operativo B con binding de cuenta y destino por linea, revoca la visita historica A y ejecuta `operations.managePickup` con capacidad HMAC valida emitida por `createH6StaffCapabilityIssuer` y conexion `sabora_h6_operations_ci` que asume solo `sabora_h6_operations_runtime`. El escenario pretende demostrar que la autorizacion efectiva no depende de A. **No simula una aprobacion real mediante RPC en este mismo caso**, y faltan negativas operativas de B, SSE y replay especificos; por ello no es cierre de B3. CI Sabora `41306730881`, Bootstrap `41306730858`, navegador `41306730880` lanzados, pendientes al documentar. No merge/deploy.

## 74. Diagnostico PG17 de la prueba pickup firmada y correcciones de fixture

El primer CI de `0dc61887` (`41306730881`) fallo en Block 2B por `42P08` en `scripts/ci/h6-postgres17.test.mjs:323`: parametro `$3` usado simultaneamente como UUID y text en INSERT de visita. Corregido con casteo UUID/text explicito en `3f31df51`. El siguiente CI (`41307021799`) fallo en Block 2B por `23505` en `order_line_delivery_destinations_pkey`: el flujo HTTP real ya crea la proyeccion por linea; el escenario intentaba insertar una segunda fila con la misma PK. Corregido en `738f7e5084db4da90c4fbdb0b65b04e67d01ef18` sustituyendo INSERT por UPDATE del destino y version. Son fallos de preparacion de fixture, no evidencia de que la RPC de pickup falle; el resultado positivo firmado sigue sin certificarse. Los dos CI previos pasaron Block 1 y Block 2A; navegador de `3f31df51` SUCCESS. Se ha iniciado nueva ejecucion para `738f7e50`. No cerrar B3 sin verde y prueba funcional completa; no merge/deploy.

## 75. Tercera correccion de fixture pickup, sin cambios de negocio

El CI de `738f7e50` fallo Block 2B por `23505 dining_tables_number_key` en `scripts/ci/h6-postgres17.test.mjs:853`: la nueva mesa B de fixture usaba numero `976002`, ya ocupado por otro escenario del mismo arnes. En `dbe9bfda66bff1a7fb83cbc92867bbd293188945` se reserva numero `976099` para el escenario. CI anterior: navegador SUCCESS, Sabora CI FAIL y Bootstrap FAIL. La prueba sigue sin certificado verde; no confundir correcciones de fixture con cierre de pickup. Se espera nueva ejecucion. Sin merge/deploy; B3 NO-GO.

## 76. Pickup firmado positivo verde; rechazo de cierre B requiere aislamiento de triggers

Commit `dbe9bfda66bff1a7fb83cbc92867bbd293188945` **3/3 SUCCESS**: Sabora CI `41307631520`, Bootstrap `41307631525`, navegador `41307631536`. Por primera vez el arnes H6 autentica con HMAC la recogida en destino B tras revocar la visita historica A; el escenario prepara el binding/destino en fixture y no ejecuta en ese mismo test toda la concesion.

Se intento ampliar el mismo escenario con denegacion de recogida firmada al cerrar B (`076d3a5a`, `cd7c5d72`). CI `41308004030` y Bootstrap `41308003968` FAILED, navegador `41308003995` SUCCESS. El cierre y reapertura de B en la misma prueba dejan invalida la visita B y la llamada positiva posterior devuelve `pickup_scope_forbidden` (`h6-postgres17.test.mjs:359`), coherente con posibles triggers de revocacion; no es evidencia de fallo del contrato de autorizacion. Se elimino el escenario destructivo de antes de la llamada positiva en `2bf4f570b556a70971bb3de5287e75a67cf6a047` para conservar el caso positivo verde. **Proximo bloque completo:** construir fixture independiente para denegaciones destructivas (B cerrada, QR rotado, visita revocada/reocupacion) con HMAC y aserciones de no-mutacion, sin restaurar artificialmente estados irreversibles. Reejecutar CI; B3 NO-GO, sin merge/deploy.

## 77. Regresion de denegacion de pickup HMAC despues de recogida valida A→B

Commit `39a81835fa4555cb170b157b2ffb79972aa3cd22` amplia `scripts/ci/h6-postgres17.test.mjs`: primero conserva la prueba positiva de `claim_pickup` con HMAC en B tras revocar A; **despues** cierra B y exige que `cancel_pickup` con nueva capacidad HMAC y version correcta falle con `pickup_scope_forbidden`, sin cambiar estado/version de tarea ni numero de eventos. No intenta reabrir B ni rehabilitar una visita revocada. Esto prueba el rechazo de una accion real de pickup, pero no cubre aun QR rotado/reocupacion con fixtures independientes. GitHub Actions: Sabora CI `41308527577`, Bootstrap `41308527551`, navegador `41308527527` (navegador SUCCESS; restantes en progreso al redactar). No declarar cierre hasta comprobar CI. PR #43 Draft, B3 NO-GO, sin merge/deploy.

## 78. Cierre verde de denegacion de pickup por cierre de B

Commit `39a81835fa4555cb170b157b2ffb79972aa3cd22` **3/3 SUCCESS**: Sabora CI `41308527577`, Bootstrap `41308527551`, navegador `41308527527`. El test PG17 H6 autentica `claim_pickup` en destino B tras revocar A; cierra B, intenta `cancel_pickup` firmado con version valida y comprueba `pickup_scope_forbidden` y no-mutacion de tarea/version/eventos. Se confirma tanto camino positivo como rechazo real de la mesa cerrada en una secuencia que no restaura artificialmente permisos. Siguen pendientes casos aislados QR rotado, visita revocada/reocupada y la integracion unica real de solicitud/aprobacion/confirmacion B/pickup. B3 NO-GO; PR #43 Draft; no merge/deploy.

## 79. Nuevos escenarios HMAC independientes: QR rotado y visita revocada

Commit `f7b158fdc412d7c2ac01edb8bbfbe7d6eed6d1b5` amplía `scripts/ci/h6-postgres17.test.mjs` con dos destinos independientes para la misma tarea de pickup previamente reclamada: mesa C abierta con QR rotado y mesa D abierta con visita explicitamente revocada. En cada destino crea visita/operational binding/proyeccion de linea coherentes antes de invalidar exclusivamente el control objeto de prueba, intenta `cancel_pickup` con HMAC de camarero y version correcta, exige `pickup_scope_forbidden` y compara estado, version y recuento de eventos con snapshot previo. El escenario de cierre de B permanece separado. CI: Sabora `41309922043` en progreso, Bootstrap `41309922013` en progreso, navegador `41309922038` SUCCESS al documentar. **No declarar escenarios validados hasta CI completo.** Pendiente E2E real solicitud/aprobacion/confirmacion B/pickup y cobertura reocupacion; B3 NO-GO, sin merge/deploy.
