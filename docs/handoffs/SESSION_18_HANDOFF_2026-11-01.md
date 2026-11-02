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

## 12. Aislamiento de identidad entre los tres pools B3/F12 (2026-11-01)

- Commits `3236e384db4ef0b13e1f01ea4bd712d38d14e1d8` y `1716b99e290f7aaaf2788de6ed35ca3a16a09b6a`: la composición B3 rechaza **antes de cualquier consulta SQL** que el login de confirmación coincida con el de solicitud del cliente o el de decisión del personal, incluso cuando los pools sean objetos distintos. Test comprueba rechazo de ambas identidades reutilizadas, cero queries y cero construcción del flujo. Esto cierra una posibilidad de confusión de principales; no constituye montaje HTTP ni activación.
- **CI de estos commits todavía no verificada al registrar el hito**; consultar workflow del HEAD más reciente y corregir si falla. PR #43 Draft, B3/F12 NO-GO. Sin merge, despliegue ni cambios en VPS/Supabase operativo/Fleetia.

## 13. Prueba integrada de puerta B3/F12 para tres identidades (2026-11-01)

- Commit `444f38087bcaafc6c9250a839b2927dfa2e90daf`: la suite de composición B3 comprueba el camino **positivo** de los tres preflights independientes (cliente, personal y confirmación) y verifica que solo entonces se construye el flujo de confirmación. También cubre **rechazo de privilegios adicionales** tanto al rol B3 como directamente al login, sin emitir SQL de negocio ni construir confirmación.
- **Alcance limitado:** los pools de esta prueba son dobles controlados y la función `confirm` es simulada; no prueba la confirmación atómica real, el recorrido HTTP/PWA ni los efectos en cuenta/pagos/recogida. El PG17 real de privilegios fue validado previamente en el subhito 11. **CI de este nuevo commit pendiente**.
- Auditoría pendiente antes de integración real: la composición B3 acepta una factoría de confirmación externa; verificar que el runtime final utilice exclusivamente el SQL de transferencia autorizado y resuelva correctamente lectura/replay H6, sin reutilizar el rol de confirmación para operaciones no permitidas. No declarar GO sin ello.
- Sin merges ni despliegues, sin tocar Fleetia, VPS o Supabase operativo; PR #43 Draft y B3/F12 NO-GO.

## 14. Sellado del escritor de confirmación B3 (2026-11-01)

- Commits `b564e1a77c833cd5b8ccdb33717d2a84445a557f` y `38956f990c289ed9ebee39d6bdd751266c75eedb`: se retira la entrega del pool SQL crudo a `createConfirmationFlow`. La factoría recibe únicamente `withConfirmationTransaction`, con `SET LOCAL ROLE sabora_b3_confirmation_runtime` y allowlist de **solo** `PERSIST_H6_TRANSFER_ORDER_SQL`. Test: SQL H6 anterior rechazado y ROLLBACK; SQL de transferencia aceptado y COMMIT. No se crean grants ni se monta la ruta.
- **Limitación deliberada:** la confirmación de cliente H6 existente también necesita otras consultas (por ejemplo, lectura de ronda para replay); no reutilizar este escritor para ellas. Se requiere composición con pools y capacidades separados, y una prueba integrada de replay/transferencia antes del GO. Los tests nuevos y CI de este HEAD están pendientes de verificar.
- PR #43 Draft, B3/F12 NO-GO. Sin merge, despliegue, ni modificaciones de Supabase operativo, VPS o Fleetia.

## 15. Cierre de CI del escritor B3 y protección de la factoría (2026-11-01)

- HEAD `d27dafaf0765f0d58a235930171444cc0ea710a8` **3/3 SUCCESS**: navegador `41323257051`, Bootstrap `41323257041`, Sabora CI `41323257075`. Queda verificado el escritor transaccional restringido a la función de transferencia.
- Commit `4041175c55260dcf68a12a0479270c1fd19f8747`: prueba adicional desde la **factoría verificada**: solo se entrega `withConfirmationTransaction`, no el pool crudo; un consumidor que intente ejecutar el SQL H6 heredado recibe `role_scoped_sql_not_allowed` y rollback, aunque los tres preflights hayan pasado. **CI nueva pendiente**.
- Próximo bloque funcional: replay y lecturas H6 con rol independiente y privilegios mínimos; confirmación real mesa B, transferencia económica, proyección sala/SSE y aceptación completa. No ampliar B3 para incluir lecturas H6; mantener NO-GO y PR #43 Draft.

## 16. Incidencia CI del test de factoría B3 y corrección (2026-11-01)

- HEAD `cf2bee2a8d0c78a0b49fcbc19fce3c39d149cc09`: **Sabora CI FAIL** (run `41324210095`) y **Bootstrap FAIL** (run `41324210044`); navegador estaba en ejecución al diagnóstico. Error concreto del test `B3 verified factory passes only sealed transaction and denies legacy H6 SQL`: `unexpected_b3_sql` antes de probar la allowlist, porque el doble `b3ConfirmationPool` no implementaba `BEGIN` / `SET LOCAL ROLE` / `ROLLBACK`. No atribuir el fallo a PG17 real.
- Corrección commit `a2fcfd1646d270241d3bade5d250ea5536bd454e`: el doble admite únicamente esos comandos transaccionales, preservando la comprobación de que el SQL H6 heredado se rechaza. **Nueva CI pendiente**; no declarar PASS hasta confirmar los workflows del HEAD.
- Mantener PR #43 Draft y B3/F12 NO-GO; siguiente trabajo tras verde: composición real de replay/lectura H6 sin conceder permisos de lectura al escritor B3.

## 17. Separación del lector H6 y escritor de transferencia B3 (2026-11-01)

- HEAD `46cccde3bcca669bb2e4f5bba0920806437210e3` **CI 3/3 SUCCESS**: navegador `41324368639`, Bootstrap `41324368669`, Sabora CI `41324368722`. Se cerró el fallo de fixture documentado en sección 16.
- Commits `3c39272bfa8fea2e06591e0ad0941345f6667a00`, `9ba3ef4f2aa2814d2ab5fa48649c099eeee99537` y `82d959034190a57ebfc8b60dc538f8c66fad44d0`: la factoría B3 exige **cuarto pool/login aislado** para consultas H6 y comprueba su identidad contra `sabora_h6_customer_runtime`. Entrega dos interfaces selladas: `withConfirmationTransaction` (solo SQL de transferencia) y `withH6ReadTransaction` (solo lectura de ronda y política). Tests de SQL denegado y aislamiento. **CI de estos commits pendiente**.
- Advertencia normativa: el rol H6 existente tiene superficie de funciones más amplia que el allowlist de la aplicación. El lector restringe SQL de aplicación pero no sustituye el análisis de privilegios PostgreSQL ni las pruebas de transfer/replay end-to-end. No conceder lecturas al rol B3, no montar rutas operativas ni declarar GO.
- PR #43 Draft; B3/F12 NO-GO. Sin merge, VPS, Supabase operativo ni Fleetia.

## 18. Regresión negativa de aislamiento de cuatro identidades (2026-11-01)

