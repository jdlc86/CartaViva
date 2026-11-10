# Cierre de integración H4/H6 en escritorio — 29-10-2026

## Alcance

Este informe registra la ejecución de `docs/assignments/CODEX_DESKTOP_H4_H6_INTEGRATION_2026-10-29.md` sobre el PR Draft #40. La fuente de verdad utilizada fueron los contratos normativos vigentes; el encargo y los documentos de continuidad se trataron solo como contexto.

El resultado permanece como candidato opt-in. No se importa desde `server.mjs`, no activa workers ni correo, no despliega servicios y no aplica migraciones a Supabase operativo.

## Defectos de integración corregidos

1. `createH4H6IntegratedCandidate` llamaba al registro H4 antiguo `registerVerifiedOrderOperationsFromPools`. Ese camino no es el utilizado por el candidato H4 completo y rechazaba el lector SQL mínimo que necesita consultar exactamente `user_id`, `role` y `state`. El compositor común utiliza ahora `registerVerifiedRestrictedOrderOperationsFromPools`, con los preflights independientes ya aprobados para el lector de personal y el principal de operaciones.
2. La composición H6 no propagaba un intervalo configurable y acotado a los dos streams SSE. Se añadió `eventHeartbeatMs`, validado entre 5 y 60 segundos y con el valor anterior de 15 segundos por defecto. Esto permite demostrar de forma determinista que una suspensión durable corta una conexión SSE ya abierta sin depender de `NOTIFY`.
3. El anterior ensayo de Chromium puenteaba peticiones mediante `page.route` hacia `app.inject`, declaraba SSE indisponible y usaba una orden H4 sin ronda H6. Se sustituyó por un listener Fastify real en loopback, proxy local de Vite, visita/cuenta/ronda/despacho H6 válidos, JWT RS256 firmado y PostgreSQL 17 desechable.
4. El preflight de activación usaba rutas POSIX literales en sus fixtures y `URL.pathname` para localizar el repositorio. La suite completa fallaba en Windows aunque los artefactos existieran. Los fixtures usan ahora `node:path.resolve` y la raíz real se convierte con `fileURLToPath`; la misma política queda cubierta de forma portable.
5. La limpieza del ensayo de agotamiento intentaba borrar 46.655 altas sintéticas y forzaba comprobaciones repetidas de varias claves foráneas `ON DELETE RESTRICT`. El ensayo conserva esas filas únicamente hasta destruir el contenedor desechable y libera el pool que comparten las pruebas posteriores. El escenario completo pasó de horas a 7,9 segundos sin cambiar el esquema ni el resultado contractual.
6. En Linux Chromium puede registrar en consola el 403 de recurso que produce deliberadamente la suspensión, mientras que en la pasada local no lo hizo. La regresión exige ahora cero errores durante todo el recorrido autorizado y, después de suspender, permite únicamente el diagnóstico literal de red 403 esperado. Cualquier otro error de consola o página sigue fallando el gate.

## Matriz de aceptación

| Requisito | Implementación y comprobación | Evidencia automatizada |
| --- | --- | --- |
| Un solo candidato H4/H6 | `createH4H6IntegratedCandidate` registra una sola vez las rutas H4, recogida H6 y SSE, después de todos los preflights aplicables | `scripts/ci/order-operations-read-postgres17.test.mjs` comprueba las siete rutas y el arranque positivo |
| Principales mínimos y separados | lector H4, operaciones H4, cliente H6, proveedor H6, operaciones H6 y notificador usan seis LOGIN distintos; el flujo H3 y las sesiones conservan además sus propias identidades restringidas | preflights reales, denegación de tablas/roles y regresiones RLS del harness PG17 |
| Dependencias H6 reales | cookie auth construida con el verificador/revocador SQL, flujo de cliente con transacciones de rol, adaptador Stripe de test conforme a contrato y emisor HMAC de personal | el compositor arranca con esas dependencias; una llamada de Stripe no esperada falla cerrada y no existe red a un proveedor |
| Cocina → listo | Chromium usa la PWA de gestión para `confirmed → preparing → ready` por el HTTP real y un JWT de cocina | estado durable `ready`, tarea de recogida versión 1 y acción de corrección visible para cocina |
| Recogida sin inventar entrega | un segundo camarero ejecuta `Voy a recoger`; la PWA recibe `LS-815` por SSE, permite `Cancelo` por teclado y reasigna a `MS-812` | línea conserva `ready`; tarea termina `claimed`, versión 4; no aparece `delivered` ni se sintetiza `picked_up` |
| Concurrencia e idempotencia | dos JWT de camarero compiten por la misma versión; solo uno adquiere la tarea | respuestas 200/409, replay `repeated=true`, correlación incompatible 409, versión obsoleta 409 y un solo evento `claimed` |
| Atomicidad y rollback | el bloque integrado se ejecuta dentro de la regresión PG17 que conserva pruebas de rollback H4/H6, fencing, caducidad y ausencia de duplicados | `catalog-postgres17-node-driver-smoke.sh`, incluidos los tests H4, H6 y de capacidades existentes |
| SSE real y durable | la PWA abre `/api/v1/operations/events` por el mismo listener; PostgreSQL outbox y `LISTEN/NOTIFY` solo despiertan la lectura durable | actualización de responsable sin refresh/polling, interrupción forzada y reanudación con `Last-Event-ID` |
| Resync y deduplicación | el gateway se ejercita con un cursor de cocina anterior al mínimo disponible; el servidor emite `resync-required` y el callback recarga la proyección | promesa de `onResync` contra HTTP/SSE y SQL reales; el cursor monotónico evita reprocesar identificadores previos |
| JWT, roles y revocación | JWT ausente, malformado, caducado, sujeto sin personal y cocina intentando reclamar se rechazan; sala no puede corregir listo | 401/403 por el listener real; la suspensión también produce 403 en HTTP |
| Revocación con SSE abierto | el heartbeat vuelve a emitir capacidad y a validar membresía incluso sin evento nuevo | suspensión SQL de la sesión de sala abierta produce `access-revoked` y estado visual de canal no disponible en menos de 12 s |
| Cierre limpio | el cierre de la PWA aborta lectores, Fastify cierra el notificador, ejecuta `UNLISTEN` y libera la conexión | después de `app.close()`, `pg_listening_channels()` está vacío |
| Durabilidad y presentación | la asignación sobrevive a `page.reload`; se valida escritorio 1440 y móvil 390, foco, objetivo táctil, overflow y consola | Chromium real, foco por teclado, control ≥44 px, sin overflow horizontal ni errores de consola |

