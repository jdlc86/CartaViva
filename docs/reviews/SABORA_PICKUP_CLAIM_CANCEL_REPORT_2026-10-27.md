# Informe de cierre Issue #33 — asignación de recogida

Fecha: 2026-10-27. Rama: `feat/sabora-pickup-claim-cancel-20261027`. PR: #34 (Draft).

## Resultado

El bloque candidato de Issue #33 queda implementado de extremo a extremo y validado en PostgreSQL 17 real desechable. «Voy a recoger» crea una asignación exclusiva versionada; «Cancelo» libera solo esa asignación; cocina puede corregir «Listo» a «Preparando» únicamente mientras no exista asignación. Ninguna acción acredita recogida física, entrega al comensal, cancelación de pedido ni cambio económico.

La composición sigue desconectada por defecto. No se ha ejecutado ninguna migración en Supabase operativo, no se ha activado worker, correo, Stripe, servidor ni endpoint productivo y no se ha realizado despliegue o merge.

## Contrato aplicado

Se leyó primero la normativa vigente y se usó el encargo aprobado de Issue #33 como contrato específico posterior. Los documentos de continuidad e integración H6 se utilizaron solo como contexto. No se cambió ningún contrato normativo para adaptar la implementación.

- `claimed` significa responsable operativo confirmado, no plato retirado físicamente.
- Primera asignación que obtiene el bloqueo de la versión esperada: gana.
- Reclamante concurrente: `409 pickup_claim_conflict` con estado y responsable confirmados.
- Cancelación: `claimed → ready`, nueva versión, mismo plato y mismo estado económico.
- Corrección: `ready → corrected` y línea `ready → preparing`; se rechaza si hay responsable.
- Vuelta posterior a `ready`: nuevo aviso activo, misma tarea rearmada y nueva versión.
- `picked_up`: dato histórico preservado y no reutilizado por el nuevo circuito.

## Implementación

### PostgreSQL 17

La migración `20261027190334_sabora_pickup_claim_cancel_candidate.sql` incorpora:

- `pickup_tasks` con estado, versión monotónica, responsable y timestamps;
- `pickup_task_events` append-only con correlación y una entrada por versión;
- avisos activos únicos por línea e invalidación explícita por corrección;
- creación/rearme atómico de tarea al persistir un evento `ready` H6;
- rechazo del reconocimiento legado para líneas bajo el circuito H6;
- wrapper `manage_pickup_task_h6_candidate` con HMAC, versión esperada, idempotencia durable y orden de bloqueo estable;
- RLS forzada y políticas exclusivas de owners `NOLOGIN`;
- un único `EXECUTE` adicional para `sabora_h6_operations_runtime`, sin acceso directo a tablas, secuencias, DDL o claves;
- auditoría y eventos `sabora.pickup.ready`, `claimed`, `claim_cancelled` y `ready_corrected` para cocina y sala;
- proyección H4 versión 2 con instantánea de tarea y responsable;
- backfill limitado a líneas H6 activas en `ready`; los registros históricos reconocidos quedan excluidos.

### API y capacidad

La capacidad `h6-pickup-v1` firma login SQL, actor, rol, acción, línea, `expectedVersion`, correlación, emisión y caducidad. El repositorio solo invoca el wrapper tipado y el preflight exige la superficie exacta.

Se añadieron los endpoints candidatos:

- `POST /api/v1/operations/order-lines/:lineId/pickup-claim`;
- `POST /api/v1/operations/order-lines/:lineId/pickup-claim/cancel`;
- `POST /api/v1/operations/order-lines/:lineId/ready-correction`.

Los dos primeros admiten sala/admin/root; la corrección admite cocina/admin/root. Los cuerpos son exactos (`expectedVersion`, `correlationId`) y los conflictos devuelven la instantánea persistida.

### PWA de gestión

La vista de operaciones muestra «Voy a recoger», «Cancelo» y «Corregir: Preparando» según rol y estado. Tras una colisión recarga el tablero y conserva visible el aviso de conflicto. El responsable se presenta mediante UUID canónico completo porque no hay contrato aprobado de alias de personal. La actualización procede del outbox/SSE existente; no se introdujo polling.

La PWA cliente permanece separada de cocina, sala y gestión.

## Reproducciones verificadas

La aceptación `scripts/ci/h6-postgres17.test.mjs` usa logins PostgreSQL reales `NOINHERIT` y no sustituye el principal restringido por un administrador.

1. Dos camareros reclaman en paralelo la misma versión: exactamente uno obtiene `claimed`; el otro recibe conflicto con el mismo responsable y sin segunda mutación.
2. El replay con actor/correlación/intención idénticos devuelve `repeated=true`, sin incrementar versión ni duplicar auditoría/outbox.
3. Otro camarero autorizado cancela la asignación; pedido, ronda, modo de pago y cuenta conservan sus valores.
4. Una capacidad emitida deja de ser válida cuando la membresía se suspende antes de ejecutar.
5. Cocina intenta corregir mientras la tarea está reclamada: conflicto explícito y cero efectos.
6. Tras cancelar, cocina corrige: línea en `preparing`, aviso invalidado, tarea `corrected`, auditoría y eventos atómicos.
7. Una nueva transición a `ready` crea otro aviso, rearma la tarea e incrementa la versión sin reinterpretar el historial.
8. El reconocimiento legado se rechaza para una tarea H6.
9. Una capacidad caducada después de esperar bloqueos se rechaza sin efectos.
10. Dos camareros autorizados recuperan por outbox los eventos de claim, cancelación y corrección.
11. Los logins runtime no tienen acceso directo a `pickup_tasks` ni `pickup_task_events`; RLS y preflight permanecen cerrados.

## Evidencias locales

- `npm test`: 978 pruebas Node satisfactorias (incluye rutas Fastify, gateway, modelo y regresión H3–H6).
- `pnpm --filter @sabora/management test`: 38/38.
- `pnpm --filter @sabora/management build`: typecheck y build Vite satisfactorios.
- `scripts/ci/catalog-postgres17-node-driver-smoke.sh`: exit 0; todas las suites PostgreSQL 17 pasan y el escenario H6 restringido queda 1/1.
- `scripts/ci/postgres-migration-smoke.sh`: exit 0; historial completo, constraints, RLS y concurrencia pasan con 39 tablas RLS.
- `pnpm --filter @sabora/client test:e2e`: 28/28 Playwright, 390 px y 1440 px, sin regresión de la PWA cliente.
- `npm run check`: exit 0; 978/978 pruebas Node, typecheck y builds de API, cliente y gestión satisfactorios.

## Límites y riesgos pendientes

- Candidato no activado: requiere autorización posterior para provisión de logins/secretos, migración operativa, montaje de rutas y despliegue.
- No existe contrato de nombre de presentación del personal; se muestra el UUID completo y no se inventan datos.
- Un conflicto optimista no se registra como acción exitosa ni crea evento, porque no muta estado. La respuesta incluye la instantánea actual; el cliente la recarga y el cambio ganador sí queda auditado y emitido.
- No se ha añadido estado de entrega final, acreditación física de recogida ni efecto sobre pagos/cancelaciones.
- La revisión independiente queda fuera de este encargo; este informe recoge implementación y validación propias.