- Commit `ae093f7d2c96c564f168f7d0a827a9bfc0110964`: nuevos casos de rechazo previo a SQL cuando el pool lector H6 coincide con cualquiera de los otros tres o cuando reutiliza un login F12/B3. Si la identidad efectiva del lector H6 difiere de la declarada, falla el preflight y no se construye la factoría; no se ejecuta SQL de negocio.
- La CI de `9c41cac7c7d455f14158f1e0ad0454f736471bd2` estaba en ejecución al revisar; la del commit nuevo requiere verificación independiente. No declarar GO ni resultado verde anticipado.
- Próxima prioridad: resolver pruebas de CI, luego conectar el recorrido real de confirmación/replay sin saltarse el preflight ni aumentar permisos; cerrar escenario F/R de transferencia y pagos antes de producción.

## 19. CI verde y encaminamiento explícito de lecturas H6 (2026-11-01)

- `9c41cac7c7d455f14158f1e0ad0454f736471bd2`: CI, Bootstrap y navegador **3/3 SUCCESS**. `011bd01a6ab26ee527f575cbf53afbc51099b45c`: **3/3 SUCCESS** (runs `41325076716`, `41325076708`, `41325076707`). Se validó el aislamiento de cuatro identidades.
- `e6f93ce0d268fbcd1051dec2a3652d45307d4ca7`: `createCustomerProductionFlow` admite opcionalmente `withH6ReadTransaction`. La lectura de política y el replay `READ_H6_ROUND_SQL` utilizan esa transacción, mientras la persistencia de la ronda usa `withH6Transaction`. Por defecto se mantiene el comportamiento anterior si no se configura un lector separado. Rechaza configuración de lector sin escritor. No se ha conectado aún el flujo completo a la factoría B3.
- `046b56e23630120f90f53283fbb8a7c23c7f526a`: comentario de composición corregido a cuatro identidades. **CI nueva pendiente**. Revisar especialmente tests del flujo H6 y su replay antes de considerar integración terminada.
- Mantener PR #43 Draft y NO-GO; no ampliar privilegios del escritor ni tocar Fleetia/VPS/Supabase operativo.

## 20. Verificación de encaminamiento lector/escritor (2026-11-01)

- HEAD `540c1af72248a6936e71f5a4e66b6ebe5b0df531`: **3/3 SUCCESS** — Sabora CI `41329154602`, Bootstrap `41329154596`, navegador `41329154615`. El nuevo parámetro opcional de lectura H6 no produjo regresión en esa CI.
- Commit `4369d99875d3f4ad2af88f83f42d6472f3b1cbd2`: prueba integrada de la factoría verificada que ejerce ambas capacidades independientes; política y replay H6 pasan por el lector, mientras los intentos cruzados (lectura con B3 y escritura con lector) se rechazan y revierten. **Pendiente CI de este commit**. Es una prueba con pools simulados; no equivale al recorrido real F01–F28/R01–R10 en PG17.
- Próxima dependencia: conectar `createCustomerProductionFlow` real a factoría candidata con el pool de negocio base y secretos verificados; ejecutar pruebas funcionales de primer pedido en mesa B, transferencia, pagos y replay bajo PostgreSQL 17 aislado. No exponer rutas ni conceder privilegios operativos antes de cierre y autorización.

## 21. Factoría candidata de confirmación real B3 (2026-11-01)

- HEAD `28cfbc56d14e2156b53ab08354fb5b7963263425`: CI 3/3 SUCCESS (Sabora CI `41330643606`, Bootstrap `41330643679`, navegador `41330643559`).
- `76e2c0f14c679b575fb12e4afe79c2f923c3ad97`: nuevo adaptador opt-in `createB3CustomerConfirmationFlowCandidate` que instancia el flujo real `createCustomerProductionFlow` después de preflight y conecta transacción de cesta/cotización provista por el llamador, escritor B3 exclusivamente para confirmación transferible y lector H6 para política/replay. No monta rutas ni concede permisos. `d7f3498af4a9bd149321a4a95803022f0b1b9afb`: tests del contrato de entrada y exposición mínima del adaptador. **CI nueva pendiente**.
- Límite crítico: aún no hay prueba PG17 de extremo a extremo con este adaptador ni garantía de que la transacción de cesta/cotización tenga permisos mínimos independientes. No declarar GO, no habilitar producción ni alterar SQL operativo.

## 22. Quinta identidad SQL para cesta/cotización B3 (2026-11-01)

- La CI de `e0682072f77bc7cb9afd6cd7eab7e9a94c8418d4` seguía en ejecución al comprobarla: navegador SUCCESS, Sabora CI y Bootstrap ejecutando pruebas PG17. No declarar éxito total.
- `b48274a6d131cc8236e8361b22d29d0cb865d93b`: exporta `assertCustomerFlowSqlCapabilities`, reutilizando sin rebajar el preflight exacto de `sabora_customer_flow_runtime`.
- `1cd714d8f06df5c43f3a3a5625d74f9b87439838`: factoría opt-in `createVerifiedTableChangeB3CustomerFlowCandidate` que exige cinco pools y logins distintos: F12 cliente, F12 operaciones, B3 escritor, H6 lector y cesta/cotización. Valida quinta identidad, permite exclusivamente seis SQL de flujo cliente y reutiliza la factoría B3 verificada. No monta rutas ni toca producción.
- `0f67061d9697d0abd3a83eaa100f8791d1a4a391`: pruebas de rechazo previo a SQL por reutilización de pool/login. **CI de nuevos cambios pendiente**. Faltan prueba positiva PG17 con las cinco identidades y recorrido económico F01–F28/R01–R10.
- PR #43 Draft, NO-GO. Sin despliegue, cambios de Supabase operativo, VPS ni Fleetia.

## 23. Preflight positivo de cinco identidades y concesiones excesivas (2026-11-01)

- Commit `b1238066e55d286cb579e5b183e79e68f54ebf6f`: pruebas de construcción positiva de `createVerifiedTableChangeB3CustomerFlowCandidate` con cinco pools simulados, sin ejecutar SQL de negocio en el arranque, y rechazo de concesiones adicionales al rol de cesta/cotización. Verificar resultado en CI; no equivale a un preflight de cinco logins PostgreSQL 17 reales.
- Las CI de `e0682072f77bc7cb9afd6cd7eab7e9a94c8418d4` y `4f1dd0b040f645a7de87ab43c38701b389969789` seguían ejecutándose en la última consulta. No marcar éxito sin conclusión.
- Prioridad siguiente: cerrar ejecución de CI, corregir regresiones y luego prueba PG17 de confirmación y replay real de A→B con políticas de cobro y aislamiento completo. PR #43 Draft, NO-GO; no desplegar ni tocar infraestructura compartida.

## 24. Rechazo temprano de configuración B3 y estado CI (2026-11-01)