## Escenarios negativos y de seguridad

- No se sustituye `forRoles` por un stub ni se escriben `verifiedIdentity`/`verifiedStaff` en la aceptación integrada.
- Los actores proceden exclusivamente de JWT RS256 verificado y de la membresía activa leída con el principal H4 de columnas exactas.
- La respuesta de mutación no expone el UUID de autenticación del camarero. El identificador operativo compacto se obtiene de la proyección/evento autorizado y se contrasta con el estado durable.
- Un actor de sala no puede corregir `ready`; cocina no puede reclamar; un sujeto autenticado sin membresía no puede leer ni mutar.
- Un conflicto de correlación no altera la tarea, su versión, responsable ni auditoría.
- El principal técnico no recibe acceso directo a tablas privadas ni capacidad de `SET ROLE`, DDL o escalada.
- La limpieza del fixture libera sus reservas 811–815 y elimina únicamente esas cinco altas de recorrido. El ensayo final de agotamiento libera el pool y conserva sus filas sintéticas solo hasta que se destruye el PostgreSQL 17 desechable, evitando una limpieza fila a fila ajena al comportamiento probado.
- El estado real de partida no contiene personal dado de alta ni correos históricos. No existe migración, recuperación ni reconciliación de correos pendiente; las direcciones `example.invalid` del harness son datos efímeros de prueba y nunca un backfill operativo.

## Pruebas y resultados

Implementación funcional validada: `ea52e9b` (`test(sabora): close integrated H4 H6 acceptance gate`).

Comandos locales ejecutados sobre un árbol limpio de procesos de prueba:

```text
npm test
GITHUB_ACTIONS=true GITHUB_RUN_ID=local-h4h6-final-20261029 \
  scripts/ci/catalog-postgres17-node-driver-smoke.sh
npm run check
scripts/ci/management-browser-visual-smoke.sh
```

Resultados de la pasada final local:

- suite Node: 1.023/1.023;
- `npm run check`: 1.023/1.023, typecheck y builds de API, PWA cliente y PWA de gestión;
- harness PostgreSQL 17 completo: 105/105, con migraciones desde cero y destrucción final del contenedor;
- bloque integrado de lectura/gestión H4/H6: 8/8, incluido Chromium + Fastify + JWT + PostgreSQL 17 + SSE real;
- agotamiento del espacio de 46.655 códigos: 1/1, rechazo atómico sin alta parcial y limpieza del pool en 7,9 s;
- smoke visual: 12/12 PNG válidos de `resumen`, `comandas` y `equipo` a 360, 460, 900 y 1440 px;
- inspección visual representativa: estados vacíos/no operativos coherentes, sin datos simulados, navegación adaptativa y sin desbordamiento horizontal.

Tras detectar en Actions la diferencia de diagnóstico de consola del 403 de suspensión, se repitió íntegramente el mismo harness local: 105/105, incluido el E2E Chromium corregido. No se reejecutó solo el caso focal.

GitHub Actions sobre `eb1285b967c97375d4c7bf5b77fb2eb8b43616d5`, que contiene la implementación y este informe antes de incorporar las propias URLs, terminó íntegramente en `SUCCESS`:

- Sabora CI / `validate`: [run 40829340225](https://github.com/jdlc86/CartaViva/actions/runs/40829340225), 2 min 53 s;
- Management browser visual smoke / `management-browser-smoke`: [run 40829340236](https://github.com/jdlc86/CartaViva/actions/runs/40829340236), 50 s;
- Bootstrap lockfile / `generate-lockfile`: [run 40829340291](https://github.com/jdlc86/CartaViva/actions/runs/40829340291), 2 min 55 s.

El PR registra además los checks del SHA documental final. Un resultado de un SHA anterior al bloque de implementación no acredita esta entrega.

## Límites conservados

- El JWT es criptográficamente real y se verifica por el mismo código del candidato, pero usa claves efímeras de CI, no una sesión de Supabase operativo.
- Stripe se representa mediante el adaptador oficial H6 configurado con credencial de test y transporte inyectado; este recorrido operativo no realiza cobros ni red externa. Las políticas, resultados ambiguos y compensaciones permanecen cubiertos por la suite H6 separada.
- La PWA cliente no recibe rutas, estados ni capacidades de cocina o gestión.
- El candidato no está montado en el bootstrap productivo. La activación, secretos, observabilidad productiva, migración operativa y despliegue siguen siendo puertas separadas y requieren autorización.
- No se realizó merge, despliegue, modificación de Fleetia, VPS ni Supabase operativo.
