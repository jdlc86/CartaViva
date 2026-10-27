# Sabora — inventario para producción y continuidad Codex

Fecha: 2026-10-26. Documento de continuidad; **no es normativa**. La documentación normativa vigente en GitHub prevalece.

## Fuentes obligatorias

Leer completas: `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `SABORA_CUSTOMER_IDENTITY_CONTRACT.md`, `SABORA_CONTRACT_CONSISTENCY_V1.md`, `SABORA_CUSTOMER_SESSION_SQL_PRIVILEGES.md`, `SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`, `SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md`, `SABORA_ECONOMIC_PUBLICATION_IMPLEMENTATION_PLAN.md`, `SABORA_CATALOG_PUBLICATION_GATE.md`, `CARTAVIVA_PROJECT_BOUNDARY.md`, y `docs/design/screens/SABORA_HOME_IMPLEMENTATION_V1.md`. Revisar documentos posteriores antes de inferir decisiones.

## Situación real

PR #15: PWA premium de cliente. PR #16: candidato backend PG17 con sesión, QR, visita, quote, confirmación, cocina y sala. PRs #17–#22: cesta, precio, incidencias y sincronización. PRs #23–#26: autenticación HTTP y seguridad de sesión. PR #27: registro HTTP candidato. PR #28: cookie, verificación y logout candidatos; SHA `ae703dec58cfa3a33d4d6793b085eb80c660a515`, CI verde. Las ramas están apiladas; no asumir integración. `apps/api/src/server.mjs` solo expone `/health` y `/ready`.

## Inventario de puertas de producción

1. Consolidar ramas y contratos sin perder trabajo ni hacer merge automático.
2. Alta de perfil/sesión PostgreSQL 17 transaccional con permisos mínimos; cookie segura, CSRF, revocación, expiración, rotación y recuperación autorizada.
3. QR revocable, mesa abierta/pausada/cerrada, visita y asociación de identidad, con revalidación server-side por pedido.
4. PWA cliente conectada al backend real: catálogo, identidad, QR, quote, aceptación explícita de cambios, confirmación idempotente y estados veraces.
5. PWA gestión/cocina/sala conectadas con autorización, HMAC, auditoría, aviso durable y estados confirmed → preparing → ready → picked_up. No confundir recogida con entrega.
6. Regresión PostgreSQL 17 desechable: concurrencia, agrupación, agotados, precios, rollback, QR revocado, doble confirmación, RLS y privilegio mínimo.
7. Eventos dirigidos y notificaciones sin polling; antes cerrar normativa de cursor, retención, backlog y reconexión.
8. Seguridad HTTP, secretos, aislamiento entre clientes, CSRF/XSS, permisos SQL, rate limits y protección de datos.
9. Preproducción aislada: migraciones, tests Node/PG17/Playwright/axe, carga, observabilidad, backups, restauración y rollback.
10. Preparar despliegue totalmente aislado de Fleetia y demás proyectos; exigir autorización expresa antes de cualquier despliegue o migración operativa.

## Decisiones y módulos pendientes de comprobar

Pagos: autorización al confirmar y captura al despacho están aprobadas para modo digital, pero faltan proveedor y conciliación. Cancelaciones, entrega, cierre económico, devoluciones y propinas no acreditan un flujo completo. Reservas, anuncios y reposición de agotados tienen contratos o writers pendientes. Dashboard exige métricas reales y permisos. Passkeys, recuperación, conservación/exportación/eliminación, directorio CartaViva y dos PWA requieren validación. Clasificar qué es imprescindible para primera producción según normativa; no inventar exclusiones.

## Encargo a Codex

Inspeccionar repositorio, normativa, PRs #15–#28, ramas, migraciones y CI. Ejecutar bloques completos: **A: H3 cliente** (registro y sesión PG17, cookie/CSRF, QR, visita, quote, confirmación y PWA); **B: H4/H5** (gestión, cocina, sala, eventos y pruebas end-to-end); **C: release candidate** (regresión, diseño aprobado, seguridad, rollback y plan de aislamiento). Mantener PRs Draft, commits, pruebas y documentación con evidencias verificables. Ante fallos, corregir y repetir pruebas; esperar GitHub Actions mediante shell. No inventar contratos ni presentar simulaciones como producción. No modificar Fleetia, otros proyectos o infraestructura compartida. Sin merge, despliegue ni cambios en Supabase operativo sin autorización expresa.