- `5d69d998ef14c0bfd65a7174fb73bf6095b9e050`: la factoría de cinco identidades rechaza antes de abrir conexiones cualquier secreto insuficiente, reloj/UUID inválidos o callbacks de identidad ausentes. Se mantiene preflight exacto por rol para configuración válida.
- `a33b7fcb7c1fd49ba7d8d3c26c0f2acbd3cdffd4`: prueba negativa que verifica cero consultas en los cinco pools ante configuración inválida. **Nueva CI pendiente**.
- CI antigua `e0682072f77bc7cb9afd6cd7eab7e9a94c8418d4`: Bootstrap y navegador SUCCESS; Sabora CI todavía IN_PROGRESS al consultar. CI `3538dcbd7ad53120481467f721ec7dfb305b3b39` aún IN_PROGRESS 3/3. No inferir PASS.
- Sigue pendiente hito de integración real PG17 de cinco identidades y traslado económico A→B. PR #43 Draft, NO-GO. Sin despliegues ni cambios en Fleetia, VPS o Supabase operativo.

## 25. Control de pertenencia SET ROLE en quinta identidad (2026-11-01)

- CI `e0682072f77bc7cb9afd6cd7eab7e9a94c8418d4` completada **3/3 SUCCESS** (Sabora CI `41335548891`, Bootstrap `41335548878`, navegador `41335548922`). CI de `75c1b5757548e60ddfb3ccdfdff7977d7e2892b4` seguía en cola/ejecución al consultar.
- `69848df15ebb1f424a37788735c545bdcd6d2306`: se detecta y cierra en la composición candidata un hueco del preflight reutilizado: comprobar solo los tres roles conocidos no excluye permisos SET ROLE adicionales. La quinta identidad ahora debe demostrar exactamente un rol SET accesible: `sabora_customer_flow_runtime`.
- `4c866770ecfbbadf2187d550ed45375b8f5533be`: prueba negativa que simula membresía extra de B3 writer y verifica rechazo sin llegar a preflight de las otras cuatro identidades. **CI de estos cambios pendiente**.
- Riesgo todavía abierto: la identidad H6 lectora usa `sabora_h6_customer_runtime`, cuyo EXECUTE en PostgreSQL abarca funciones H6 adicionales. El allowlist de aplicación no equivale a un rol de lectura exclusivamente DB. Se requiere revisión de privilegios y prueba PG17 real antes de GO.
- PR #43 Draft, NO-GO. Sin despliegue ni cambios en VPS/Fleetia/Supabase operativo.

## 26. Actualización de continuidad verificada (2026-11-01)

**Evidencia CI de HEAD anterior `3356a95404d276888cc2d93d8d97297768197498`: 3/3 SUCCESS**, comprobada en GitHub Actions:
- Sabora CI: run `41336053533`, SUCCESS.
- Bootstrap Sabora lockfile: run `41336053562`, SUCCESS.
- Sabora client browser conformance: run `41336053368`, SUCCESS.

**Estado técnico actual:** rama `integration/sabora-h6-b2-delivery-board-contract-20261031`, PR #43 Draft. El código candidato contiene separación de cinco pools/logins (F12 cliente, F12 operaciones, escritor B3, lector H6, cesta/cotización), preflight SQL, exclusividad SET ROLE para quinta identidad y adaptador opt-in de confirmación H6 transferible. La CI verde valida el commit anterior, **no certifica** todavía el recorrido económico integral A→B ni la preparación para producción.

**Bloqueos y secuencia para próxima sesión:**
1. Verificar CI del commit documental más reciente; no atribuirle automáticamente la conclusión del SHA anterior.
2. Auditar privilegios de `sabora_h6_customer_runtime`: la lectura H6 está restringida por allowlist de aplicación, pero el rol DB conserva EXECUTE adicional. Definir y probar una identidad lectora de mínimo privilegio en PG17 desechable, sin conceder acceso operativo ni modificar producción.
3. Validar cinco identidades reales, SET ROLE exclusivo, denegación de privilegios cruzados y RPC de transferencia con PostgreSQL 17 desechable.
4. Ejecutar aceptación de negocio completa F01–F28/R01–R10: solicitud/caducidad 90 s, decisión personal, QR B, primer pedido en B con traslado atómico de cuenta y consumo, pagos Stripe test, replay y concurrencia, rollback, sala/cocina/SSE, bloqueo por QR revocado o mesa reocupada y conformidad PWA.
5. Solo tras evidencias completas considerar GO técnico; no hacer merge ni despliegue sin autorización expresa. La documentación normativa de GitHub prevalece sobre este handoff.

**Restricciones permanentes:** NO-GO, sin merges, sin despliegues, sin cambios en Supabase operativo, VPS, Fleetia u otros proyectos. Actualizar esta continuidad en cada hito importante.

## 27. Auditoría del login lector H6 y CI (2026-11-01)

- Commit documental anterior `20834baf04a42dfd8d33bf24dd3b76c7edde2b26`: **3/3 SUCCESS** verificados: Sabora CI `41336640101`, Bootstrap `41336640096`, navegador `41336640082`.
- `b2b06783e143cf17b9a7772116990efae72e916e`: se añade a la composición candidata B3 `assertB3H6LoginSurface`. Además del preflight H6 existente, comprueba que el login lector pueda hacer SET ROLE exactamente a `sabora_h6_customer_runtime` y no pueda ejecutar directamente ninguna función Sabora. Rechaza membresías y EXECUTE inesperados, sin tocar permisos operativos.
- `3905847c7ed13cc6dd7e44662ed9e6a4caee9988`: pruebas negativas de ambas desviaciones. **CI nueva pendiente**.
- **Advertencia importante:** este control endurece el **login** lector, pero no reduce el EXECUTE del **rol** `sabora_h6_customer_runtime`, que sigue teniendo confirmación H6 y lectura de backlog además de política/replay. Para cumplir privilegio mínimo de base de datos hace falta un rol lector dedicado y validación PG17 desechable antes de activar B3.
- Próximo hito: pruebas reales PG17 de las cinco identidades, rol H6 estrictamente lector, confirmación atómica A→B y F01–F28/R01–R10. PR #43 Draft NO-GO; sin merges/despliegues ni cambios a Fleetia, VPS o Supabase operativo.

## 28. Regresión CI detectada y corrección focalizada (2026-11-01)

- En `bcc47da1e70aafad1c915769ada0ca4573f57166`, Sabora CI run `41340775519` terminó FAILURE en Block 1: 1.161 tests PASS, 1 FAIL, 2 SKIP. El test `B3 verified factory keeps writer and H6 reader capabilities separate end to end` asumía índices fijos de llamadas y omitía la nueva consulta de auditoría `B3_H6_LOGIN_SURFACE_SQL` del preflight. No es evidencia de fallo de la lógica transaccional; sí es una regresión de test que bloquea CI.
- `7bc3ee0eda1c16e4d895aa7905c00dcb93c83437`: se elimina dependencia del índice fijo filtrando explícitamente SQL transaccional esperado; se mantiene la auditoría de permisos H6. **CI de la corrección pendiente**.
- El último SHA con 3/3 SUCCESS confirmado antes de esta regresión es `20834baf04a42dfd8d33bf24dd3b76c7edde2b26`. No afirmar que HEAD esté verde sin comprobar sus runs.
- Pendientes: rol H6 verdaderamente solo lectura a nivel PostgreSQL, cinco logins PG17 reales, integración económica A→B y aceptación F01–F28/R01–R10. PR #43 Draft NO-GO; ningún merge, despliegue o modificación de Fleetia/VPS/Supabase operativo.

