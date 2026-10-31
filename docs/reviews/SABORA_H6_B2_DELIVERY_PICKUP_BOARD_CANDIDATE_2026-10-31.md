# H6/B2 — tablero de entrega y recogida, candidato aislado (2026-10-31)

## Base normativa y alcance
Implementación aditiva sobre el HEAD `d0aba8927a176b415359d5c610ddf2c629c04930` del PR Draft #42.
Se mantiene la normativa de `docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`.
No se altera la identidad económica ni el histórico de `orders.table_id`.

## Candidato SQL
`20261031090000_sabora_h6_delivery_board_pickup_contract_candidate.sql`
introduce `read_order_operations_delivery_pickup_board_h6_candidate` como una superficie
**sellada**, sin EXECUTE para los roles de ejecución. Conservar el lector anterior permite
revisión independiente sin modificar el contrato actualmente consumido por la API.

El nuevo lector combina:
- Capacidad HMAC de lectura por actor, rol, ámbito, cursor y límite.
- Visibilidad cocina/sala y paginación estable por fecha, pedido y línea.
- Destino operativo mutable por línea (mesa/sesión/visita/versión), con fallback
  histórico restringido exclusivamente a líneas `picked_up`.
- Campos íntegros de tarea de recogida (identificador, estado, versión, empleado,
  identificador visible, tiempos), manteniendo notificaciones de tarea y fallback.
- El número de mesa visible proviene del destino de entrega; la mesa histórica
  del pedido no se reescribe.

## Prueba añadida
`scripts/ci/table-change-root-postgres17.test.mjs` verifica en PG17 aislado
la firma SQL, SECURITY DEFINER, propietario, ausencia de EXECUTE runtime,
campos del contrato y rechazo de una credencial HMAC falsificada.

## Límites y NO-GO
Esta entrega **no** activa el lector en la API, no otorga EXECUTE, no cambia
el contrato HTTP y no demuestra todavía lecturas positivas con credenciales
válidas, transferencia A→B con tareas de recogida, ni E2E cliente/cocina/sala.
Esos pasos requieren pruebas conductuales y preflight de privilegios antes
de considerar una activación. Sin merge ni despliegue; no tocar Supabase
operativo, VPS ni Fleetia.

## Integración de repositorio opt-in (31-10-2026)
El repositorio API `createOrderOperationsRepository({deliveryBoardCandidate:true})` selecciona exclusivamente para lecturas firmadas el lector H6 de destino/recogida, valida la identidad de destino, sesión y versión, y añade un objeto `delivery` a cada DTO. El comportamiento predeterminado continúa usando el lector H4 sin cambio de contrato. Se incorpora regresión PostgreSQL 17 con HMAC auténtico para A→B, preservación de identidad histórica y rechazo de versión SQL inválida.

**Límite de activación:** todavía no se conecta esta opción al compositor HTTP, no se cambia `server.mjs`, no se concede EXECUTE de runtime y no se modifica la PWA. La lectura firmada en la prueba usa un permiso temporal dentro de PostgreSQL desechable. El preflight de mínimo privilegio y los E2E completos siguen pendientes. Estado NO-GO.

## Bloque integrado: composición HTTP autenticada + preflight estricto (31-10-2026)
Se añade `registerVerifiedH6DeliveryOrderOperationsFromPools`, composición **opt-in** de los tres endpoints operativos. Reutiliza la autenticación de personal y el emisor HMAC existentes, pero selecciona el lector H6 mediante `createOrderOperationsRepository({deliveryBoardCandidate:true})`. El nuevo preflight `preflightOrderOperationsH6DeliveryIdentity` comprueba identidad SQL, cuatro wrappers autorizados, función H6 SECURITY DEFINER con propietario sellado y search_path fijo, y ausencia de acceso directo a tablas/secuencias. La composición rechaza credenciales, rutas o identidades no válidas antes de registrar endpoints.

Las pruebas unitarias del preflight y las de PostgreSQL 17 del repositorio se integran en el CI existente. Se corrigió un fallo de compatibilidad en los mocks del preflight; **commit `d156f8e`: Sabora CI SUCCESS y Bootstrap SUCCESS**.

**Frontera pendiente:** la composición es exportada, pero `server.mjs` no la importa ni la activa. La migración no otorga EXECUTE al runtime; el positivo PG17 usa un permiso temporal exclusivamente en la base desechable. Faltan activación deliberada en un entorno aislado, E2E HTTP específico H6 A→B con pickup/cancelación/SSE y aceptación funcional completa. **NO-GO**.

## HTTP A→B: aceptación aislada y límite detectado
Se incorporó una prueba de Fastify real con JWT firmado y PostgreSQL 17 desechable: deniega anónimos, JWT inválidos, camarero intentando consultar `confirmed` y paginación inválida; verifica que cocina ve el cambio A→B en `tableNumber` y `delivery`, mientras `orders.table_id` y `orders.session_id` conservan su identidad histórica.

