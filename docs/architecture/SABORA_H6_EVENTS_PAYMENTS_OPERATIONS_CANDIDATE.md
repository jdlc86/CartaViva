# Sabora H6 — candidato de eventos, pagos y operación

Fecha: 2026-10-27. Estado: **candidato técnico desconectado; no desplegado**.

Este documento describe la implementación candidata de H6. No modifica ni sustituye los contratos normativos. En caso de discrepancia prevalecen `SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`, `SABORA_CONTRACT_CONSISTENCY_V1.md`, el contrato QR V1 y el gate de cocina/sala.

## Límite de activación

- Las migraciones `20261027122858_sabora_h6_events_payments_operations_candidate.sql` y `20261027190334_sabora_pickup_claim_cancel_candidate.sql` solo se han ejecutado en PostgreSQL 17 desechable.
- `server.mjs` no importa la composición H6. No hay rutas, worker, cron, Stripe, correo ni servicios productivos activados.
- `registerH6CandidateHttp` exige dependencias inyectadas, tres pools SQL separados y preflight satisfactorio antes de montar rutas. No lee secretos ni variables de entorno.
- La PWA cliente no contiene vistas ni operaciones de cocina, sala o administración.

## Persistencia y transacción

`confirm_customer_round_h6_candidate` envuelve la persistencia canónica H3 dentro de la misma transacción que crea cuenta individual, ronda económica, intento de pago —solo para una ronda positiva `pay_now`— y despacho bloqueado. Un fallo en cualquiera de esos efectos revierte todos. La clave de petición y el fingerprint impiden convertir un replay en otra intención.

La modalidad se fija con la primera ronda positiva de la cuenta. Una ronda gratuita no fija modalidad ni crea intento de proveedor. La política versionada de mesa bloquea `pay_at_end` cuando exige pago conforme se pide.

Las tablas H6 tienen RLS forzada, políticas exclusivas del owner técnico, guardas append-only donde procede y ninguna concesión directa a los logins runtime.

## Principales SQL

Hay tres roles de capacidad `NOLOGIN NOINHERIT`:

- `sabora_h6_customer_runtime`: confirmación económica, lectura de política/ronda y backlog del cliente.
- `sabora_h6_provider_runtime`: resultados/reconciliación de Stripe, captura, liberación y reembolsos.
- `sabora_h6_operations_runtime`: ACK de cocina, incidencias, arbitraje, liquidación/devolución presencial y backlog por rol.

Los logins reales deben ser `NOINHERIT`, sin superusuario, `BYPASSRLS`, DDL, tablas ni secuencias directas. El preflight compara identidad, membresía `SET ROLE` y superficie exacta de funciones antes del montaje.

## Eventos SSE

`event_outbox` asigna un cursor monotónico y conserva destinatario, agregado, versión, payload y fecha. La fila nace dentro de la transacción de negocio; el trigger `NOTIFY` se observa únicamente tras commit. `NOTIFY` es una pista sin datos de negocio: cada conexión vuelve a leer su backlog autorizado.

- Cliente: ámbito exacto de sesión, mesa, visita, identidad y cuenta.
- Personal: actor activo y audiencia de rol (`kitchen`, `waiter`, `admin`).
- Replay mediante `Last-Event-ID`, límite de 100 eventos por lectura, deduplicación por `eventKey` y señal `resync-required` si el cursor queda fuera de la retención lógica de siete días.
- La conexión se revoca al fallar la revalidación. No existe polling periódico; el heartbeat SSE es solo un comentario de transporte.
- La PWA de gestión consume el stream mediante `fetch` autenticado inyectado, sin credenciales en URL ni almacenamiento del navegador.

La retención física necesita un trabajo de mantenimiento futuro autorizado. H6 aplica ya el límite lógico y no permite que un cursor antiguo reciba una historia parcial como si fuera completa.

## Stripe y estados inciertos

El adaptador acepta exclusivamente credenciales test/restricted-test inyectadas. Usa PaymentIntent con `capture_method=manual`, importe en céntimos calculado por servidor, EUR, metadatos de correlación y claves idempotentes persistidas antes de cada llamada.

