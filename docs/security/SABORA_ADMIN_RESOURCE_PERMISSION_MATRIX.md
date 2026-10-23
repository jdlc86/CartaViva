# Matriz de recursos y permisos administrativos — Sabora

Estado: **inventario para revisión; ningún GRANT autorizado**. Derivada de migraciones `20261020140000` a `20261020270000`, `transactional-admin-write.mjs`, `ownership-workflow.mjs` y contratos de seguridad. Una instalación = un restaurante.

| Recurso SQL | Lectura necesaria | Mutación prevista | Autoridad de negocio | Estado de concesión |
| --- | --- | --- | --- | --- |
| `sabora.staff_members` | `user_id, role, state` para revalidar actor y destinatario | Altas, activación y cambios de personal: contrato específico pendiente | ADMIN titular; protección ROOT | **Bloqueado**; lector técnico separado ya existente |
| `sabora.admin_write_ownership` | `owner_user_id` con bloqueo `FOR UPDATE` | Transferir propietario; `assigned_at` | Workflow de cesión; ROOT forzosa auditada | **Bloqueado** |
| `sabora.admin_ownership_proposals` | Propuesta, participantes, estado, correlación | Solicitud, oferta, aceptación, rechazo y cancelación | Actores y transiciones del workflow | **Bloqueado** |
| `sabora.admin_ownership_audit` | Correlación y payload para replay | Solo `INSERT` append-only; nunca UPDATE/DELETE/TRUNCATE | Workflow autorizado en misma transacción | **Bloqueado** |
| `sabora.restaurant_settings` | Nombre y singleton | Ajustes generales del restaurante | ADMIN titular | **Pendiente de contrato funcional** |
| `sabora.dining_tables` | Número, capacidad, QR, sesión, ventana de agrupación | Crear/editar mesas; rotar QR por procedimiento específico | ADMIN titular para configuración; operación QR pendiente de delimitar | **Pendiente de contrato funcional** |
| `sabora.orders`, `sabora.order_idempotency` | Pedidos e idempotencia | Confirmación de pedidos y estados por flujo de negocio, no por writer administrativo genérico | Cliente, cocina, camarero según operación | **Fuera de GRANT administrativo genérico** |
| `sabora.order_lines` y demás recursos de cocina/recogida | Según operaciones de cocina/camarero | Transiciones por procedimientos dedicados | Cocina/camarero según flujo | **Fuera de GRANT administrativo genérico** |

## Restricciones transversales

1. **No confundir SQL con autorización de negocio:** un GRANT a una identidad técnica compartida no demuestra qué ADMIN hizo la petición. El backend debe verificar identidad y revalidar el titular en la misma transacción.
2. No habilitar un writer con `UPDATE` indiscriminado en todas las tablas. Separar gobierno ROOT, configuración administrativa y operaciones de cocina/camarero.
3. El rol `sabora_admin_writer` sigue NOLOGIN/NOINHERIT/NOBYPASSRLS y sin USAGE ni grants; no existe un LOGIN operativo autorizado.
4. Para cada recurso falta concretar columnas, funciones, políticas RLS, owner SQL, operación HTTP, auditoría y pruebas positivas/negativas con identidad de mínimos privilegios.
5. La lectura de `staff_members` por `sabora_staff_reader` **no** autoriza mutaciones administrativas. Los procedimientos de gobierno requieren una estrategia separada de acceso a los datos bajo RLS, aún no aprobada.
6. Las funciones existentes de pedidos/QR/estados no son un permiso para otorgar EXECUTE al writer administrativo; cada operación exige su propio límite.

## Puerta para pasar de matriz a implementación

Aprobar por operación una ficha verificable con actor permitido, tablas y columnas, función o consulta, locks, RLS, grants, auditoría, respuesta idempotente y pruebas de denegación. Solo entonces implementar roles técnicos y rutas HTTP. No aplicar migraciones operativas ni desplegar por esta matriz.

## Ficha de preautorización: ajustes generales (solo diseño)

La primera operación candidata a un futuro contrato de permisos mínimos es **modificar el nombre del restaurante** en `sabora.restaurant_settings`. Esta ficha **no habilita** esa operación y no constituye autorización para crear un endpoint ni conceder privilegios.