Se ensayó ampliar el mismo fixture al ciclo `preparing → ready → picked_up`, pero la primera transición devolvió HTTP 503 en CI. **No se declara ese ciclo aceptado**: se retiró esa ampliación de la prueba para conservar el alcance verificable y se deja pendiente diagnosticar la incompatibilidad entre la transición H4 y el fixture H6/B2. El circuito H6 de recogida independiente ya tiene pruebas en otros escenarios, pero no sustituye esta aceptación conjunta. Estado **NO-GO** hasta corregir y demostrar el circuito completo.

## Diagnóstico del 503 y aislamiento de la recogida obsoleta (31-10-2026)
La prueba PG17 aisló el fallo: al intentar `picked_up` mediante el wrapper de transición heredado H4, PostgreSQL devuelve **SQLSTATE 23514: `legacy_pickup_transition_retired`**. No es correcto rehabilitar esa transición: la recogida vigente de H6 usa `pickup-claim` y `pickup-claim/cancel` con sus contratos propios.

Se introdujo `legacyPickupDisabled` en el registro HTTP, habilitado exclusivamente en `registerVerifiedH6DeliveryOrderOperationsFromPools`. Esta composición devuelve **409 `order_operation_conflict`** antes de tocar SQL cuando se solicita el `picked_up` heredado. La composición H4 predeterminada no cambia. En PostgreSQL 17 desechable se valida la transición a `preparing` con HMAC real, `ready` mediante HTTP autenticado y el rechazo explícito de la recogida obsoleta tras A→B. **Sabora CI y Bootstrap SUCCESS** en `e1d1ad9`.

**Pendiente para cerrar el hito:** integrar en un mismo escenario el contrato H6 de `pickup-claim`/`cancel`, conflictos concurrentes, eventos de sala/cocina y E2E navegador. El flujo de recogida no se declara terminado; **NO-GO**. Sin permisos de producción ni activación en el bootstrap.

## Aceptación integrada A→B, cocina y sala (31-10-2026)
El escenario PostgreSQL 17 desechable ahora utiliza un único servidor Fastify autenticado con el lector H6/B2 y los endpoints H6 de recogida, cada uno con su identidad SQL restringida y capacidad HMAC propia. Tras trasladar el destino de la línea de A a B, verifica `preparing` y `ready`, crea la tarea durable, lanza dos reclamaciones simultáneas por camareros distintos (exactamente un HTTP 200 y un 409), reintenta idempotentemente la ganadora, rechaza la versión obsoleta, cancela la asignación, repite idempotentemente la cancelación y permite que el otro camarero reclame la versión actual. Verifica al final que la línea sigue `ready`, el destino sigue siendo B con versión 2 y la tarea tiene una única asignación con versión 4. Se conserva el rechazo explícito del `picked_up` heredado.

**Evidencia:** commit `434d65ca92ed40bb007d27787e865bfb2f6be124`; Sabora CI run `41185324345` SUCCESS y Bootstrap run `41185324276` SUCCESS.

**Límite de aceptación:** la prueba integrada no equivale a autorización de producción. Permanecen pendientes el cierre normativo completo, las pruebas de eventos SSE/outbox y su replay en el escenario de cambio de mesa, las pruebas E2E de interfaz específica A→B y la revisión independiente de activación. Estado global **NO-GO**; sin despliegues, merges ni acceso a Supabase operativo/VPS.

## Destino de los eventos durables de recogida tras traslado (31-10-2026)
Se detectó que `emit_pickup_task_staff_events_candidate` utilizaba la mesa/sesión histórica de `orders` incluso cuando la línea tenía un destino vigente distinto. La migración candidata aditiva `20261031100000_sabora_h6_delivery_pickup_event_destination_candidate.sql` corrige únicamente la emisión futura de eventos de recogida: resuelve `order_line_delivery_destinations` con fallback histórico, incluye `deliveryTableId` y `deliveryVersion` en el payload y conserva `claimedDisplayId` y `actorDisplayId` de la normativa de identidad compacta. No reescribe eventos anteriores ni modifica la cuenta/visita históricas. Migración incluida en auditoría individual obligatoria.

La prueba PG17 aislada de traslado A→B, `ready`, dos reclamaciones concurrentes, replay, cancelación y nueva asignación comprueba ahora **ocho** eventos `event_outbox` exactamente, por rol `waiter`/`kitchen`, con destino B, sesión B, versión de destino 2 y versiones de tarea 1–4 sin duplicados por replay.

**Evidencia:** commit `c61c1928a939e9192d5670cfeea7f402d103f617`; Sabora CI `41186188670` SUCCESS; Bootstrap `41186188695` SUCCESS.

**Límites:** el contrato de eventos durables se ha probado en base de datos, pero la reproducción del SSE real sobre el escenario A→B y la aceptación visual integral aún requieren cierre específico. También debe revisarse el alcance de autorización de la recogida frente a mesa/visita de origen y destino para casos de cierre de la mesa original. **NO-GO** para producción, merges y despliegues.