## 29. Hito B3: contrato de rol H6 lector dedicado (2026-11-01)

- `9208f4ab58aa57581b622f7a71c7278e09f65f16`: la composición B3 deja de aceptar `sabora_h6_customer_runtime` para lecturas y exige **`sabora_b3_h6_reader_runtime`**, separado del escritor. El preflight exige login sin atributos elevados ni permisos directos, SET ROLE exclusivo y exactamente las dos funciones `read_customer_round_h6_candidate` y `read_customer_payment_policy_h6_candidate`. El transaction wrapper usa ese rol y permite únicamente las dos sentencias exactas.
- `bbbc8407090d46252126eebc83af3759ecf87832`: fixtures y pruebas del nuevo contrato, incluidos permisos cruzados, EXECUTE directo y función adicional en rol lector.
- **No se ha creado ni concedido todavía el rol en ninguna base de datos**. El contrato es candidato, no un cambio de esquema desplegado. Falta provisionar roles en PG17 desechable y validar con SQL real la superficie de permisos y su funcionamiento. No activar B3 antes de ello.
- CI de `347602745683171a3ca58431f75275d80c265c5e` seguía en ejecución al último chequeo; no afirmar verde. Las nuevas modificaciones aún requieren CI. PR #43 Draft NO-GO. Sin merge/despliegue/cambios Fleetia/VPS/Supabase operativo.

## 30. CI del rol lector dedicado: diagnóstico y corrección (2026-11-01)

- `347602745683171a3ca58431f75275d80c265c5e`: Sabora CI `41340850189` y navegador `41340850102` SUCCESS; Bootstrap seguía en ejecución en la consulta.
- `8bc411a9a804302d52a439bacecfebde961cd7cc`: Sabora CI `41341150028` FAILURE y Bootstrap `41341150023` FAILURE. Ambos ejecutan tests Node; el error común es la expectativa antigua `invalid_h6_sql_capabilities:identity-policy` del test de deriva de identidad, mientras que el nuevo preflight dedicado devuelve `invalid_b3_h6_reader_capabilities`. El fallo se produce en Block 1, 1.161 PASS, 1 FAIL, 2 SKIP; no se debe afirmar que la integración nueva está validada.
- `71e803ed31c3604cc6bd9121def3cb1fbdfec061`: corregida la expectativa del test para el nuevo preflight; CI de corrección pendiente.
- **Pendiente de seguridad:** la comprobación actual de funciones lectoras exige dos nombres y dos entradas, pero todavía debe contrastarse contra firmas completas y probarse en PG17 desechable. No se ha creado ni concedido rol lector en ninguna DB. PR #43 Draft NO-GO; sin merge, despliegue, Fleetia, VPS o Supabase operativo.

## 31. PG17 desechable: prueba de rol H6 lector (2026-11-01)

- `9a4542f9bace797c23582cb15cc774277a8fbed5`: 3/3 workflows SUCCESS (Sabora CI, Bootstrap, navegador).
- `1ca6956d02f3ddd415a7743ca7ddce05c82cdcbb`: nueva prueba `scripts/ci/b3-h6-reader-role-smoke.sql` que crea rol y login solo dentro de transacción desechable, revoca EXECUTE PUBLIC temporalmente, concede exactamente dos lecturas, comprueba SET ROLE único, login sin EXECUTE y rol sin permiso de confirmación económica, y verifica rollback de roles.
- `916ab7648bee519d4f59589556bd4167d3d9e892`: prueba conectada al bloque 2A de `scripts/ci/postgres-migration-smoke.sh` después de la cadena de migraciones. Solo se ejecuta en runner GitHub Actions con PostgreSQL 17 aislado y Docker --network none. **No afirmar que la prueba PG17 pasó hasta ver la CI de HEAD**.
- Siguiente: inspeccionar CI, corregir fallos SQL reales si aparecen y completar E2E económico A→B con permisos separados. PR #43 Draft NO-GO. No merge/despliegue/cambios Fleetia/VPS/Supabase operativo.

## 32. PG17 real: fallo de permiso de esquema en prueba del login (2026-11-01)

- CI HEAD `d49b68c9c300f4fae1da44ed0cfa5a7959703dd8`: navegador SUCCESS, Sabora CI `41343287923` FAILURE, Bootstrap `41343287995` FAILURE. Bloque 1 PASS; Bloque 2A falló en el nuevo smoke PG17 con `ERROR: permission denied for schema sabora` después de `SET LOCAL ROLE sabora_b3_h6_reader_login`. Causa: la prueba llamaba `has_function_privilege` con firma textual desde un login que deliberadamente carece de USAGE del esquema; la resolución de firma requiere acceso al esquema. No es evidencia de que el login tenga permisos indebidos.
- `cf4cbf061f1b43d3d71562fb81d15b188fd537bc`: la prueba negativa ahora consulta `pg_proc` por OID, como el preflight, sin resolver una firma por nombre desde el login restringido. **CI de corrección pendiente**.
- Mantener PR #43 Draft NO-GO. Aún no se ha demostrado éxito completo del nuevo smoke PG17; ninguna concesión de permisos en DB operativa, VPS o Fleetia.

## 33. PG17 B3 reader: rollback test reached and false failure fixed (2026-11-01)

- `748a32571f7c9f03ad028714d224c555109eefa8`: Sabora CI run `41343560263` FAILURE en Block 2A. La nueva prueba PG17 completó creación de roles, GRANT, comprobaciones de login y rol, RESET y ROLLBACK, pero la sentencia final `SELECT CASE ... THEN (1/0)::int ELSE 1 END` falló por evaluación de la constante `1/0` en PostgreSQL, aunque no hubiera roles supervivientes. No interpretar ese error como una filtración de roles.
- `be74c3ef6299a65cb470dd73b56ac078a9b4b432`: sustituida la expresión por `DO` con `RAISE EXCEPTION` condicional que comprueba ausencia de **ambos** roles después de rollback. Nueva CI pendiente.
- El contrato B3 sigue candidato y NO-GO; el hito económico A→B y F01–F28/R01–R10 permanecen abiertos. Sin merge, despliegue ni cambios de infraestructura operativa.

## 34. PG17: evaluación de funciones de privilegio por tipo de relación (2026-11-01)

- CI `bb7c60ccca9b3a86a256e5252344c410e341299c`: Sabora CI `41343800427` FAILURE y Bootstrap `41343800418` FAILURE en bloque 2A. Error `pg_toast_16387 is not a sequence` en la nueva comprobación de privilegios directos del rol lector. PostgreSQL evaluó `has_sequence_privilege` sobre un OID de relación no secuencia a pesar del filtro `relkind='S'` en la expresión con OR.
- `0800845fa7acbc02cd29ed10c00d118126fb74cf`: se protege cada llamada a `has_table_privilege` / `has_sequence_privilege` mediante `CASE WHEN relkind ... THEN ... ELSE false END` para evitar evaluación sobre OID de tipo incompatible. **CI pendiente**; no afirmar PG17 PASS.
- No se han realizado cambios operativos, merges ni despliegues. PR #43 Draft NO-GO. Continuar hasta CI PG17 verde antes de ampliar a E2E económico A→B.

