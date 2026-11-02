# CartaViva / Sabora — continuidad viva para la sesión 19

**Creación:** 2026-11-02. **Naturaleza:** documento operativo de continuidad, NO NORMATIVO. **Estado inicial:** B3/F12 NO-GO; PR #43 Draft. Este archivo debe actualizarse después de cada hito significativo de la sesión 18, sin esperar al cambio efectivo de sesión.

> La fuente de verdad son los documentos normativos vigentes del repositorio. Este handoff no modifica ni sustituye sus requisitos. Contrastar siempre HEAD, código, PR y resultados reales de CI antes de actuar.

## 1. Límites de actuación

- Único repositorio autorizado: `jdlc86/CartaViva`. Sabora es una instalación para un único restaurante.
- No hacer merge, despliegue, reinicio, cutover, grants ni migraciones/escrituras en Supabase operativo o VPS sin autorización expresa.
- No modificar, detener ni depender de Fleetia ni de otros proyectos del VPS.
- PostgreSQL 17 de pruebas desechable y aislado; roles temporales y rollback. Mantener runtime normal fail-closed.
- Priorizar bloques funcionales completos y pruebas integradoras; usar pruebas aisladas solo para diagnóstico específico o protección crítica.
- Distinguir siempre código implementado, prueba ejecutada y funcionalidad validada. No atribuir un PASS a otro SHA.

## 2. Lecturas de arranque obligatorias