| Elemento | Límite propuesto para revisión |
| --- | --- |
| Identidad de usuario | Sesión autenticada y validada por backend; prohibido confiar en `actorUserId` enviado por cliente |
| Autoridad | `staff_members.role = 'admin'`, `state = 'active'` y `admin_write_ownership.owner_user_id` coincidente, comprobados en transacción |
| Orden de bloqueo | Primero singleton de ownership con `FOR UPDATE`; después fila durable de actor con `FOR UPDATE` |
| Objeto y columnas | `restaurant_settings`: lectura mínima de clave del singleton y `name`; actualización exclusiva de `name` |
| Identidad SQL | Futuro principal técnico sin BYPASSRLS ni propiedad de tablas; `sabora_admin_writer` permanece dormido |
| RLS | Requiere una política concreta que restrinja la fila y la operación; **no basta** el GRANT SQL |
| Auditoría | Especificar antes de implementar evento, actor verificado, correlación, antes/después y persistencia atómica |
| Reintentos | Definir correlación, idempotencia y comportamiento ante COMMIT incierto antes de exposición HTTP |
| Pruebas positivas | ADMIN titular activo modifica solo `name`; transacción y auditoría atómicas bajo rol no propietario |
| Pruebas negativas | ROOT, ADMIN no titular, ADMIN suspendido, identidades de cocina/camarero y cliente; SQL directo fuera de operación; columnas distintas a `name` |
| Puerta pendiente | Diseño aprobado de RLS, auditoría, contrato HTTP, conexión SQL y bootstrap/recuperación de ROOT |

El uso de `restaurant_settings` como primera candidata no implica que la tabla ya tenga una clave singleton apropiada, política RLS específica o columnas de auditoría; esos elementos deben comprobarse contra el esquema y migraciones antes de cualquier implementación.

## Cotejo de esquema: `restaurant_settings` (2026-10-21)

La migración `20261020140000_sabora_order_core.sql` confirma que el recurso **sí** tiene un singleton booleano `singleton` como clave primaria, con `DEFAULT true` y `CHECK(singleton)`. Las columnas actuales son `singleton`, `name` y `created_at`; el nombre exige texto no nulo con longitud `btrim(name)` entre 1 y 160 caracteres. La tabla tiene RLS habilitada y `FORCE ROW LEVEL SECURITY`, pero esa configuración **no equivale** a una política que permita actualizarla al writer.

Consecuencias para la futura operación:

- El predicado SQL debe identificar explícitamente `WHERE singleton = true`; la única columna mutable prevista es `name`, sin modificar `singleton` ni `created_at`.
- Validar y normalizar el nombre antes de iniciar la transacción; el `CHECK` de base de datos sigue siendo la defensa final.
- Antes de cualquier concesión, crear y probar una política RLS restringida y una estrategia de auditoría atómica; actualmente no existe autorización para abrir el acceso.
- Comprobar por separado que el singleton exista: una clave primaria booleana restringida a `true` garantiza **como máximo una fila**, pero no garantiza **que exista** una fila.
- Evitar otorgar permisos de tabla completos: cualquier futura concesión debe justificarse por columna y operación, y verificarse con una identidad SQL no propietaria en PostgreSQL desechable.

Esta verificación documental no introduce una migración ni modifica el esquema operativo.

## Ficha candidata: preparación y recogida por línea (2026-10-24)

La migración candidata `20261023225024_sabora_kitchen_waiter_operations_candidate.sql`
y los módulos `order-operations-*` implementan y prueban el circuito
`confirmed -> preparing -> ready -> picked_up`. Esta ficha **no concede grants
ni activa rutas**.

| Elemento | Límite implementado |
| --- | --- |
| Identidad de usuario | Sujeto JWT verificado y membresía persistente coincidente; actor y rol del navegador se rechazan |
| Autoridad | Cocina inicia/finaliza preparación; camarero confirma recogida; ADMIN puede ejecutar las tres transiciones |
| Transacción | Revalidación de membresía, lock de línea, estado, aviso, evento y correlación comparten transacción |
| Reintentos | Clave por actor y correlación; replay idéntico y conflicto ante parámetros distintos |
| Auditoría | `order_line_events` y resultados de correlación append-only |
| SQL directo | Función `SECURITY INVOKER`; sin permisos para `PUBLIC`, `anon` ni `authenticated` |
| Datos expuestos | Proyección operativa mínima; el historial devuelve rol, no identificador privado del actor |
| Exclusiones | Sin entrega, cancelación, arbitraje, ajuste económico ni polling |
| Puerta pendiente | Login técnico, RLS permisiva mínima, grants, preflight de identidad efectiva y bootstrap HTTP/PWA aprobados |

La autorización de negocio implementada no convierte el pool del servidor en
una identidad SQL autorizada. Hasta cerrar la puerta pendiente, la composición
permanece opt-in y fuera de `server.mjs`.
