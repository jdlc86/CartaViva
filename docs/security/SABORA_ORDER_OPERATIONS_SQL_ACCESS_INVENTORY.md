# Inventario de acceso SQL para cocina y sala — revisión sin GRANT

Estado: **candidato para revisión, NO autorizado para ejecución en Supabase ni despliegue**.
Fecha: 2026-10-24. Un solo restaurante Sabora.

Este inventario se deriva exclusivamente de las consultas de
`apps/api/src/order-operations-repository.mjs`, la función
`transition_order_line_idempotent_candidate` en
`supabase/migrations/20261023225024_sabora_kitchen_waiter_operations_candidate.sql`
y la puerta `docs/architecture/SABORA_KITCHEN_WAITER_OPERATIONS_GATE.md`.
No crea roles, políticas ni permisos.

## Identidades y operaciones

- **Lector de personal**: autenticación/verificación de membresía. Identidad
  distinta de la identidad SQL operativa, con preflight `current_user` y
  `session_user`.
- **Operador cocina/sala**: consultas y transiciones en transacción con
  membresía activa revalidada. Su rol SQL no representa por sí solo el rol
  funcional cocina/camarero; ese dato proviene de identidad verificada y se
  comprueba nuevamente bajo bloqueo en la base de datos.
- **Cliente web, anon, authenticated, PUBLIC**: sin acceso directo a los
  recursos operativos privados ni a la función candidata.

## Recursos exactos observados

| Recurso | Uso en código | Riesgo/condición previa a cualquier GRANT |
| --- | --- | --- |
| `sabora.staff_members` | SELECT `user_id,role,state` con `FOR SHARE`; JOIN para rol del autor de eventos | El SELECT debe poder bloquear filas sin conceder modificación de membresía; revisar RLS y rol lector separado |
| `sabora.order_lines` | SELECT tablero e historial; función invoker: SELECT FOR UPDATE y UPDATE `status` | Aislar actualización de estado de otras columnas; política RLS y transición autorizada en misma transacción |
| `sabora.orders` | JOIN para id, mesa, etiqueta y fecha de confirmación | Proyección mínima; prohibir acceso a datos privados no usados |
| `sabora.dining_tables` | JOIN para número de mesa | No autorizar mutaciones de QR/mesas por este flujo |
| `sabora.pickup_notifications` | LEFT JOIN de aviso; función invoker INSERT al quedar listo y UPDATE de acuse al recoger | Vincular la mutación a transición y actor autorizados; sin escritura general |
| `sabora.order_line_events` | SELECT historial; función invoker INSERT append-only | Triggers existentes impiden UPDATE/DELETE/TRUNCATE; revisar RLS de lectura/escritura |
| `sabora.order_line_transition_requests` | Función invoker SELECT FOR UPDATE e INSERT de correlación durable | FORCE RLS, clave por actor; nunca conceder UPDATE/DELETE/TRUNCATE |
| `sabora.transition_order_line_idempotent_candidate(uuid,uuid,text,text)` | EXECUTE invoker para transición | El EXECUTE por sí solo no sustituye los permisos sobre tablas ni la revalidación del actor |

## Puerta de aceptación pendiente

1. Diseñar las políticas RLS de cada tabla y permisos por columna, comprobando
   también secuencias, dependencias y funciones invocadas por triggers.
2. Ensayar en PostgreSQL 17 **desechable** las operaciones positivas de cocina
   y camarero con el LOGIN técnico no propietario, NOINHERIT, sin membresías,
   NOSUPERUSER y NOBYPASSRLS.
3. Ensayar negativos: rol revocado, transición no permitida, lectura de datos
   fuera del tablero, UPDATE de columnas ajenas, DELETE/TRUNCATE, EXECUTE por
   anon/authenticated/PUBLIC, replay con fingerprint distinto y revocación
   concurrente.
4. Comprobar con `current_user` y `session_user` la identidad real de cada
   conexión antes de activar el bootstrap HTTP. No confundir la prueba
   temporal de identidades sin GRANT con autorización de acceso.
5. Documentar aprobación explícita del contrato SQL y del montaje. Mantener
   `server.mjs` sin registrar operaciones hasta completar esa puerta.

Ninguna concesión se considera aprobada por este documento. No se modifica
Fleetia, el VPS ni la base de datos operativa.