## 35. CI PG17 B3 lector verificada verde (2026-11-01)

- HEAD `eef95da169b83ed6fc1ac5ec4c0b532eab371f80`: **3/3 workflows SUCCESS**: Sabora CI `41343907200`, Bootstrap `41343907237`, navegador `41343907212`. El bloque de migraciones PG17 desechable incluye `scripts/ci/b3-h6-reader-role-smoke.sql` con roles transaccionales, privilegios mínimos y verificación de rollback. Esto valida el smoke B3 lector en el circuito actual; **no equivale a activación del runtime ni cierre integral de B3/F01–F28/R01–R10**.
- Próximo hito: recorrido A→B con confirmación transaccional, pagos, cocina/sala, concurrencia y privilegios de las identidades efectivas. Mantener PR #43 Draft NO-GO y no tocar Supabase operativo/VPS/Fleetia.

## 36. B3: firmas SQL canónicas y comprobación PG17 bajo search_path alternativo (2026-11-01)

- Inspección del código real detectó discrepancia: `B3_H6_READER_FUNCTION_SQL` seguía serializando `p.oid::regprocedure::text`, cuyo resultado depende del `search_path`, mientras la lista esperada utiliza firmas completamente calificadas. El smoke PG17 anterior validaba grants, pero no esa consulta del preflight Node bajo otro `search_path`.
- `c7a0b4b44d9196ddabe06da0e5a9638bb79b3e51`: consulta de preflight cambiada a firmas explícitas `schema.function(types)`, sin depender de `regprocedure::text`.
- `3048a849de5161ee494b2a69d67fefbc66066197`: smoke PG17 ejecuta comprobación de firmas bajo `SET LOCAL search_path TO sabora,public` con rol lector; el rollback sigue siendo obligatorio. **Nueva CI pendiente**; los 3/3 SUCCESS anteriores corresponden a `eef95da1`, no a este HEAD.
- El recorrido funcional y económico A→B no queda cerrado por estas comprobaciones. PR #43 Draft NO-GO. Sin cambios en Fleetia/VPS/Supabase operativo.

## 37. Corrección de sintaxis SQL en regresión PG17 (2026-11-01)

- `3ed8173da1499c19b3a5089c92c185b4ed8ebb55`: Sabora CI `41344339279` y Bootstrap `41344339196` FAILURE; navegador `41344339192` SUCCESS. Fallo de bloque 2A: `syntax error at or near "$"`, línea `DO $ DECLARE names text[]` del nuevo smoke `b3-h6-reader-role-smoke.sql`. Es un error de delimitador en la prueba, no evidencia de fallo de aislamiento.
- `fde8db6d573752ef55819986c36c04069891412b`: corregidos ambos delimitadores a `DO $$ ... END $$;`. Se verificó que el blob cambió; anteriores intentos de sustitución no cambiaron el contenido porque `$$` tiene significado especial en reemplazos JavaScript. **CI del HEAD pendiente**.
- Mantener PR #43 Draft NO-GO; no desplegar ni modificar recursos compartidos. Siguiente hito: validación PG17 verde y recorrido económico A→B completo.

## 38. B3: guardia de cuentas abiertas y preflight de privilegios (2026-11-01)

- `445acc79ad9433f3b76195824d513397554bcef0`: el preflight B3 lector ahora condiciona `has_table_privilege` y `has_sequence_privilege` al `relkind` correspondiente, para evitar evaluaciones sobre objetos de otro tipo.
- `91bd5f55beed4b02e1b07ed0866f87af90d7c177`: se detectó un bloqueo funcional en la función candidata de confirmación: `PERFORM ... OFFSET 1 LIMIT 1` sin `ORDER BY` ni prueba específica de dos cuentas era difícil de auditar; se explicita orden estable y se conserva rechazo exclusivamente cuando hay segunda cuenta abierta. La cuenta original A no debe impedir B.
- **Pendiente**: CI de este HEAD, y PG17 real del recorrido A→B con cuenta abierta, aprobación, primer pedido B, replay, concurrencia, redirección, pagos y rollback. No confundir la prueba de grants con la aceptación funcional. PR #43 Draft NO-GO; sin despliegue ni Supabase operativo.

## 39. CI completa del bloque B3 (2026-11-01)

- Commit `b8c9eb4b50a8106c9a7bdf6874690ffa78742bc6`: **3/3 SUCCESS** en GitHub Actions: Sabora CI `41344840001`, Bootstrap `41344839974`, conformidad navegador `41344839968`. Sabora CI completó aceptación consolidada H6, PG17 desechable y construcción aislada de imagen API.
- Este resultado certifica la regresión existente del HEAD; no certifica que el primer pedido B tras aprobación transfiera una cuenta abierta en A. Sigue pendiente aceptación económica transaccional real, pagos, concurrencia y UI F01–F28/R01–R10. PR #43 Draft NO-GO.

## 40. B3 lector: identidad de sesión restringida en PG17 (2026-11-01)

- `99639f03d4158cac8357c62e6f5bf3ca254f5465`: ampliado `scripts/ci/b3-h6-reader-role-smoke.sql` para ejercer `SET SESSION AUTHORIZATION sabora_b3_h6_reader_login`, verificar `session_user=current_user=login`, ejecutar `SET ROLE sabora_b3_h6_reader_runtime`, comprobar las dos RPC lectoras y restaurar la autorización antes de `ROLLBACK`. Evita dar por válido un preflight que solo simula `SET ROLE` desde superusuario. Es una simulación real de identidad SQL dentro de una conexión administrativa desechable, **no una autenticación TCP de login real**.
- Las pruebas del commit anterior `1274b39f` estaban aún en curso al comenzar este bloque. **CI del nuevo HEAD pendiente**. No montar rutas, no crear roles operativos y mantener PR #43 Draft NO-GO.

## 41. Cierre CI de identidad lectora B3 (2026-11-01)

- HEAD `2821d05f395dd3e4e18be6264987866fa4366ace`: Sabora CI run `41345369792` job `124963938064` SUCCESS; Bootstrap `41345369807` SUCCESS; navegador `41345369774` SUCCESS. La ejecución incluye la prueba PG17 `SET SESSION AUTHORIZATION` del commit `99639f03`.
- **Alcance del cierre**: identidad y ACL de lector B3 bajo pruebas aisladas, no aceptación de traslado económico A→B, ni autenticación TCP real del nuevo lector. PR #43 permanece Draft/NO-GO.

## 42. Regresión PG17 de destino cerrado y aceptación H6 (2026-11-01)

