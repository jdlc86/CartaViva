# Sabora — preintegración controlada de PR #4 y #5

Fecha: 2026-10-24. Estado: evaluación documental en rama aislada; **no constituye integración de código ni autorización de merge/despliegue**.

## Fuente de verdad
- `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`
- `docs/architecture/SABORA_ORDER_KITCHEN_INTEGRATION_BOUNDARY.md`
- `docs/continuity/SESSION_08_HANDOFF.md`
- `docs/design/SABORA_ADMIN_UI_CODEX_HANDOFF.md` (rama Codex del PR #5)
- `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md` (rama Codex del PR #4)

## Diagnóstico reproducible de divergencia

Comparación GitHub contra `feat/sabora-pnpm-bootstrap`:
- PR #4, `codex/sabora-kitchen-waiter-operational`: **4 commits por delante, 207 por detrás**, base común `8297a71cbc776574fbb055078c0326af4d46a247`. Cambia 23 archivos; incluye API, migración, grants, pruebas PG17 y UI. Es una rama muy desactualizada; no fusionar directamente sin revisar conflictos de esquema, contratos y seguridad.
- PR #5, `codex/sabora-management-tables-workspace`: **11 commits por delante, 4 por detrás**, base común `b947ce101a490062eb9c62f718c29808c57c4336`. Cambia 20 archivos, concentrados en gestión y documentación; no contiene la composición runtime autenticada.
- Ambos PRs cambian `apps/management/src/style.css`; resolver la superposición en una integración futura con revisión visual y tests. No elegir una versión por precedencia automática.

## Fronteras de autorización y funcionalidad

1. Mantener la confirmación HTTP candidata **sin montar** mientras falten sesión cliente confiable, cesta y consentimiento de cambio de precio integrados.
2. PR #5 aporta lecturas y vistas de Mesas/Catálogo, **sin escrituras, QR ni publicación**. Su gateway runtime autenticado está pendiente.
3. PR #4 aporta operaciones cocina/camarero candidatas, pero su migración y API deben validarse con el escritor de pedidos y con roles/grants mínimos en un mismo SHA.
4. Una confirmación crea `orders` y `order_lines`; **no** equivale a despacho a cocina, notificación de recogida o entrega.
5. Ningún componente cliente debe ejecutar transiciones de personal ni asumir privilegios de backend.
6. Mantener separación de dos PWA y una sola instalación Sabora; no tocar Fleetia, VPS ni Supabase operativo.

## Secuencia para cerrar la integración (pendiente)

1. Asegurar base verde en el SHA común: suite Node, TypeScript, build y PostgreSQL 17 desechable.
2. Portar y revisar **por archivos** PR #4 a una rama de integración; conciliar migración, triggers, SQL de grants y operaciones con contratos vigentes. No traer cambios históricos obsoletos por merge ciego.
3. Portar PR #5, resolver `style.css` y validar navegación, carga, errores, concurrencia y accesibilidad.
4. Componer gateways reales con autenticación servidor y autorización por recurso. Mantener escrituras deshabilitadas hasta superar pruebas.
5. Ejecutar flujo extremo a extremo con PostgreSQL 17 desechable: confirmación, replay idempotente, línea durable, recepción de cocina, estado de camarero, y negativas por permisos, expiración y cierre.
6. Actualizar el handoff y aportar evidencias de GitHub Actions en el SHA final antes de solicitar autorización de merge/despliegue.

## Seguridad operativa

Esta rama es exclusivamente de preparación. No se ha fusionado ningún PR, ejecutado despliegue, alterado credenciales, tocado el VPS compartido ni modificado recursos de Fleetia.

## Avance de integración aislada — primera fase (24-10-2026)

- Se han trasladado desde PR #4 a **esta rama aislada** cuatro módulos API opt-in, dos suites Node, migración candidata, gate documental y dos verificaciones PostgreSQL 17. No se ha importado ni montado el código desde `server.mjs`; no hay grants operativos ni despliegue.
- Se ha corregido al trasladar el coordinador un límite de confianza: los argumentos de página/petición no pueden sobrescribir `actorId` ni `role` verificados. El spread ahora coloca el contexto de personal al final. Pendiente añadir regresión explícita y verificar CI.
- Los scripts PG17 trasladados todavía no se han conectado a los workflows; su presencia no equivale a ejecución ni certificación. La integración de vistas PR #5 sigue pendiente.

## CI de operaciones candidato — siguiente iteración

- Se verificó fallo real de ambos workflows tras añadir la migración: la comprobación heredada exigía 19 tablas RLS; la nueva tabla `sabora.order_line_transition_requests` eleva el total a 20. Se actualizó el recuento y se exige protección RLS + FORCE RLS específica de esa tabla.
- El smoke de grants de operaciones se ejecuta ahora en `postgres-migration-smoke.sh` tras aplicar todas las migraciones.
- La prueba real Node + driver `pg` de cocina/camareros se ejecuta ahora desde `catalog-postgres17-node-driver-smoke.sh`, usando únicamente su PostgreSQL 17 desechable en GitHub Actions. Su ejecución no autoriza runtime.
- Nueva prueba de regresión comprueba que parámetros de cliente no reemplazan `actorId` ni `role` verificados en ninguna de las tres operaciones.
- **No declarar CI verde hasta consultar las ejecuciones correspondientes al HEAD final.**
