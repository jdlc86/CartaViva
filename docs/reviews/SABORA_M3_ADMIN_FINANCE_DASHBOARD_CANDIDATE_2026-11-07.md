# Sabora — M3: dashboard financiero ADMIN, implementación candidata (07-11-2026)

> **Informe de hito técnico, subordinado a la normativa.** No es una nueva regla económica ni certificación de producción, aceptación de diseño o ejecución Stripe real. PR [#49 Draft](https://github.com/jdlc86/CartaViva/pull/49), rama `feat/sabora-cv012-independent-pwas-20261106`. **SHA funcional bajo CI: `7efb1ec89c39221f94d02786fc22ff2008277fc6`.** No existe autorización de despliegue ni contacto con Fleetia, VPS ni Supabase operativo.

## 1. Contrato aprobado y límites

Normativa: [SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1](../architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md), § «Dashboard informativo del restaurante», [REQUISITOS_FUNCIONALES](../REQUISITOS_FUNCIONALES.md), [estilo visual aprobado](../design/APPROVED_VISUAL_STYLE_AUDIT_V1.md) y [Design System](../DESIGN_SYSTEM_CONTRACT.md). Solo un restaurante, pantalla de **Configuración de la PWA gestión exclusivamente ADMIN**, lectura no fiscal de importes al cliente, con zona horaria configurada, sin sondeos periódicos. Ventas netas separadas de recaudación, saldo, propinas y estados pendientes; filtros Hoy, Últimos 7 días, Este mes, Mes anterior, selección mensual, tendencia diaria y ranking de diez platos. Los datos inciertos o no atribuibles **no se inventan**.

Antes del cambio, `SummaryView` tenía métricas y gráfico *placeholder*. La decisión normativa exige el dashboard en Configuración, no revelar a cocina o camarero. La pantalla de Resumen queda como presentación no financiera y la navegación Configuración se activa únicamente tras una lectura autorizada; un enlace directo nunca sustituye las comprobaciones JWT/rol/HMAC/SQL.

## 2. Código implementado (candidato aislado)

| Superficie | Evidencia | Qué hace |
| --- | --- | --- |
| Historial proveedor | [Migración candidata M3](../../supabase/migrations/20261107160000_sabora_m3_finance_dashboard_candidate.sql) | Tabla `finance_provider_events_candidate` de eventos de captura/reembolso **inmutables**, con marcas de recepción confirmada, disparadas por transiciones SQL. Bloquea UPDATE/DELETE/TRUNCATE. Capturas antiguas sin marca inmutable **no** se inventan a partir de `updated_at`; su recaudación global se devuelve como **Sin datos** |
| SQL contable | `sabora.read_admin_finance_dashboard_candidate` | Ventas día/mes y periodo netas de incidencias aprobadas, recaudación registrada y devoluciones, saldo exigible abierto, pedidos sin repetir, ticket medio por cuenta consumidora, tendencia por fecha local, ranking cuando hay identidad y ajuste atribuible, efectivo/tarjeta separados y propinas marcadas explícitamente como no disponibles |
| Seguridad | [Capacidades M3](../../apps/api/src/m3-management-capability.mjs), [preflight](../../apps/api/src/m3-runtime-capabilities.mjs), [migración](../../supabase/migrations/20261107160000_sabora_m3_finance_dashboard_candidate.sql) | `finance.read` firmado por backend, revalidación del miembro ADMIN/root activo en SQL, nueva y **única** función permitida al login M3 catálogo NOINHERIT, dueño interno NOLOGIN, FORCE RLS y prohibición de acceso directo a tablas por runtime/clientes |
| API | [HTTP](../../apps/api/src/m3-management-http.mjs), [repositorio](../../apps/api/src/m3-management-repository.mjs) | `GET /api/v1/admin/finance/dashboard?period=...&month=...`: JWT admin, HMAC exacta, filtros acotados, SQL con zona configurada, `Cache-Control: no-store`. Un timezone no configurado falla cerrado; nunca se deduce del navegador |
| PWA gestión | [Vista](../../apps/management/src/views/FinanceDashboardView.tsx), [gateway](../../apps/management/src/m3-authenticated-management-gateway.js), [shell](../../apps/management/src/main.tsx) | Configuración ADMIN, KPI diarios/mensuales y del periodo, gráficos/ranking responsive, filtros, lectura con instante y huso, carga/vacío/error, nueva lectura **manual**, valores no disponibles y no fiscales |
| Escenario integral | [I49 existente](../../scripts/ci/table-change-root-postgres17.test.mjs) | M3 + Fastify + JWT + rol SQL limitado + administración + pedido real + lectura financiera + PWA Chromium 390/1440. Control negativo para usuario anónimo, camarero y cocina. No introduce microtests sustitutivos |
| Auditoría migratoria | [inventario](../../scripts/ci/migration-audit.mjs), [seguridad FORCE RLS](../../scripts/ci/postgres-migration-smoke.sh) | Registra riesgos de DDL/privilegios y exige **55** tablas FORCE RLS, comprobando la nueva tabla nominalmente y los grants públicos prohibidos |

**Zona horaria**: para el candidato opt-in, `management.dashboardTimeZone` debe inyectarse explícitamente; las pruebas de PG17 usan `Europe/Madrid`. Todavía **no existe** configuración operativa/aprobación de huso en producción; con `null` el dashboard falla cerrado.

## 3. Reglas de agregación y advertencias residuales

- **Ventas:** rondas económicas positivas actuales atribuidas al instante original de pedido confirmado; ajustes aprobados atribuidos a la resolución de la incidencia. No atribuir `updated_at` mutable como fecha fiscal. Comparaciones «—» cuando periodo anterior es cero.
- **Recaudación:** cobro efectivo solo por asientos `cash_settlements`; digital solo por captura Stripe confirmada y refund realmente `succeeded`. La ausencia de marcas inmutables en pagos históricos hace `stripeCollectedCents`, `collectedCents` y comparaciones **nulos**; el efectivo sigue separadamente visible.
- **Saldo pendiente:** suma de `customer_accounts.outstanding_cents` abiertas/bloqueadas al instante de lectura, no ingreso cobrado. Propinas excluidas de ventas y marcadas `tipsAvailable:false`, sin total ficticio.
- **Ticket medio:** cuentas distintas con consumo positivo confirmado del periodo; no por ronda. Pedidos gratuitos cuentan como pedidos confirmados, pero no fijan modalidad ni inflan denominador de ticket.
- **Ranking:** no estimar platos cuando existen snapshots históricos sin identidad verificable ni incidencias generales sin línea; en tales casos `rankingComplete:false`, `topItems:null`. La reducción exacta de **unidades parcialmente anuladas** requiere comprobar que la asignación de cancelaciones sea suficientemente granular antes de aceptación final; no afirmar precisión fiscal.
- **Huso y cortes:** cálculo sobre fechas PostgreSQL según zona configurada; «Mes anterior» alinea el gráfico con ese mes. Regla de atribución tardía documentada aquí como criterio técnico **pendiente de validación de negocio**.
- **Prestaciones/permisos:** candidato para un único restaurante. Lecturas globales agregadas pueden requerir índices/medición con volumen real antes de GO. Sin polling, PII ni divulgación de historia financiera al cliente.

## 4. Ejecuciones y clasificación

- **SHA `3629c618`**: falló compilación TypeScript del método async y anotaciones explícitas de números; corregidos.
- **SHA `715ac483`**: 3/5 PWA SUCCESS, PG17 bloqueado por `CREATE FUNCTION` duplicada para verificador M3; corregido con `CREATE OR REPLACE`.
- **SHA `7f47e306`**: cliente, gestión y dual PWA SUCCESS; H6 CI y Bootstrap PG17 fallaron por inventario FORCE RLS todavía fijado a 54 tras incorporar una tabla nueva. **No** se redujo la protección; el mismo smoke ahora exige 55 y comprueba la tabla por nombre.
- **SHA actual `7efb1ec8`**: tercera corrección en ejecución al abrir este informe; [H6 CI](https://github.com/jdlc86/CartaViva/actions/runs/42381751157), [Bootstrap](https://github.com/jdlc86/CartaViva/actions/runs/42381751124), [cliente](https://github.com/jdlc86/CartaViva/actions/runs/42381751099), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/42381751098), [doble PWA](https://github.com/jdlc86/CartaViva/actions/runs/42381751135). **Ninguno de estos enlaces es certificación de PASS hasta observar conclusión exitosa de los cinco en el mismo SHA**.

**Estado: IMPLEMENTADO COMO CANDIDATO; VALIDACIÓN PG17/Chromium EN CURSO; ACEPTACIÓN FUNCIONAL/VISUAL PENDIENTE.** El dashboard no cierra F20/R03–R05 ni M6. Stripe sandbox real y componente cliente, propinas, tercero/pagador, diseño validado por humano, F12/R08 y producción permanecen **NO-GO**. Sin merge, despliegue ni alteración de otros sistemas.

## Verificación final de CI para el candidato (mismo SHA)

**Commit `4c88b4968ec269641fb00aad2141897f00f08dd0`: 5/5 SUCCESS**, tras corregir el trigger de eventos `capture/refund` con tipos de fila de PostgreSQL separados. Registro de ejecución: [H6 CI](https://github.com/jdlc86/CartaViva/actions/runs/42382160647) bloques 1, 2A y 2B PASS; [Bootstrap PostgreSQL 17](https://github.com/jdlc86/CartaViva/actions/runs/42382160546) **51/51** PG17 y **4/4** cierres cero-coste; [cliente](https://github.com/jdlc86/CartaViva/actions/runs/42382160732), [gestión](https://github.com/jdlc86/CartaViva/actions/runs/42382160676) y [dos PWA](https://github.com/jdlc86/CartaViva/actions/runs/42382160618) SUCCESS.

**Dictamen:** implementación y **validación técnica candidata COMPLETADAS**, aceptación visual humana/funcional y producción **NO-GO**. Cuentas históricas Stripe sin instante de confirmación respaldado no se atribuyen a un día ficticio. F20/R03–R05, propinas, terceros, Stripe sandbox real y despliegue aislado siguen pendientes. [Continuidad 27 §16](../handoffs/SESSION_27_HANDOFF_2026-11-07.md), [tablero §36](../tracking/SABORA_LIVE_PROJECT_TRACKER.md) y [matriz §51](../assignments/SABORA_TABLE_CHANGE_AUDIT_ROADMAP_ACCEPTANCE_2026-10-30.md).