- `0d925976`: añadida prueba de rechazo del primer pedido B con aprobación A vigente cuando B se cierra después de escanear. Exige rollback de pedido, concesión y binding.
- Sabora CI `41345835269` y Bootstrap `41345835262` FAILURE (43/44 pruebas PG17): el cierre invalida la visita y la prueba posterior de modo de pago esperaba `payment_mode_conflict` pero recibió `customer_visit_forbidden`. No se observó autorización de traslado indebido; el fallo estaba en el aislamiento del fixture.
- `1d42f99` y `c3217ad1689fa9ea8679dcbe1c09742288f8bbd1`: expectativa específica y SAVEPOINT para revertir el cierre y la revocación de visita antes del caso positivo independiente.
- **CI final 3/3 SUCCESS** para `c3217ad`: Sabora CI `41346273378`, Bootstrap `41346273397`, navegador `41346273387`. La aceptación consolidada incluye las pruebas PG17 existentes de A→B real, replay, concurrencia, pagos, saldo, destino de líneas pendientes y rechazo de B cerrada.
- **No confundir CI verde con GO**: el contrato de activación B3, permisos de runtime efectivo, integración API opt-in, PWA de sala/cliente, SSE y aceptación normativa F01–F28/R01–R10 siguen pendientes de cierre integral. El documento B0 contiene riesgos históricos previos a los tests positivos y no sustituye el estado verificado en CI. Priorizar un bloque completo de integración HTTP+PG17+PWA, no nuevas microcorrecciones ACL. PR #43 Draft/NO-GO; sin merge, despliegue, ni cambios en Fleetia, VPS o Supabase operativo.

## 43. B3: preflight de confirmación y regresiones de composición (2026-11-01)

- `f108d7df609dc980d11faa099ea2109d532e68f2`: endurecido el preflight de la identidad escritora B3 con firmas canónicas independientes de `search_path` y consultas de privilegios protegidas por `relkind`, siguiendo el criterio ya usado para el lector. Sin creación de roles, grants ni montaje de rutas.
- CI de `f108d7df`: Sabora CI `41346773297` y Bootstrap `41346773230` FAILURE en bloque 1. Las pruebas simuladas de composición seguían reconociendo solo la consulta anterior. `2a54318e96fe1ee0e41a312169bbc0e0eb15b158` amplió el reconocimiento de la consulta canónica, pero el fixture seguía devolviendo una firma F12 de camarero en lugar de la firma B3 de confirmación; Sabora CI `41346895869` y Bootstrap `41346895933` FAILURE.
- `35fe278e6b266dfdb46e0220970d3d0acc3f8c67`: el fixture de composición devuelve ahora la firma exacta `sabora.confirm_customer_round_h6_transfer_integration_candidate(bytea,uuid,text,text,text,text,bytea,uuid,uuid,jsonb,boolean,text)` para el rol B3. **CI de este HEAD aún no validada**: Sabora CI `41347003702` FAILURE, Bootstrap `41347003764` FAILURE y navegador `41347003672` en ejecución en la última consulta. Debe leerse el fallo de esos runs antes de nuevas correcciones; no asumir que el fixture era el único problema.
- Siguiente bloque: resolver CI hasta verde y ejecutar aceptación integrada HTTP + identidades SQL reales en PG17 desechable + recorrido cliente/camarero/cocina/sala, SSE y UI conforme a los contratos normativos. Evitar declarar B3 cerrado solo por tests de preflight o mocks. PR #43 Draft / NO-GO. Sin merge, despliegue, ni cambios operativos de Supabase, VPS o Fleetia.

## 44. Recuperación de CI y próximo cierre B3 (2026-11-01)

- `90089fdefabfca2097ee383dd037ff88105565a4`: corregido el fixture real `b3ConfirmationPool` de composición, que seguía reconociendo la consulta anterior de firmas y causaba falsos negativos del preflight B3. La corrección previa de `preflightPool` no alcanzaba ese fixture.
- **Tres workflows SUCCESS verificados para ese SHA**: Sabora CI `41347165086`, Bootstrap Sabora lockfile `41347165110`, Sabora client browser conformance `41347165093`. Queda recuperada la regresión del preflight; esto no constituye aceptación de transferencia funcional en producción.
- Revisada la composición aislada: `createVerifiedTableChangeB3CustomerFlowCandidate` exige cinco pools/logins distintos (F12 cliente, F12 personal, B3 confirmación, H6 lectura, flujo de cesta/cotización); valida preflights antes de construir el flujo y no monta HTTP ni otorga EXECUTE. Las pruebas de esta composición son contractuales con pools simulados, no sustituyen las credenciales y roles efectivos en PG17.
- **Siguiente hito indivisible**: demostrar preflight de los cinco roles en PG17 desechable y recorrido integrado HTTP cliente→camarero→confirmación A→B con cuenta única, destino operativo de cocina/sala, replay, concurrencia, SSE y PWA; completar matriz F01–F28/R01–R10. Mantener PR #43 Draft/NO-GO, sin grants runtime, merge, despliegue o cambios a Fleetia/VPS/Supabase operativo.

## 45. PG17 real: preflight lector H6 B3 validado (2026-11-01)

- Commit `c0f1c85fbf99c18ae721473c3f21e7d466fcd9d0`: prueba en `scripts/ci/table-change-root-postgres17.test.mjs` que crea en transacción desechable rol lector H6 y login NOINHERIT, otorga únicamente los dos RPC de lectura, asume sesión de login restringida y ejecuta el preflight Node real `assertB3H6LoginSurface`. Verifica identidad `current_user/session_user` y rechaza tanto EXECUTE adicional al rol como EXECUTE directo al login. Rollback elimina roles y grants de prueba.
- **CI 3/3 SUCCESS verificado** para ese SHA: Sabora CI `41347631897`, Bootstrap Sabora lockfile `41347631862`, Sabora client browser conformance `41347631885`. No se ha alterado la base operativa.
- Este resultado cierra la validación aislada del preflight del lector, **no B3**. La composición de cinco identidades y el recorrido HTTP/PWA A→B todavía requieren evidencia integrada con PG17 y la matriz normativa. Próxima prioridad: validación de las cinco identidades efectivas, confirmación económica y destino de sala/cocina sin traslado anticipado, replay/concurrencia y notificaciones; PR #43 Draft/NO-GO hasta cierre completo. Sin merge ni despliegue.

## 46. Cinco identidades B3: pruebas PG17 individuales verdes (2026-11-01)

- `4c20f5a6f8da4a480ec3b84ad33aa7e77293d876`: prueba de preflight F12 de cliente y camarero con logins distintos y denegación de EXECUTE adicional; esta prueba pasó en el run posterior.
- `30f004e7544dd492f70d6603748f0c905e5de41e`: incorpora prueba del quinto login (cesta/cotización) con seis RPC exactos y un único SET ROLE. CI inicial **falló** (46/47) porque el fixture intentaba crear el rol `sabora_customer_flow_runtime` que ya existe tras las migraciones; no se atribuye ese fallo a una operación de transferencia.
- `8d1c9c1565b0fbb6aa97f3294c9adb2ff288453e`: corrige el fixture reutilizando el rol existente, comprueba las firmas de RPC y mantiene grants temporales y login de prueba en transacción con rollback. **CI 3/3 SUCCESS**: Sabora CI `41348600528`, Bootstrap `41348600494`, navegador `41348600491`.
- **Alcance real**: cinco preflights de identidades con PG17 real probados individualmente; esto no acredita que cinco conexiones independientes funcionen juntas en un recorrido HTTP completo. **B3 sigue NO-GO**. Próximo hito indivisible: cinco conexiones restringidas simultáneas + solicitud/decisión + confirmación B y traspaso económico/destino de entregas + replay/concurrencia + PWA/HTTP y matriz normativa. Sin activar rutas, grants operativos ni despliegues.

