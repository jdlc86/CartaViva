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
