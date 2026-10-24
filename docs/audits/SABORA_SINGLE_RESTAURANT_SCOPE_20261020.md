# Auditoría de alcance — restaurante único

Fecha: 2026-10-20. Decisión expresa del propietario: **Sabora opera un solo restaurante**.

## Fuera de alcance, retirado del prototipo de la PR #2

- Colección de restaurantes `sabora.restaurants` y tabla de membresías `restaurant_members`.
- Clave `restaurant_id` en mesas, órdenes, idempotencia, eventos, líneas, avisos y RPC.
- Selección de establecimiento, comprobaciones cruzadas entre restaurantes y rutas multi-tenant.
- Matriz de pruebas de aislamiento entre restaurantes, sustituida por pruebas de privacidad de cuentas, roles, integridad de mesas y credenciales QR.

## Modelo resultante

- `restaurant_settings`: fila singleton con nombre y configuración global.
- `staff_members`: permisos de administrador, cocina y camarero, sin selector de restaurante.
- `dining_tables`, `orders`, `order_idempotency`, `order_lines`, `pickup_notifications` y auditoría: relaciones directas, sin claves de tenant.
- Se mantienen `FORCE RLS`, revocaciones de acceso público, control de roles, pruebas transaccionales e idempotencia.
- El aislamiento de infraestructura respecto a Fleetia y otros proyectos **no cambia**.

## Revisión de alcance restante

Las capacidades de mesa, visita, carta, cesta, cocina, camarero, cobros, propinas, incidencias, notificaciones y dashboard pertenecen al único restaurante y **siguen dentro del alcance** según el contrato consolidado. No se eliminan por estar pendientes de implementación.

No se añade franquicia, gestión de sucursales, onboarding de establecimientos, cambio de tenant, facturación SaaS por restaurante ni consola global.

## Riesgos y puertas

- El refactor sustituye migraciones de **borrador no aplicadas**; no es una migración sobre datos operativos.
- Las RPC siguen sin autenticación de principal verificado y sin concesiones a roles de cliente; no son aptas para producción.
- Se exige CI verde, PostgreSQL 17 desechable, revisión de esquema y pruebas de autorización antes de continuar.
- No se despliega en Supabase ni VPS sin autorización expresa y aislamiento completo. No tocar Fleetia.