## 47. Preflight conjunto de cinco identidades en PG17 (2026-11-01)

- Commit `dc55c057ba4185b80e83bdc34224fed713ea4322`: incorpora prueba PG17 de las cinco identidades B3 en un mismo entorno transaccional desechable, con comprobación de `current_user/session_user`, funciones y roles exactos y rechazo de EXECUTE indebido en el lector H6.
- GitHub Actions **3/3 SUCCESS**: Sabora CI `41349160773`, Bootstrap `41349160768`, client browser `41349160791`.
- **Límite de la evidencia**: las cinco identidades se comprueban secuencialmente con `SET LOCAL SESSION AUTHORIZATION` en una única conexión administrativa de prueba. No son cinco pools/login físicos simultáneos ni un flujo funcional HTTP A→B. No afirmar cierre B3 por esta prueba. Próximo bloque: ejecutar cinco conexiones reales restringidas y confirmar pedido en B, traspaso económico y proyecciones, replays y casos de fallo, más HTTP/PWA. PR #43 Draft; **NO-GO**, sin grants ni despliegues operativos.

## 48. Checkout A→B ejecutado con rol SQL restringido (2026-11-01)

- Commit `077f75cd6ca1e1cad8f20873646ee65a75cab39f`: la prueba positiva integrada PG17 de confirmación A→B ahora hace `SET LOCAL ROLE sabora_b3_positive_checkout` (rol transaccional NOLOGIN, USAGE del esquema y EXECUTE exclusivo de la función de confirmación) para la invocación real del writer. Se restablece el rol antes de verificar las invariantes económicas y de entrega; la transacción completa se revierte.
- GitHub Actions **3/3 SUCCESS**: Sabora CI `41349760311`, Bootstrap `41349760220`, client browser `41349760202`.
- La evidencia valida el writer restringido en una invocación positiva real, pero no constituye cinco conexiones independientes, ni integración HTTP/PWA de extremo a extremo. **PR #43 Draft, B3 NO-GO**. No se concedieron privilegios ni se desplegó en entornos operativos.

## 49. HTTP solicitud→aprobación→confirmación y replay, contrato aislado (2026-11-02)

- Commit `70f30cdaa8ce8f992fae98040f4f490ba695c503`: prueba Fastify del flujo HTTP solicitud cliente, denegación de autorización por cocina, aprobación por camarero, confirmación A→B y replay sin duplicar consumo. La aprobación no traslada por sí sola la cuenta. El almacén económico de esta prueba es **simulado**; no sustituye PG17.
- GitHub Actions **3/3 SUCCESS**: Sabora CI `41350243399`, Bootstrap `41350243213`, client browser `41350243088`.
- Evidencia acumulada: writer A→B con rol restringido en PG17 real (`077f75c`) + HTTP Fastify con estado simulado (`70f30cd`), todavía **sin** recorrido HTTP con cinco pools reales simultáneos. Próximo bloque obligatorio: conectar esos límites sin activar la composición operativa, cubrir errores/replays concurrentes y contrastar F01–F28/R01–R10. PR #43 Draft; B3 **NO-GO**.

## 50. Cinco conexiones PG17 físicas y composición B3 validada (2026-11-02)

- Commits `def69aa16`, `7e619d53`, `d18fa720` y `06fd8564`: la prueba PG17 crea cinco logins efímeros independientes con pools distintos, comprueba la identidad de sesión, la ausencia de EXECUTE directo, el SET ROLE y los preflights exactos de F12 solicitud, F12 operaciones, B3 writer, H6 reader y cesta/quote; finalmente construye el servicio candidato mediante `createVerifiedTableChangeB3CustomerFlowCandidate`.
- GitHub Actions del HEAD `06fd856402e537617d33c9c849e7ec912cb00a7a`: **3/3 SUCCESS**: Sabora CI `41389215520`, Bootstrap `41389215416`, client browser `41389215437`. Los roles se crean y destruyen en la base PG17 desechable del arnés; no se conceden permisos en Supabase operativo.
- **Límite de evidencia**: el test verifica conexiones reales y construcción de la composición, pero **no ejecuta el recorrido HTTP A→B usando esas conexiones**, ni acredita por sí solo el traslado económico/entregas con solicitud y decisión en el mismo escenario. La prueba HTTP actual usa estado simulado y la prueba económica PG17 utiliza fixtures directos; no deben presentarse como una prueba E2E unificada.
- **Próximo hito indivisible**: Fastify `.inject` con los cinco pools PG17 restringidos, solicitud cliente → aprobación camarero (sin mutación económica) → primer checkout B (transferencia atómica de cuenta y entregas) → replay/concurrencia sin duplicación; añadir negativos (QR revocado, B ocupada/cerrada, aprobación caducada), PWA y matriz normativa F01–F28/R01–R10. PR #43 **Draft / NO-GO**; sin despliegues, grants operativos ni modificaciones de Fleetia.

## 51. Revocación de privilegio B3: revalidación negativa PG17 (2026-11-02)

- Commit `4ff1932d83d02216b05c1a7825c01fcdb770fa1a`: tras construir correctamente el candidato con cinco conexiones físicas, el arnés PG17 desechable revoca EXECUTE de la única RPC de transferencia del rol writer y exige que una segunda construcción falle con `invalid_b3_confirmation_capabilities`. Comprueba que el preflight no reutiliza una autorización anterior.
- GitHub Actions **3/3 SUCCESS**: Sabora CI `41389685742`, Bootstrap `41389685741`, client browser `41389685760`.
- Alcance: revalidación de permisos, no ejecución HTTP A→B real. Pendiente la prueba unificada Fastify+cinco conexiones restringidas+checkout PG17+replay/concurrencia y las matrices funcional/visual. **B3 NO-GO, PR #43 Draft**, sin despliegues ni cambios operativos.

## 52. Transacción writer B3: rechazo SQL y restauración de login (2026-11-02)

- Commit `676b8a0c01a746fd5c5e54b274cb9ba80e8daa99`: prueba sobre conexión física autenticada del writer; intenta ejecutar `SELECT current_user` fuera de la allowlist, exige `role_scoped_sql_not_allowed`, `ROLLBACK` y recuperación de `current_user=session_user=login`.
- GitHub Actions **3/3 SUCCESS**: Sabora CI `41390117220`, Bootstrap `41390117219`, client browser `41390117240`.
- Esta validación no sustituye la aceptación HTTP A→B con PostgreSQL 17 real y cinco logins restringidos. Mantener **B3 NO-GO / PR #43 Draft**, sin permisos operativos ni despliegue.