- Autoriza al confirmar y captura solo después de la ventana de agrupación.
- La fecha `capture_before` procede de Stripe y también se conserva al llegar por webhook.
- Timeout, transporte o respuesta contradictoria producen estado `unknown`; no se inventa éxito ni se habilita efectivo alternativo.
- La consulta puntual de PaymentIntent permite confirmar autorización/captura o autorizar exclusivamente el reintento con la misma clave.
- Captura externa confirmada más fallo de persistencia local crea `compensation_required`, bloquea cocina, conserva el `charge` y crea un reembolso durable por el total.
- Incidencia previa a captura libera la autorización con clave durable. Incidencia posterior a captura reembolsa al cargo original. Resultado ambiguo queda `unknown` y se reconcilia por webhook/consulta puntual.
- El webhook exige cuerpo crudo, HMAC Stripe dentro de 300 segundos, allowlist de tipos, hash durable, deduplicación por `event_id` y rechazo de identidad conflictiva. Los reembolsos vinculan su `refundAttemptId` durable mediante metadata firmada.

La captura y la solicitud de despacho se persisten en una sola transacción. Cocina no puede pasar una línea de `confirmed` a `preparing` hasta el ACK durable del despacho.

## Incidencias y efectivo

- Cocina: siempre abre arbitraje administrativo; un reintegro debido no puede rechazarse.
- Camarero por petición del cliente: sigue la configuración. Si se pidiera omitir aprobación sin límites antifraude normativos, se bloquea de forma explícita.
- Camarero por causa del restaurante: efecto económico automático y auditable.
- Cuenta abierta no cobrada: reduce deuda.
- Cuenta ya cobrada en efectivo: crea `cash_refund_due`; camarero/admin registra la entrega presencial con capacidad HMAC e idempotencia.
- Pago digital autorizado: libera autorización. Capturado: crea reembolso al cargo original.

## Asignación de recogida de sala (Issue #33)

El contrato aprobado de «Voy a recoger» se implementa como una asignación operativa exclusiva, no como recogida física ni entrega al comensal. La tarea `pickup_tasks` conserva un `version` monotónico y solo puede pasar `ready → claimed → ready` (cancelación de la asignación) o `ready → corrected` (corrección de cocina). La primera capacidad que bloquea la versión esperada gana; las demás reciben `409 pickup_claim_conflict` con la instantánea confirmada y no producen efectos.

- «Cancelo» libera únicamente la asignación y reactiva el aviso para todos los camareros. No cambia pedido, ronda, pago, incidencia ni entrega.
- Cocina solo puede corregir `ready → preparing` cuando la tarea no está asignada. La corrección invalida el aviso activo, deja auditoría append-only y una nueva transición posterior a `ready` crea un aviso nuevo.
- Cada cambio emite outbox durable para cocina y sala; todos los clientes autorizados recuperan el mismo estado por SSE, sin polling.
- Las capacidades HMAC vinculan login SQL, actor, rol, acción, línea, versión, correlación y caducidad. El wrapper vuelve a comprobar clave, membresía, visita y alcance después de adquirir los bloqueos.
- `picked_up` queda como estado histórico de la implementación anterior. No se genera en el circuito H6 de Issue #33 y no se reinterpreta como asignación, recogida física o entrega.

La proyección expone el UUID completo del responsable porque no existe un contrato aprobado de nombre público de personal. La UI no inventa alias y la auditoría conserva la identidad canónica.

## Custodia y datos

Los tokens QR siguen únicamente en memoria y en el fragmento de la URL conforme a QR V1. El SSE del cliente usa cookie HttpOnly same-origin; gestión usa el transporte autenticado ya inyectado. Los payloads operativos no contienen secretos de proveedor. Las claves Stripe, HMAC y SQL no se incluyen en la PWA ni en la migración.

## Límites conocidos / NO-GO

- Sin autorización para provisión de logins, secretos, webhook público, scheduler de vencimiento, worker de despacho, Stripe Elements, migración Supabase o despliegue.
- Los límites antifraude para cancelación de camarero sin aprobación siguen sin decisión normativa; esa variante queda cerrada.
- Entrega final al comensal, propinas reales, pago por terceros/asignaciones, reservas, comunicaciones y passkeys no se presentan como terminados en este candidato.
- La identidad de presentación del camarero sigue pendiente de contrato; hasta entonces se muestra el UUID canónico completo para evitar ambigüedad.
- La poda física del outbox y los runbooks de operación/alertas requieren un bloque de infraestructura autorizado.
