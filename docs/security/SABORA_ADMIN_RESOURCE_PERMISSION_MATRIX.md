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
