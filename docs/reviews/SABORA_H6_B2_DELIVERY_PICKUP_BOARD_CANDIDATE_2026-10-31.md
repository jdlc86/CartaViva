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
