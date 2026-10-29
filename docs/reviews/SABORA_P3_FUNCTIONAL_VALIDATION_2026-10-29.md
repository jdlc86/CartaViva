# Sabora — P3 bloque 4: validación funcional integral

**Fecha:** 2026-10-29

**PR:** #40 Draft

**Estado:** implementación y validación local completas; PostgreSQL 17 y CI remotos pendientes del SHA funcional

## Alcance y fuente de verdad

Este bloque contrasta la implementación con `SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `SABORA_CONTRACT_CONSISTENCY_V1.md`, `SABORA_TABLE_QR_PAYLOAD_CONTRACT_V1.md`, `SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`, `SABORA_STAFF_DIRECTORY_READ_CONTRACT_V1.md` y `DESIGN_SYSTEM_CONTRACT.md`. Los documentos candidatos y de continuidad se usan solo como trazabilidad de implementación.

No se ha activado ninguna ruta candidata, worker, proveedor, envío, despliegue o migración operativa. La PWA cliente sigue sin rutas de cocina, sala o administración; la gestión solo abre el transporte operativo mediante el montaje autenticado explícito. Se mantiene la prohibición de polling periódico.

## Matriz ejecutable

`scripts/ci/functional-validation-contract.mjs` fija once capacidades y exige evidencia ejecutable por capa. El gate falla si desaparece un marcador de prueba, una capa requerida, la ejecución de Node/PostgreSQL 17/Chromium en Actions, la separación de la PWA cliente o la prohibición de `setInterval` de negocio.

| Flujo | Navegador | Node/contrato | PostgreSQL 17 real | Resultado local |
| --- | --- | --- | --- | --- |
| QR | Canonicalización, borrado del fragmento, cámara y revocación | Parser/emisor V1 | rotación concurrente y autorización | PASS |
| Visita | autorización y rechazo revocado | transporte same-origin | principal restringido, expiración y revocación | PASS |
| Catálogo | carga dinámica, agotados y accesibilidad | proyección publicada cerrada | escritor, RLS y rollback | PASS |
| Pedido | confirmación H6 y fallo ambiguo | idempotencia/consentimiento | confirmación concurrente y replay | PASS |
| Agrupación | respuesta de ronda visible | reglas de cinco minutos | primera/agrupada/tardía | PASS |
| Cocina | preparar y marcar listo | permisos y transiciones | ACK, fencing y outbox | PASS |
| Sala | «Voy a recoger» y «Cancelo» | DTO/política de acciones | exclusión concurrente e idempotencia | PASS |
| Notificaciones | SSE cliente | cursor, deduplicación y cierre | outbox y SSE loopback real | PASS |
| Errores | pedido no confirmado y gestión recuperable | respuestas malformadas cerradas | rollback/denegaciones | PASS |
| Offline | shell disponible, API no cacheada | misma clave ante ambigüedad | — | PASS |
| Revocaciones | QR/visita rechazados | aborto HTTP/SSE de gestión | sesión/personal y `access-revoked` | PASS |

## Defectos detectados y corregidos

El smoke Chromium de gestión usaba todavía la proyección `version: 1`; por tanto, el navegador no consumía `pickup` y no ejercitaba el recorrido de sala aunque PostgreSQL 17 sí lo validaba. Se migró el fixture aislado a `version: 2` y ahora cubre cocina `confirmed → preparing → ready`, cambio de rol, asignación `ready → claimed`, cancelación `claimed → ready`, identidad operativa visible, error 503 recuperable y revocación al desmontar.

La prueba visual heredada seguía prohibiendo cualquier transporte de red de la antigua maqueta desconectada. Se estrechó la aserción: la previsualización y todas las vistas ordinarias continúan sin transporte propio, mientras que el único boundary permitido es el gateway autenticado inyectado, sin cookies, con bearer fresco, abort/revoke y rutas `/api/v1/operations/` cerradas.

En cliente se añadieron regresiones Chromium para QR/visita revocados y para un resultado de confirmación ambiguo: no se muestra éxito, no se vacía la cesta y no existe reenvío automático. La repetición requiere una acción expresa y conserva el contrato idempotente del servidor.

## Evidencia local

- `npm run check`: **1.057/1.057 PASS**, builds API/cliente/gestión PASS y gate de secretos PASS.
- `pnpm --filter @sabora/management test`: **54/54 PASS**.
- Playwright cliente: **32/32 PASS** en 390 px y 1440 px, incluidos offline, revocación y resultado ambiguo.
- Chromium gestión autenticada: PASS para cocina, sala, error recuperable, aislamiento por rol y logout.
- Gate funcional: **11/11 capacidades PASS** y pruebas de debilitamiento PASS.

PostgreSQL 17 no se suplanta localmente: los harnesses rechazan expresamente máquinas de desarrollo y solo aceptan el contenedor efímero de GitHub Actions. El workflow principal ejecutará la cadena de migraciones y los bancos H3/H4/H6 con principales restringidos antes de declarar este bloque cerrado.

## Límites

- Los fixtures HTTP de Playwright no sustituyen PostgreSQL; la aceptación de atomicidad, concurrencia, RLS, outbox y revocación se acredita en los harnesses PG17 del mismo SHA.
- No se ha probado infraestructura, secretos, Stripe, correo, Storage o latencia productivos.
- La validación técnica no activa las composiciones candidatas ni autoriza producción.
