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

## Integración PR #5 — lectura de Mesas/Catálogo

- CI confirmado verde para el bloque de operaciones de cocina y camareros anterior: Sabora CI #1785 y Bootstrap #1759 sobre `e3dca3629df14322385ef6ceb18a66b4a24e77c8`.
- Se han trasladado a esta rama aislada los modelos de lectura/paginación, controlador de respuestas concurrentes, navegación, vistas de Mesas y Catálogo, componentes compartidos, composición UI, estilos y pruebas de PR #5. Se conserva la naturaleza **solo lectura** y sin gateway autenticado runtime; las escrituras y QR continúan deshabilitados.
- La hoja `style.css` fue tomada de PR #5 para preservar sus vistas; la integración de la UI operativa de PR #4 (OrdersView y estilos) **no** está hecha. Antes de incorporar OrdersView de PR #4, conciliar CSS por selectores y verificar regresiones visuales.
- Este traslado es candidato sujeto a CI de HEAD; no declarar verde ni funcionalidad operativa hasta comprobar Actions. No se montaron rutas ni se realizaron merges/despliegues.

## Integración de interfaz cocina/sala — tercera fase

- Se han trasladado el gateway de operaciones inyectable, su modelo de estados/historial, las declaraciones TypeScript, la suite de comportamiento y la vista operativa de cocina/sala desde PR #4.
- Se han añadido únicamente los selectores de estilo operativos ausentes a la hoja consolidada de PR #5; **no** se ha reemplazado la hoja completa con la versión antigua de PR #4.
- `ManagementApp` admite ahora `operationsGateway?: OrderOperationsGateway` inyectado desde fuera. Sin gateway la vista permanece desconectada y no se realizan operaciones; no hay creación de credenciales ni transporte implícito.
- Los flujos de lectura, transición y consulta de historial siguen sujetos a autenticación, RLS y grants de mínimos privilegios pendientes. Esta integración UI **no** habilita runtime por sí misma.
- Validación del HEAD final pendiente de GitHub Actions; mantener PR #7 Draft y no desplegar.

## Cierre de integración y endurecimiento de lecturas

- Sobre `56d1a75b7352e9538bba3ed0e73ec7ece4f0be8c` los dos workflows finalizaron **SUCCESS**: Sabora CI #1814 y Bootstrap #1788. Integración PR #4 + PR #5 validada en ese SHA.
- Se añadió protección contra respuestas tardías en la vista de cocina: los refrescos de tablero y solicitudes de historial solo pueden publicar el resultado de su generación vigente. El cambio de gateway y el desmontaje invalidan las lecturas del tablero en vuelo.
- Estas correcciones posteriores requieren **su propio CI verde** antes de declarar el nuevo HEAD validado.
- El gateway y las rutas siguen sin activación runtime, sin grants y sin despliegue.

## Reintentos de transición desde la PWA

- La vista de operaciones conserva en memoria por línea la correlación de una transición cuyo resultado HTTP fue incierto; al reintentar el **mismo estado destino** reutiliza la correlación original para permitir replay durable, en lugar de producir una segunda operación con una clave nueva.
- La correlación se descarta tras una respuesta de transición confirmada; una transición distinta obtiene otra clave. Se mantiene la prohibición de doble clic mientras la solicitud está pendiente y la recarga posterior del tablero.
- Se añadió test de contrato para la reutilización y las barreras contra respuestas tardías. No se habilita almacenamiento persistente ni se altera el contrato de base de datos.

## Pruebas de composición segura (sin activación)

- Se añadió `tests/order-operations-composition.test.mjs` para rechazar el mismo pool SQL, identidades SQL iguales, cadenas de conexión iguales y pools sin `connect`, además de exigir que `server.mjs` no importe ni registre las rutas candidatas.
- Se comprueba también que la composición no crea conexiones ni consume configuración de entorno por sí misma. Esta prueba no sustituye los preflights de `current_user/session_user` ni autoriza grants operativos.
- El bloque runtime continúa bloqueado por los permisos y contratos descritos en `SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`.

## Preflight de identidad SQL sin activación

- Se implementó `preflightOrderOperationsIdentities` como utilidad explícita, no importada desde `server.mjs`. Comprueba en conexiones reales y separadas `current_user`, `session_user`, `rolsuper`, `rolbypassrls` y `rolcanlogin` para dos nombres de rol esperados y distintos; rechaza superusuarios, BYPASSRLS, SET ROLE y roles compartidos.
- La comprobación falla cerrada, descarta conexiones con resultado incierto y dispone de tests negativos de identidad y privilegios. No crea usuarios ni concede permisos.
- **Pendiente**: ejecutar el preflight con identidades PostgreSQL reales de mínimos privilegios en PG17 desechable, aprobar RLS/grants específicos y autorizar por separado la activación. La existencia del helper no habilita las rutas.

## Prueba de identidad real PG17 desechable

- El harness CI `catalog-postgres17-node-driver-smoke.sh` ejecuta ahora `order-operations-identity-postgres17.test.mjs` tras las migraciones sobre el contenedor PostgreSQL 17 de uso único, vinculado a `127.0.0.1`.
- El test crea **solo dentro de ese contenedor** dos LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS independientes y ejecuta el preflight real. Concede únicamente USAGE de esquema en el contenedor para comprobar denegación directa de lectura de reintentos y ejecución de RPC operacional sin GRANT.
- No se crea ninguna identidad ni se cambia permiso en Supabase o VPS operativo. No se concede permiso operativo a los roles CI.
- El nuevo HEAD debe pasar Sabora CI y Bootstrap antes de considerarse validado.