## 53. Writer B3 real bajo SET LOCAL ROLE: CI completo (2026-11-02)

- Commits `4871d9e4e38a90dc7c228242d8c5d01a4d6c1712` y `69244dcb054760a04c53bae3f4efbd3ab25c070d`: llamada allowlisted a `PERSIST_H6_TRANSFER_ORDER_SQL` sobre PostgreSQL 17 real bajo el login y rol de writer B3. El contexto de negocio deliberadamente inválido debe ser rechazado por PostgreSQL, sin error de falta de privilegio EXECUTE; tras rollback se comprueba restauración de `current_user` y `session_user`.
- GitHub Actions del último commit: **3/3 SUCCESS**: Sabora CI `41390767221`, Bootstrap `41390767299`, client browser `41390767219`.
- No equivale a un checkout positivo HTTP A→B con las cinco conexiones físicas restringidas. Mantener **B3 NO-GO**, **PR #43 Draft**, sin despliegues ni cambios en entornos operativos.

## 54. B3 montaje HTTP aislado con cinco logins PG17: validado (2026-11-02)

- Commit `9082ca4647f0807bdaf9dd007a21fbcf340c4dd0`: montaje de las rutas de cliente y operaciones con cinco conexiones autenticadas físicamente independientes en PostgreSQL 17 desechable, después de preflights de privilegios. Comprueba rechazo HTTP por autenticación/autorización y restauración de identidades SQL.
- **3/3 GitHub Actions SUCCESS** para ese commit: Sabora CI `41391931914`, Bootstrap `41391931866`, client browser `41391932028`.
- La evidencia **no incluye** un pedido HTTP positivo con transferencia económica A→B real. Las pruebas SQL de transferencia y las HTTP de montaje son todavía recorridos separados. No declarar B3 cerrado hasta unir solicitud, aprobación, confirmación en B y comprobaciones económicas/reintentos en una única prueba con PostgreSQL real.
- Mantener PR #43 Draft / NO-GO. Sin merges, despliegues ni cambios en Fleetia, VPS o Supabase operativo.

## 55. B3 solicitud HTTP positiva contra PostgreSQL 17 y cinco logins: CI 3/3 (2026-11-02)

- Commits posteriores al apartado 54: `2e016b9` incorporó el recorrido HTTP autenticado hasta la RPC real para el caso de sesión sin contexto (403) y rechazo de mesa destino en el cuerpo (400); `a8d9132` añadió un escenario positivo con cuenta abierta, consumo pendiente, solicitud sin destino y comprobación de bloqueo de duplicados.
- La primera ejecución de `a8d9132` **falló** por una limpieza manual que intentaba borrar `customer_accounts` con referencias desde `order_rounds`. `f82539b` retiró esa limpieza en favor de la destrucción integral de la base PostgreSQL desechable del arnés. La siguiente ejecución falló por reutilización de la clave de `customer_profiles`; `19db7db` y `23ed556` introdujeron un fixture HTTP independiente. La ejecución de `23ed556` devolvió 403 en vez de 201 porque la visita seguía asociándose al cliente de otro fixture; `c4dfec88f2356644b9087326fe0312716cd019d2` corrigió el vínculo.
- **Evidencia confirmada para `c4dfec8`: 3/3 SUCCESS**, Sabora CI `41413891592`, Bootstrap Sabora lockfile `41413891737` y Sabora client browser conformance `41413891648`. El escenario positivo atraviesa Fastify con cookie autenticada, las conexiones PG17 restringidas y la RPC SQL real; comprueba respuesta 201, una solicitud `pending` persistida, permanencia de la cuenta en la mesa A, segundo intento 409 y una única solicitud.
- **Límite de esta evidencia:** aún **no** demuestra la aprobación del camarero mediante HTTP real y PG17 en ese mismo fixture, ni el primer pedido en mesa B con transferencia atómica de cuenta, consumo y entregas; tampoco acredita replay/concurrencia del checkout real, todos los negativos normativos ni el recorrido PWA final. No confundir el test HTTP simulado anterior ni el writer SQL positivo aislado con una integración completa.
- **Siguiente hito funcional completo:** enlazar en una prueba PG17/HTTP de cinco logins solicitud A → aprobación autorizada de camarero (sin traslado inmediato) → primer pedido confirmado en B (traslado atómico) → invariantes económicas y de entregas → replay y concurrencia sin duplicación; ejecutar pruebas negativas de autorización, expiración, QR revocado y mesa destino no válida; cerrar matrices F01–F28/R01–R10 y conformidad visual aprobada.
- **Estado vinculante:** PR #43 **Draft / NO-GO**, bloque B3 **NO-GO**. No realizar merge, despliegue, grants en Supabase operativo ni tocar VPS, Fleetia u otros proyectos. La documentación normativa del repositorio prevalece sobre este documento de continuidad.

## Actualización 2026-11-02 — HTTP concurrente sobre PostgreSQL 17 aislado

- `929c0c7` incorporó el rechazo HTTP de aprobación con identidad de cliente suplantando a camarero; `aa4c986` corrigió una aserción de `bigint` devuelto por el controlador como cadena. **`aa4c986`: 3/3 workflows SUCCESS** (Sabora CI `41415735925`, Bootstrap `41415735993`, navegador `41415735982`). La prueba verifica que la solicitud continúa pendiente, sin alterar mesa ni importe.
- `37205a0` intentó dos reintentos concurrentes con un cliente SQL fijado a una sola conexión: **CI y bootstrap FAILED**, porque transacciones `BEGIN/SET LOCAL ROLE` entrelazadas en una conexión devolvían HTTP 503. `5d948b8` aisló temporalmente reintentos secuenciales; esto no validaba concurrencia.
- `8ec04c8` ejecuta los dos reintentos HTTP sobre clientes físicos independientes del pool PostgreSQL 17 desechable, conservando la verificación de un solo grant pendiente, mesa A y deuda sin cambios. **3/3 workflows SUCCESS**: Sabora CI `41417673924`, Bootstrap `41417673978`, navegador `41417673970`. Este resultado acredita concurrencia de reintentos de solicitud, **no** concurrencia de confirmaciones económicas.
- **Bloqueo real:** todavía falta un fixture de personal autorizado que permita probar aprobación legítima en la misma sesión HTTP/PG17 y conectar confirmación en B con el historial económico A, además de replay y carrera del checkout. No inventar identidad de personal ni sustituir el rol legítimo por un UUID de cliente. Los tests PG17 existentes cubren transferencia económica SQL en aislamiento, pero no el recorrido HTTP integrado extremo a extremo.
- **Siguiente trabajo prioritario:** implementar el escenario completo A→B con personal real, sesiones/QR de destino, pedido confirmado, invariantes económicas, entregas y concurrencia; ejecutar el arnés PG17 y navegador. Mantener PR #43 Draft / NO-GO; no desplegar ni modificar Fleetia, VPS o Supabase operativo.
