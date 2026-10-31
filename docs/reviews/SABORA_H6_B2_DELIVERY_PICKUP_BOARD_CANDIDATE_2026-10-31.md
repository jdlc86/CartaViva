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