1. `docs/REQUISITOS_FUNCIONALES.md` y `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, más los contratos normativos vigentes de cambio de mesa, identidad, QR, cuentas/pagos, cocina/sala, pickup, SSE y diseño visual aprobado.
2. `docs/assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md` (F01–F28 y R01–R10), subordinada a normativa.
3. `docs/handoffs/SESSION_18_HANDOFF_2026-11-01.md`, especialmente secciones 45–55 y actualización de 2026-11-02; `docs/handoffs/SESSION_17_HANDOFF_2026-10-31.md` para antecedentes.
4. Informes técnicos B3/F12, SQL, seguridad, migraciones y revisión independiente más recientes.
5. PR #43 https://github.com/jdlc86/CartaViva/pull/43 y HEAD real, diffs, checks y logs de fallos.

## 3. Fotografía verificada al crear el documento (2026-11-02)

- Rama: `integration/sabora-h6-b2-delivery-board-contract-20261031`; PR #43 abierto y Draft.
- HEAD previo a este archivo: `971f6c8f07c43d145f8c2070b135dcf237b2770e` (`test(sabora): send required JSON content type for authorized decision`).
- GitHub Actions del SHA `971f6c8f`: **Sabora CI FAILURE** run `41420226860`; Bootstrap lockfile **SUCCESS** run `41420226846`; browser conformance **SUCCESS** run `41420226775`. Consultar logs para identificar el fallo; NO declarar 3/3 verde.
- El SHA anterior `38d0d561b4e759ab1e264b0926ab334310af8583` sí tuvo 3/3 SUCCESS, pero no valida los cambios del HEAD posterior.
- Ya existen cinco logins/pools físicos restringidos PG17 y composición B3 probada, solicitud HTTP cliente positiva con SQL real y concurrencia de solicitudes; transferencia económica SQL real aislada; HTTP de checkout/replay simulado.
- Al cierre de sesión 17 se incorporó identidad legítima de camarero activo y llamada HTTP de aprobación mediante conexión restringida PG17; se exige aprobación sin traslado económico anticipado. **La validación completa del commit actual falla en Sabora CI** y el recorrido económico HTTP A→B sigue pendiente. No inferir que la aprobación ya está validada hasta inspeccionar el error y repetir.
- No hay aceptación final F01–F28/R01–R10 ni E2E unificado PWA/Fastify/PG17/pagos/pickup. **B3/F12 NO-GO**.

## 4. Invariantes funcionales y de seguridad

- Escaneo QR libre; visita creada con primer pedido enviado tras ventana aprobada. Solicitud de abandonar A sin declarar destino; mientras está pendiente puede seguir pidiendo en A.
- Decisión por personal autorizado, no cocina. Aprobación no traslada cuenta ni consumo; rechazo/caducidad no desvinculan. Caducidad de solicitud pendiente a los 90 segundos según normativa vigente.
- Tras aprobación, primer pedido válido confirmado en B materializa transferencia A→B, preservando exactamente un `account_id`, saldos, pagos, historial y destinos de líneas pendientes; concesión consumida una sola vez dentro de la transacción.
- Replay/concurrencia/rollback no crean otra cuenta ni duplican consumo; revocación QR/sesión, reocupación y cierre deben fallar cerrados. Mantener garantías pay_now/pay_at_end, pickup y SSE.
- Roles SQL mínimos y separados: cliente F12, decisión personal F12, writer B3, lector H6 y cesta/cotización. No entregar pools crudos ni ampliar EXECUTE operativos.
- PWA y diseño premium conforme a flujos e identidad visual aprobados.

## 5. Hito prioritario completo de sesión 18

1. Diagnosticar Sabora CI run `41420226860` en HEAD `971f6c8f`; corregir causa concreta y ejecutar nueva CI completa. No repetir pruebas que no contribuyan al diagnóstico.
2. Verificar en el mismo fixture PG17 real con cinco conexiones restringidas la solicitud HTTP cliente y aprobación HTTP por camarero activo, comprobando `approved` y permanencia económica en A; denegar cocina, suplantación, duplicados y expiración.
3. Enlazar confirmación del primer pedido en B por el camino HTTP candidato seguro y la RPC transaccional real; verificar cuenta única, pagos/historial, transferencia de pendientes, consumo único y destino efectivo pickup.
4. Probar replay y concurrencia de checkout, rollback y negativas de QR/sesión revocados, B inválida/reocupada, cierre y expiración; no duplicar pruebas SQL ya cubiertas salvo necesidad de verificar integración.
5. Completar PWA cliente/gestión, SSE, cocina/sala, Playwright/axe/responsive, matriz F01–F28/R01–R10, regresión PG17, auditoría migraciones y Actions. Mantener NO-GO hasta evidencia integral y revisión independiente.
6. Documentar hitos en informe técnico, PR #43 y **este mismo handoff**. Sin merge ni despliegue.

## 6. Archivos técnicos de entrada

- `apps/api/src/table-change-http-candidate.mjs`
- `apps/api/src/table-change-sealed-rpc-candidate.mjs`
- `apps/api/src/table-change-isolated-sql-composition-candidate.mjs`
- `apps/api/src/table-change-b3-confirmation-preflight-candidate.mjs`
- `apps/api/src/customer-production-flow.mjs`
- `apps/api/src/table-change-postgres-store.mjs`
- `scripts/ci/table-change-root-postgres17.test.mjs`
- `scripts/ci/h6-postgres17.test.mjs`
- `supabase/migrations/20261031010000_sabora_h6_transfer_confirmation_integration_candidate.sql`

Verificar ubicación y vigencia en HEAD; revisar migraciones posteriores, sin reescribir historial.

## 7. Registro vivo de hitos

| Fecha | SHA / run | Resultado comprobado | Límite y siguiente acción |
| --- | --- | --- | --- |
| 2026-11-02 | `971f6c8f`; CI `41420226860`, Bootstrap `41420226846`, browser `41420226775` | CI **FAILURE**, otros dos **SUCCESS** | Diagnosticar CI, corregir y repetir; aprobación legítima HTTP/PG17 y transferencia económica completa aún no validadas |
| 2026-11-02 | Creación del handoff sesión 19 | Solo documentación; SHA del commit nuevo a consultar | No atribuir al commit documental las pruebas del SHA anterior |

**Regla de mantenimiento:** actualizar este mismo archivo tras hitos importantes, con fecha, rama, SHA, pruebas ejecutadas, IDs y resultados reales, alcance validado, fallos, riesgos y siguiente paso. Conservar el historial y rectificar afirmaciones superadas.

## 8. Prompt corto de arranque sesión 19

> Continúa CartaViva/Sabora exclusivamente en `jdlc86/CartaViva`. Lee primero normativa vigente y después `docs/handoffs/SESSION_19_HANDOFF_2026-11-02.md`, el handoff 18, PR #43 y HEAD/CI. Corrige la CI fallida del último HEAD, cierra B3/F12 como hito vertical real: aprobación HTTP por camarero autorizado con cinco logins PG17, sin traslado en aprobación, primer checkout B con transferencia económica atómica y cuenta única, replay/concurrencia, pagos, pickup/SSE, PWA y aceptación F01–F28/R01–R10. Actualiza este mismo handoff al cerrar hitos. Sin merges, despliegues, cambios operativos en Supabase/VPS ni tocar Fleetia. NO-GO hasta validación integral.

## 9. Diagnóstico de CI del 2 de noviembre

La ejecución 41420226860 falló en el bloque H6 2B de integración PostgreSQL 17. El job 125193725462 registra SQLSTATE 40P01 (deadlock detected) durante una prueba de confirmaciones concurrentes. Referencias: scripts/ci/h6-postgres17.test.mjs línea 415 y apps/api/src/customer-production-flow.mjs línea 178. Los bloques 1 y 2A finalizaron correctamente. No se ha determinado todavía el ciclo exacto de bloqueos ni se ha demostrado que lo provoque el cambio HTTP. Investigar con pruebas PG17 aisladas y conservar la concurrencia real. PR 43 sigue Draft y B3/F12 NO-GO.

## 10. Inspección del recorrido concurrente H6

Se ha inspeccionado el código de `customer-production-flow.mjs` y la prueba `h6-postgres17.test.mjs`. La línea 415 ejecuta dos `flow.confirm(request)` concurrentes con idéntica clave de idempotencia; exige un `confirmed`, un `replayed`, y mismos `orderId` y `accountId`. `confirm` ejecuta una primera transacción para `LOOKUP_ATTEMPT_SQL` y preparación de líneas y una segunda para `PERSIST_H6_ORDER_SQL`; las conexiones usan `SET LOCAL ROLE` y `ROLLBACK` ante error. El error SQLSTATE 40P01 del run 41420226860 todavía no identifica el ciclo exacto de locks. Antes de alterar SQL o introducir reintentos, inspeccionar las funciones PostgreSQL y los locks en el fixture PG17; conservar las garantías de idempotencia. No se ha ejecutado una nueva prueba ni corregido código en este punto.

## 11. Investigación de orden de bloqueos H6 (2026-11-02)

La prueba de CI que falla usa `PERSIST_H6_ORDER_SQL` (ruta H6 original), no el writer B3 de transferencia. La función H6 original toma `FOR UPDATE` sobre `customer_sessions` antes de invocar `persist_customer_order_candidate`; este último invoca `lookup_customer_order_attempt_candidate`, que toma `FOR UPDATE` sobre mesa y `FOR SHARE` sobre sesión y visita. El primer tramo de `flow.confirm` usa esa misma función lookup y prepara líneas con bloqueos sobre mesa. Existe riesgo de inversión mesa/sesión entre dos conexiones. La migración `20261031070000_sabora_h6_transfer_session_lock_order_candidate.sql` ya elimina dos bloqueos de sesión en la función B3 candidata, pero NO modifica la función H6 original utilizada por esta prueba. Esto explica por qué una mitigación candidata no cubre necesariamente el fallo de CI. Es hipótesis de causalidad; falta reproducción con traza de bloqueos PG17. Antes de cambiar H6 original, contrastar normativa, revocación concurrente y cobertura de RLS. No se han modificado funciones SQL ni ejecutado nuevas pruebas.

## 12. Corrección candidata H6 original (2026-11-02)

Commit `9769d27a37fa10cbcdd42b3d493d95a4703b0c0a`: nueva migración `supabase/migrations/20261102010000_sabora_h6_original_confirmation_lock_order_candidate.sql`. Cambia a `FOR SHARE` dos bloqueos de sesión y dos de visita dentro de la función H6 original; mantiene bloqueos de fila frente a revocación y el advisory lock de cliente, sin alterar el writer B3 ni ampliar privilegios. Usa verificación de definición previa y aborta ante drift. **Solo código implementado**: aún no existe prueba PG17 ni CI confirmada para este SHA. Verificar aplicación de migración, prueba concurrente H6 original, negativas de revocación y regresión integrada antes de dar PASS. PR 43 Draft, B3/F12 NO-GO.

## 13. Gate de auditoría para la migración H6 (2026-11-02)

La CI del commit `9769d27a` falló en Block 1 (no alcanzó PG17): `migration_audit_coverage_mismatch:missing=20261102010000_sabora_h6_original_confirmation_lock_order_candidate.sql`. La prueba registró 1165 PASS, 1 FAIL y 2 SKIP; el fallo no valida ni invalida la corrección SQL. Se añadió ficha individual en `scripts/ci/migration-audit.mjs` mediante commit `d64a5cd9e43e7df2664aaccbcb9a38a2bdae1da4`, conservando el gate fail-closed. Queda pendiente comprobar nueva CI y ejecutar prueba PG17 concurrente real. No afirmar H6 PASS ni B3 GO.

## 14. Cierre del gate H6 original (2026-11-02)

El commit `b6872a97f6b711ba478ebb0a510ad525e7d76e82` actualizó la prueba `scripts/ci/table-change-root-postgres17.test.mjs` para exigir el advisory lock de cliente, locks `FOR SHARE` de sesión/visita y orden persistencia→cuenta→ronda→destino, sin retirar la aceptación PG17. Tres workflows de ese SHA finalizaron SUCCESS: Sabora CI `41424727544`, Bootstrap PostgreSQL 17 `41424727514` y conformidad navegador `41424727576`. El fallo anterior era una aserción obsoleta sobre `FOR UPDATE`; esta revisión pasó toda la aceptación automatizada del SHA. **H6 original validado por CI**, pero B3/F12 y traslado económico E2E completo permanecen NO-GO. No hubo merge, despliegue ni cambios en Supabase operativo/VPS/Fleetia.


## 15. Integración transporte PWA ↔ RPC sellado y seguimiento CI (2026-11-02)

Se corrigió una incompatibilidad real: el endpoint sellado `POST /api/v1/customer/table-change/requests` devuelve legítimamente `{id,status,expiresAtMs}`, mientras que el transporte de la PWA exigía además `sourceTableId` y `createdAtMs`. Commit `855ab51c` acepta el contrato mínimo, conserva la validación de campos opcionales y evita exigir identificadores económicos; commit `c6e9a77d` añade regresión de respuesta mínima y datos opcionales inválidos. Los tres workflows de `c6e9a77d` terminaron SUCCESS (CI, bootstrap y navegador).

La integración Fastify ↔ transporte real de PWA añadió prueba de cooldown `3e89d8a3`; dos workflows fallaron porque el test esperaba una consulta SQL menos de las realmente ejecutadas (1166 PASS, 1 FAIL, 2 SKIP). Commit `2f96faae` corrigió la secuencia y el índice de comprobación del camarero. Commit `4ed71f5b` añadió un escenario HTTP positivo de respuesta mínima con Fastify y SQL simulado. Al último seguimiento los tres workflows de `4ed71f5b` estaban en ejecución; `2f96faae` tenía navegador SUCCESS, CI y bootstrap aún en ejecución. **No atribuir PASS al HEAD hasta que terminen los workflows de ese SHA.**

Estas pruebas HTTP usan un adaptador SQL simulado: no certifican transferencia económica PostgreSQL 17 real ni E2E cliente/camarero/cocina. El contrato normativo sigue exigiendo 90 s de bloqueo, notificaciones durables, decisión del camarero y transferencia A→B únicamente en la primera confirmación de pedido en destino. La composición B3 es opt-in, no un runtime productivo validado. Próximo hito: integrar el estado de solicitud y la cola de sala mediante funciones SQL de privilegio mínimo, conectar ambas PWA con el diseño aprobado y ejecutar PG17 real + navegador E2E. PR #43 Draft, B3/F12 NO-GO. Sin merge, despliegue ni modificaciones de Fleetia/VPS/Supabase operativo.


## 16. Transporte de decisiones del camarero y composición autenticada (2026-11-02)

- `c1245a0b`: módulo `apps/management/src/table-change-decision-gateway.js`, que valida UUID y decisión `approved|rejected`, envía únicamente `{requestId,decision}` y valida estrictamente la respuesta pública. No introduce credenciales persistidas.
- `ef93fbe6`: cuatro pruebas del módulo. CI y bootstrap fallaron por un defecto concreto del nuevo validador UUID (faltaba un grupo de cuatro dígitos); navegadores de cliente y gestión SUCCESS.
- `61719461`: corrige UUID de cinco grupos; **CI, bootstrap, navegador cliente y smoke visual gestión SUCCESS**.
- `965c928c`: expone `decideTableChange` desde `createAuthenticatedOrderOperationsGateway`, reutilizando `send` con bearer renovado por petición, `credentials:'omit'` y revocación de sesión.
- `07a9328f`: prueba de bearer, payload y revocación. **Cuatro workflows SUCCESS** (CI, bootstrap, navegador cliente y smoke visual gestión).
- `1b38fbac`: prueba Fastify real + gateway autenticado PWA + RPC sellada con SQL simulado, incluyendo denegación de nuevas operaciones tras revocar. **Workflows pendientes** al último seguimiento; no declarar PASS hasta comprobar el SHA.

El avance es un **contrato de transporte autenticado**, no una bandeja de solicitudes ni una funcionalidad operativa activada. No existe aún lectura SQL autorizada de solicitudes pendientes ni montaje visual aprobado en `TablesView`; tampoco confirmación económica A→B validada con PostgreSQL 17 real. No conectar una bandeja con datos ficticios o con lectura directa privilegiada. Próximo bloque integral: función/proyección SQL mínima de pendientes con permisos, endpoint autenticado, gateway, vista aprobada y pruebas de integración PG17 + navegador. PR #43 Draft, B3/F12 NO-GO. Sin merge, despliegue o intervención en Fleetia/VPS/Supabase operativo.


## 17. Bandeja F12 pendiente: contrato HTTP/PWA y SQL sellado sin activar (2026-11-02)

- `c2763517`: endpoint opt-in `GET /api/v1/operations/table-change/pending`, con guard `admin|waiter`, proyección pública mínima `requestId/sourceTableNumber/expiresAt`, límite 100, `no-store` y error genérico ante fallos internos. No se monta en el bootstrap.
- `378648b2`: pruebas HTTP de autorización por rol, rechazo de cocina y privacidad.
- `395cb3b8`, `f12459a7`, `f898cfff`: lector estricto en el gateway de gestión, exposición a través del bearer revocable y pruebas de respuesta. La primera implementación contenía una expresión regular escapada incorrectamente: CI/bootstrap/smoke gestión FALLARON.
- `5b417764`: corrige el error sintáctico de expresión regular. Navegadores cliente y gestión SUCCESS; CI/bootstrap seguían en curso al consultar.
- `51396a6a`: prueba PWA autenticada → Fastify GET pendientes, con revocación. Navegadores cliente y gestión SUCCESS; CI/bootstrap todavía sin confirmación.
- `3a8fbe68`: migración **candidata** `20261102120000_sabora_h6_pending_staff_projection_candidate.sql`: función `SECURITY DEFINER` que comprueba personal activo de sala/admin y lista solo solicitudes pendientes no caducadas con mesa origen y caducidad, máximo 100. No se concedió `EXECUTE` a ningún runtime; el rol F12 de decisiones sigue con una sola RPC. **Sin prueba PG17 real confirmada**, sin validación aún de permisos del propietario/RLS para todas las tablas leídas. No desplegar la migración ni conectar el endpoint sin ese cierre.

La función SQL no implica que la bandeja sea operativa: falta rol lector separado y preflight de superficie exacta, servicio de lectura enlazado al HTTP, UI de gestión conforme a diseño normativo, prueba de caducidad/competencia y E2E PG17+Chromium. B3 sigue NO-GO, PR #43 Draft. No merge, VPS, Fleetia ni Supabase operativo.


## 18. Lector de pendientes con preflight de rol separado (2026-11-02)

- `1d5319e7`: se registra formalmente la migración candidata de proyección en `scripts/ci/migration-audit.mjs`. Antes de este commit CI/bootstrap fallaban por `migration_audit_coverage_mismatch` (migración nueva no auditada).
- `842e19f0`, `ccb069db`: servicio `createPendingTableChangeReader` que ejecuta una única sentencia `SELECT request_id,source_table_number,expires_at FROM sabora.list_pending_table_changes_h6_candidate($1::uuid)`, exige staff verificado y restringe la proyección. Pruebas de binding, privacidad y denegación cocina.
- `c6df9db1`, `af994a92`: preflight independiente `assertPendingReaderCapabilities`: login NOINHERIT, no superusuario/BYPASSRLS/DDL/SELECT directo, exactamente un SET ROLE hacia `sabora_f12_pending_reader_runtime`, ninguna RPC Sabora ejecutable desde el login y exactamente la función de pendientes desde el rol.
- `413f462f`, `eccab346`, `d18fdbf2`: fábrica verificada que rechaza activar el lector sin preflight; rol centralizado para evitar importación circular.
- `0ec3e9e9`: pruebas de preflight contra grants directos, heredados y RPCs sobrantes.
- **Pendiente crítico**: la migración de proyección no crea ni concede el rol lector; se mantiene sin EXECUTE deliberadamente. El preflight no ha sido ejecutado todavía contra PG17 real con dicho rol, ni se ha demostrado que el propietario SECURITY DEFINER pueda leer las tablas bajo FORCE RLS. No se puede activar ni montar endpoint/UI por inferencia.
- CI de los últimos SHA en curso al redactar; no confundir suites de navegador aprobadas en SHA anteriores con validación del HEAD.

Próximo hito: preparar y validar en PostgreSQL 17 desechable los permisos mínimos de la función y el lector, completar la composición HTTP y la bandeja visual conforme a la referencia aprobada, ejecutar E2E de aprobación/caducidad/transferencia y documentar evidencias. B3 NO-GO / PR #43 Draft, sin despliegues, merges ni acceso a Fleetia o al VPS.


## 19. Composición F12 de bandeja con rol SQL aislado (2026-11-02)

- `b2803fa6`: migración candidata `20261102130000_sabora_h6_pending_reader_role_candidate.sql`: rol `sabora_f12_pending_reader_runtime` NOLOGIN/NOINHERIT, USAGE de esquema y EXECUTE de una única RPC; grants SELECT por columnas y políticas de lectura para el propietario `sabora_h6_fn_owner` en relaciones FORCE RLS. **No crea login ni concede membresía SET ROLE**. La migración NO se ha aplicado a Supabase operativo.
- `7e36f5a9`: registro de revisión de migración en `scripts/ci/migration-audit.mjs`.
- `8d456bf3`: `registerVerifiedPendingTableChangeHttpCandidate` compone preflight independiente + lector SQL de una sentencia + ruta GET protegida; no monta en producción por defecto.
- `20ab3747`: pruebas integradas de GET con rol aislado simulado y de no montaje ante login con permisos directos.
- Las suites del HEAD estaban en cola al consultar, por lo que **no se declara CI PASS**. Falta ejecutar migraciones en PG17 desechable, validar que la función owner ve solicitudes bajo RLS, probar expiración y concurrencia, montar interfaz visual conforme al diseño normativo y completar transferencia económica E2E. B3 NO-GO, PR #43 Draft; sin merge, despliegues ni modificaciones de Fleetia/VPS/Supabase operativo.


## 20. PWA de gestión: bandeja candidata de solicitudes (2026-11-02)

- `2a4ced1e`: `TableChangeRequestsPanel` con lectura explícita, estado vacío/error/carga, caducidad visible y acciones aprobar/rechazar. La aprobación NO transfiere la cuenta; solo una confirmación posterior en otra mesa puede hacerlo.
- `956ff79d`: inserción condicional del panel en `TablesView`, sin afectar al inventario de mesas ni a la vista sin gateway.
- `3c17cc89`: dependencia `tableChangeGateway` opcional en `ManagementApp`; el bootstrap autenticado actual no la suministra y la vista de diseño tampoco. **No está activada funcionalmente**.
- CI de los nuevos commits estaba en cola en la última consulta (gran acumulación de workflows), por lo que no se declara build/Playwright PASS del HEAD. Falta validación visual contra la referencia normativa, E2E navegador, PG17 real de RLS/ACL y autorización de un login aislado antes de montar la ruta. PR #43 Draft, B3 NO-GO; no merge ni despliegue.


## 21. Corrección de aislamiento y caducidad UI (2026-11-02)

- `998f9ad3`: corrección de arquitectura en `table-change-pending-reader-candidate.mjs`. El verificador de staff ya no recibe ni usa el query SQL del lector; se ejecuta contra la identidad verificada de la capa HTTP antes de abrir la transacción de rol. La única sentencia permitida del lector sigue siendo la RPC de pendientes, que revalida rol y estado activo en SECURITY DEFINER. Evita que un verificador trate de usar SELECT fuera de la whitelist o que se amplíe el rol para acomodarlo.
- `954389d8`: el panel de gestión actualiza únicamente el reloj local cada segundo para deshabilitar decisiones tras la caducidad, sin polling de datos ni exposición de credenciales.
- CI para HEAD y commits recientes permanecía en cola al consultar. No declarar validación de navegador/PG17 ni aprobación visual definitiva. Sigue faltando prueba integrada de SQL real, autenticación efectiva del login aislado y recorrido cliente→personal→confirmación económica. PR #43 Draft / B3 NO-GO; no merge, despliegue ni Fleetia/VPS/Supabase operativo.


## 22. CI real y corrección de contrato sin sondeo (2026-11-02)

- Evidencia GitHub Actions: en SHA `20ab3747` los cuatro workflows (Sabora CI, Bootstrap lockfile, navegador gestión y navegador cliente) finalizaron SUCCESS. Esto valida ese SHA, no los cambios posteriores.
- En SHA `4622929f`, CI y bootstrap finalizaron FAILURE: 1177 tests, 1173 PASS, 2 FAIL, 2 SKIP; ambos fallos procedían del gate `periodic_business_polling_detected` (un `setInterval` en `TableChangeRequestsPanel`). Los dos workflows de navegador de ese SHA sí terminaron SUCCESS.
- `e15f6b0d`: se sustituyó el intervalo por un único `setTimeout` a la siguiente caducidad conocida. El panel no sondea backend; reevalúa el estado al vencer la solicitud. **No declarar CI PASS hasta conocer el resultado de los workflows de este SHA**.
- Prioridad: validar el HEAD, ejecutar PG17 real con login/rol lector y FORCE RLS, comprobar la bandeja en navegador con gateway autorizado y cerrar E2E de transferencia. PR #43 Draft / B3 NO-GO. Sin merge, despliegue ni cambios en Fleetia, VPS o Supabase operativo.


## 23. CI verde y prueba integrada de lector PG17 (2026-11-02)

- Evidencia Actions: los cuatro workflows de `570f3d09` y los cuatro de `e15f6b0d` terminaron SUCCESS. Se considera resuelta la regresión de sondeo periódico en dichos SHA, sin extrapolar a cambios posteriores.
- `c9a74f29`: prueba nueva dentro del arnés PG17 real `scripts/ci/table-change-root-postgres17.test.mjs`, ejecutado por `catalog-postgres17-node-driver-smoke.sh`. Inspecciona propietario SECURITY DEFINER y EXECUTE por rol, NOLOGIN/NOINHERIT/BYPASSRLS, consulta vacía para camarero activo y denegación a cocina y SELECT directo bajo SET LOCAL ROLE; datos de personal insertados en transacción revertida.
- **Prueba añadida, aún sin resultado de CI confirmado para `c9a74f29`**. No cubre todavía login físico dedicado con preflight completo, solicitudes pendientes con datos reales ni E2E de traslado económico. La nueva prueba podría descubrir un defecto en grants/RLS: corregirlo antes de avanzar. PR #43 Draft / B3 NO-GO, sin merge, despliegue ni cambios en Fleetia/VPS/Supabase operativo.


## 24. PG17: primera ejecución de la prueba de bandeja y corrección (2026-11-02)

- Actions para `c9a74f29`: browser gestión y cliente SUCCESS; CI y bootstrap FAILURE. En CI: bloque 2A de migraciones/privilegios PG17 PASS, bloque 2B FAIL en el test nuevo de lector porque la aserción refería `sabora_f12_operations_runtime`, rol aún no provisionado en el arnés PG17 (error PostgreSQL `role ... does not exist`). **No atribuir este fallo a la función de lectura**: el test abortó antes de probar su comportamiento.
- `3af58186`: corregida la aserción para consultar `sabora_h6_operations_runtime`, rol existente en el arnés y explícitamente revocado en la migración de la función. No se amplían ACL ni roles. Workflows del commit corregido pendientes de confirmación.
- Siguiente decisión según CI: si falla por ACL/RLS, corregir causa real en migración y repetir PG17; después ampliar al login físico NOINHERIT con preflight. No activar la bandeja ni declarar B3 GO. PR #43 Draft, sin merge, despliegue ni Fleetia/VPS/Supabase operativo.


## 25. Refuerzo de pruebas de privilegios mínimos (2026-11-02)

- `1d5849ad`: la prueba PG17 integrada del lector F12 ahora exige denegación de SELECT directo sobre `staff_members`, `customer_accounts` y `dining_tables`, además de denegación de EXECUTE de la función de decisión, bajo `SET LOCAL ROLE sabora_f12_pending_reader_runtime`. Se conserva la prueba de autorización waiter/kitchen y de propietario SECURITY DEFINER.
- En el momento de la revisión, las CI de `3af58186` y `ab881058` seguían en ejecución; ambos SHA tenían browser gestión y cliente SUCCESS. No hay todavía resultado PG17 confirmado del test corregido ni del refuerzo `1d5849ad`.
- La nueva prueba es cobertura de un requisito crítico, no una activación de permisos. Siguiente: observar resultados PG17, corregir causas SQL reales si aparecen, completar preflight de login físico y E2E económico. PR #43 Draft / B3 NO-GO; sin merge, despliegues ni Fleetia/VPS/Supabase operativo.