## SSE real con cursor y reconexión A→B (31-10-2026)
La regresión integrada PostgreSQL 17 ahora monta además el transporte HTTP SSE Fastify de personal autenticado y su lector durable restringido H6, utilizando el mismo escenario de cambio de destino A→B y la tarea de recogida con competencia de camareros, cancelación y nueva asignación. Se abre una conexión con `Last-Event-ID` inmediatamente anterior al primer evento de la tarea; se comprueba que el stream entrega los cuatro eventos para audiencia `waiter` con IDs durables, el destino B y el evento de cancelación. Se reconecta desde el segundo ID y se verifica que solo llegan los eventos posteriores, sin repetir el cursor ya reconocido. Los eventos `kitchen` conservan audiencia separada en la comprobación de outbox. Se usa servidor loopback y PostgreSQL 17 desechable, sin activar `server.mjs` ni producción.

**Evidencia:** commit `5bfbc9033a00a0f4a4b786ae55b15bf6ece9c61c`, Sabora CI `41187140753` SUCCESS y Bootstrap `41187140749` SUCCESS.

**Pendiente bloqueante distinto:** la RPC de `manage_pickup_task_h6_candidate` todavía revalida `customer_table_visits` sobre `orders.table_id/session_id` (origen histórico). En un traslado consumado a B, cerrar o revocar la visita original A puede impedir la gestión de recogida aunque la entrega pendiente sea B. No se altera esa autorización sin revisión de invariantes y bloqueo de mesa/visita, especialmente la prohibición de heredar una ocupación nueva. Debe resolverse y probarse antes del GO. Faltan asimismo E2E visual específico y matriz normativa F01–F28/R01–R10 completa. **NO-GO**.

## Regresión de seguridad: revocación de la visita de origen (31-10-2026)
Se incorporó una regresión PG17 en el escenario A→B con recogida ya asignada: revocar `customer_table_visits` de A y solicitar la cancelación de la asignación con un actor autorizado y versión vigente produce HTTP 403; la tarea mantiene exactamente `state`, `version` y `claimed_by`. Se verifica que el bloqueo existente falla cerrado y no crea una transición parcial. **Esto NO resuelve el requisito de continuar la recogida en B**: demuestra el defecto operativo actual de la RPC que consulta `orders.table_id/session_id` y `orders.customer_visit_key` en vez de comprobar de forma consistente el vínculo operativo y el destino de la línea.

**Evidencia:** commit `b1ef28ac8655600c2bbaf1b8990608e6345f9d31`; Sabora CI `41187659244` SUCCESS; Bootstrap `41187659191` SUCCESS.

**Criterio de cierre pendiente:** implementar en un bloque transaccional la autorización basada en `customer_account_operational_bindings`, destino efectivo de línea, sesión/visita vigente en B y bloqueo/orden de concurrencia, con regresiones positivas B y negativas ante revocación/cierre/reocupación de B, sin heredar la visita A ni cambiar la titularidad económica. La ruta H6 de confirmación de nuevas rondas todavía mantiene un guard `table_change_transfer_not_integrated`; no interpretar los fixtures A→B de prueba como flujo cliente completo activado. **NO-GO**.

## Ampliación de regresión de revocación (31-10-2026)
La prueba de integración A→B tras revocar la visita original verifica también que la operación denegada no genera eventos de recogida adicionales, no persiste una clave de idempotencia para una acción no autorizada, no cambia la cuenta económica `order_rounds.account_id`, ni reescribe la mesa/sesión históricas del pedido. Repetir la solicitud con la misma correlación continúa devolviendo HTTP 403 y mantiene inalterada la asignación. Evidencia de código: commit `16888b9b3d2bc35b56cb79f549a15060a523f797`. Los resultados de CI deben consultarse en GitHub para ese SHA; no confundir la ausencia de efectos con la funcionalidad positiva de traslado.

**Advertencia de alcance:** esto es una puerta negativa de seguridad, no la autorización correcta para la continuidad en B. La salida B2 del plan normativo exige una confirmación atómica real con cuenta estable, concesión consumida una vez, vinculación vigente de destino y bloqueo de cierre/reocupación. Continúa **NO-GO**.

## Compatibilidad de preflight H4 sin RPC H6 (31-10-2026)
La inspección SQL de identidad H4/H6 consultaba la firma opcional `read_order_operations_delivery_pickup_board_h6_candidate` con un cast directo `::regprocedure` y una llamada `has_function_privilege` por nombre. En bases H4 que todavía no tienen migración H6, la consulta podía abortar antes de comprobar las capacidades H4. Se sustituyó **solo** la resolución de esa función opcional por `to_regprocedure` y `COALESCE(...,false)`, preservando la comprobación estricta cuando `allowH6DeliveryBoard` está activado. Prueba unitaria de contrato SQL en `tests/order-operations-identity-preflight.test.mjs`. Commits `b3ca703`, `eca9b99`, `7af20b5`. No altera permisos, despliegues ni el bloqueo transaccional F12; **NO-GO**.
