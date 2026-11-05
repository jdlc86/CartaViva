# Sabora M2 — informe de candidato CV-004/CV-005

**Fecha:** 2026-11-05. **Estado:** implementación terminada, validación integral del SHA en GitHub Actions pendiente. Este informe no autoriza merge, despliegue ni operación.

## Base y consolidación

- Base verificada: `audit/sabora-h6-zero-cost-integrated-acceptance-20261105`, SHA `d87dd6ac005554b7373370ce452f235ca78c1a56` (PR #45 Draft).
- Rama: `integration/sabora-session23-m2-bootstrap-20261105`.
- Se observaron 38 PR abiertos, todos Draft. #41 es ancestro de #42, #42 de #43 y #43 de #44; #45 conserva la integración funcional y añade la revisión independiente. No se mezcló ni reescribió ninguna rama ajena.
- Inventario y estrategia: [SABORA_SESSION23_M2_INTEGRATION_PLAN_2026-11-05.md](SABORA_SESSION23_M2_INTEGRATION_PLAN_2026-11-05.md).

## Implementación

- Bootstrap `createM2RestaurantCandidate` separado y opt-in. Compone registro/sesión cliente, QR/visita/catálogo/cotización, confirmación B3, cambio de mesa, cocina/sala, pagos candidatos, outbox/SSE y planificador diferido opcional.
- `/health` solo acredita proceso; `/ready` repite todos los preflights. Cierre idempotente de listeners, notifiers y scheduler. Escucha únicamente loopback.
- Quince pools/logins físicos independientes y capacidades SQL exactas. La migración candidata crea solo roles `NOLOGIN/NOINHERIT` y grants de RPC; no crea LOGIN, contraseña, endpoint, worker o proveedor.
- H4 usa una capacidad de tres RPC —tablero de destino/recogida, transición autorizada e historial— mediante `SET LOCAL ROLE`. El LOGIN no obtiene `EXECUTE` directo, tablas, columnas ni secuencias.
- `server.mjs` y la configuración `health-only` permanecen intactos. No se activó Stripe, correo, worker, Supabase operativo ni infraestructura.
- Los dos `test.skip` de §37.3 se sustituyeron por pruebas activas sobre el entrypoint realmente seleccionado; **12/12 PASS, 0 SKIP** en la suite focalizada.

## Pruebas ejecutadas y defectos corregidos

1. PostgreSQL 17 desechable, migraciones limpias, JWT real y Chromium mediante `catalog-postgres17-node-driver-smoke.sh`:
   - Primera pasada: 50/51 del bloque raíz; fallo de arnés por una referencia fuera de ámbito antes del subrecorrido M2. Corregido.
   - Segunda pasada: todas las baterías previas PASS y 50/51 del bloque raíz; el bootstrap falló cerrado con `permission denied for schema sabora`. Causa: composición H4 heredada que esperaba grants directos al LOGIN, incompatible con el modelo M2 `NOINHERIT + SET ROLE`.
   - Corrección: capacidad H4 exacta, preflight de membresía/superficie y transacción con `SET LOCAL ROLE`. No se repitió localmente la suite de siete minutos; la validación integral se delega una sola vez al CI del SHA publicado.
2. `npm run check`: Node ejecutó **1.176 PASS / 1 FAIL / 0 SKIP**. El único fallo fue el guard de cobertura porque la migración nueva aún no figuraba en la auditoría individual. Añadida su clasificación; las cinco suites focalizadas quedan **10/10 PASS**.
3. `pnpm build`: API, typecheck y build Vite de PWA cliente y gestión PASS. La primera invocación local quedó bloqueada por el sandbox de Windows; la misma fase fuera de ese aislamiento compiló ambas PWA.
4. `production-config-secrets-gate.mjs`: PASS (`production_config_gate_ok`).
5. `node --check` de bootstrap, capacidades y arnés, más `git diff --check`: PASS.

La primera CI del commit `e252779b` falló antes de las baterías funcionales porque `b3-h6-reader-role-smoke.sql` todavía intentaba crear la capacidad que la migración M2 ya provisiona. El smoke se corrigió para auditar el rol versionado, crear únicamente su LOGIN desechable y comprobar que el rollback conserva la capacidad y elimina el LOGIN. No se amplió ningún privilegio.

La segunda CI (`30a3c927`) superó migraciones y llegó al subrecorrido M2 tras 48 pruebas PG17 correctas. La lectura de gestión devolvió `403` porque el arnés reutilizaba un camarero que el recorrido de revocación anterior había desactivado intencionadamente. Se sustituyó por un cuarto actor real activo, con JWT propio y pertenencia PostgreSQL; después de la lectura positiva se revoca en SQL y el mismo JWT debe recibir `403`. La autorización no se relajó.

## Dictamen y límites

- **CV-004: implementado**, pendiente de fijar enlace/SHA final del PR y CI.
- **CV-005: implementado, EN VALIDACIÓN**. No se declara candidato validado hasta que el recorrido PG17/Fastify/Chromium final pase en Actions sobre el mismo SHA.
- Los mocks de Stripe solo demuestran el límite interno y no acreditan Stripe sandbox. No existe aprobación visual de caja/cierre ni autorización productiva.
- M1 no se reabre ni se declara cerrado desde este trabajo. M3 no debe comenzar hasta superar la puerta CI de M2.
- Producción: **NO-GO**. Sin merge, deploy, migración operativa, VPS, Fleetia o recursos compartidos.
