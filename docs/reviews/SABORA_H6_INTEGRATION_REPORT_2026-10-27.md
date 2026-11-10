# Informe de integración H6 — 2026-10-27

Estado del cambio: **candidato validado localmente y por CI, desconectado y pendiente de revisión independiente**. Rama `integration/sabora-h6-full-20261027`, descendiente del candidato de production-readiness/QR V1. No hubo despliegue, merge, Supabase operativo, VPS, Fleetia, correo ni proveedor real.

## Resultado por vertical

### H3–H5 consolidado

- La confirmación cliente conserva identidad/cookie HttpOnly, QR V1 solo en memoria, visita durable, cesta/cotización y aceptación de cambio de precio.
- La persistencia de pedido y la nueva cuenta/ronda/pago/despacho H6 es atómica e idempotente.
- Las dos PWA permanecen separadas. Cliente no importa módulos de gestión; cocina/sala no se montan por defecto.

### Eventos

- Outbox PostgreSQL transaccional, cursor, agregado/versión, audiencia, replay, deduplicación, revocación y retención lógica.
- SSE cliente y personal con lectura autorizada del backlog después de cada `NOTIFY` post-commit; sin polling de base de datos.
- Reanudación por `Last-Event-ID`, `resync-required` y fail-closed ante pérdida de ámbito.

### Pagos

- `pay_now`: autorización manual por ronda positiva, agrupación de cinco minutos, captura antes de despacho y bloqueo de preparación hasta ACK.
- `pay_at_end`: deuda durable y liquidación presencial autorizada. Una ronda gratuita no selecciona modalidad.
- Política de mesa versionada y modalidad fija por cuenta.
- Stripe test-only inyectado, claves idempotentes durables, HMAC de webhook sobre cuerpo crudo, deduplicación, fecha de caducidad capturable, consulta puntual, liberación y reembolso.
- Estado ambiguo bloqueante; captura sin commit local entra en compensación y crea reembolso al cargo original.

### Cocina, sala e incidencias

- ACK de despacho, preparación, listo y `picked_up` conservan las transiciones H4 existentes.
- Incidencias por cocina/camarero, arbitraje admin, motivo, actor, correlación, ajuste de deuda, reembolso digital y devolución presencial durable.
- La PWA de gestión se actualiza por SSE y permite ACK, expediente, arbitraje y registro de devolución en efectivo. No declara `picked_up` como entrega final.

## Matriz requisito → implementación → prueba

| Requisito | Implementación principal | Evidencia automática |
|---|---|---|
| Confirmación atómica H3/H6 | migración H6, `customer-production-flow.mjs` | `h6-postgres17.test.mjs` |
| RLS y privilegio mínimo | roles H6 + `h6-sql-preflight.mjs` | preflight real y negativas de tabla/`SET ROLE` en PG17 |
| Outbox post-commit y replay | `event_outbox`, `h6-event-stream.mjs` | backlog/replay/revocación PG17; parser SSE gestión |
| Sin polling | LISTEN/NOTIFY + SSE | tests de fuente y ausencia de `setInterval` de negocio |
| Pago inmediato y captura diferida | `h6-stripe-adapter.mjs`, `h6-payment-orchestrator.mjs` | unitarias + integración PG17 |
| Resultado ambiguo/reconciliación | estados `*_unknown`, consulta puntual | `h6-payments-events.test.mjs` |
| Captura sin despacho | compensación + reembolso durable | regresión real PG17 |
| Webhook firmado/deduplicado | `h6-stripe-webhook.mjs`, ledger webhook | firma/cuerpo crudo + dedupe/conflicto PG17 |
| Cocina/sala | repositorio/coordinador/HTTP H6 + H4 | concurrencia ACK y guard de preparación PG17 |
| Incidencias/reembolsos | funciones de expediente, resolución y efecto | cocina no denegable, refund Stripe y cash refund PG17 |
| Cliente premium | Checkout, política de mesa, SSE | Playwright móvil/escritorio |

## Pruebas ejecutadas

Resultados definitivos locales verificados en el cierre del bloque:

- migraciones completas en PostgreSQL 17 desechable: **exit 0**;
- integraciones Node + PostgreSQL 17 existentes y H6: **exit 0**; la prueba H6 completa pasa bajo tres logins reales `NOINHERIT` de privilegio mínimo;
- unitarias H6 Stripe/eventos: **10/10**;
- suite Node del repositorio: **977/977**;
- gestión: TypeScript y **37/37 tests** tras añadir streaming/operaciones;
- cliente Playwright: **28/28** en 390 px y 1440 px, incluido QR → cotización → `pay_at_end` → confirmación → SSE H6;
- `npm run check`: **exit 0**, con pruebas, typecheck y builds de API, cliente y gestión;
- `git diff --check`: **exit 0**.

### GitHub Actions sobre el SHA de implementación `a87479d`

- `validate`: **pass**, 2 min 19 s — <https://github.com/jdlc86/CartaViva/actions/runs/40552932237/job/122361212085>;
- `client-browser`: **pass**, 1 min 20 s — <https://github.com/jdlc86/CartaViva/actions/runs/40552932400/job/122361212152>;
- `management-browser-smoke`: **pass**, 42 s — <https://github.com/jdlc86/CartaViva/actions/runs/40552932190/job/122361212509>;
- `generate-lockfile`: **pass**, 2 min 11 s — <https://github.com/jdlc86/CartaViva/actions/runs/40552932238/job/122361213216>.

El PR permanece en Draft. Este registro de CI no sustituye la nueva revisión independiente solicitada.

## Pendiente real para producción

1. Revisión independiente y CI del PR Draft.
2. Decisión normativa de límites antifraude si se desea permitir cancelación solicitada por cliente sin aprobación administrativa.
3. Autorización operativa separada para logins restringidos, secretos, webhook público de cuerpo crudo, Stripe Elements/test mode, scheduler/worker, migración y despliegue.
4. Contratos e implementación futuros de entrega final, propinas reales, pago por terceros, reservas, comunicaciones y passkeys.
5. Trabajo de infraestructura para poda física del outbox, observabilidad, alertas, backup/restore y runbook de conciliación.

Mientras estos puntos sigan abiertos, el candidato es **NO-GO para producción** aunque CI esté verde.
