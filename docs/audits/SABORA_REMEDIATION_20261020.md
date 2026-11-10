# Remediación de auditoría — bloque de contención contractual

Estado: cambios publicados en PR #2; pendientes de validación CI y de implementación funcional completa.

## Correcciones aplicadas al prototipo

1. **Cocina y cancelación (A-03):** se deshabilita la transición directa de una orden completa a `cancelled` para cualquier rol. Una incidencia de cocina requiere expediente y arbitraje administrativo, y la cancelación real debe afectar solo las unidades procedentes y ajustar la economía. Estos flujos aún no están implementados; la operación se bloquea, no se simula.
2. **Recogida de sala (A-04):** se deshabilita `ready → delivered` sobre la orden completa. La recogida y entrega por plato/unidad, con notificaciones de camarero, queda pendiente de implementación. No se interpreta la desaparición de una alerta como entrega.
3. **Rotación QR (A-06):** renovar el QR revoca la credencial anterior, **sin reiniciar la visita, los participantes ni el plazo de agrupación**. La rotación no equivale a abrir/cerrar mesa.
4. Se actualizan pruebas de dominio y smoke PostgreSQL para verificar estas prohibiciones y continuidad de la visita.

## Hallazgos todavía abiertos

**P0:** autenticación real, principal verificado, permisos por cuenta y tenant; pagos, revisiones y despacho con acuse verificable.

**P1:** modelo de pedido/revisión/despacho, estados por ítem/unidad, expediente de incidencias y arbitraje, ajuste económico parcial, apertura/pausa/cierre de visita, cuentas y permiso temporal QR, ventana de agrupación con vencimiento diferido.

**P2:** catálogo versionado, extras/alérgenos/precios/descuentos, notificaciones duraderas y sincronización sin polling, aplicaciones funcionales, Stripe, dashboard, matriz E2E.

La migración `20261020170000` y el motor en memoria **son PoC**; no deben exponerse a usuarios. Las pruebas verdes no prueban la matriz normativa completa.

## Regla de despliegue

Ningún cambio a Supabase operativo o VPS sin autorización expresa. Fleetia y cualquier otro proyecto del VPS quedan completamente fuera del alcance.

## Segundo bloque: líneas, avisos y recogida (prototipo SQL)

- Migración `20261020180000_sabora_order_lines_pickup.sql`: materializa cada línea con ID, orden y número estable; crea líneas para órdenes existentes y nuevas mediante trigger transaccional.
- La cocina puede pasar una línea de `confirmed → preparing → ready`; el paso a `ready` genera una notificación pendiente, vinculada a la línea.
- El camarero puede reconocer la recogida de una línea lista (`ready → picked_up`), archivando la notificación sin eliminar su historial. La recogida **no significa entrega al comensal**, y no modifica el estado de toda la comanda.
- Transiciones serializadas por fila, comprobación de rol y restaurante, eventos de auditoría por línea, RLS FORCE y revocación de RPC para clientes.
- Pruebas estáticas y PostgreSQL desechable para permisos, transición incorrecta, duplicación, persistencia y separación de orden/línea.

**Limitación obligatoria:** este es un PoC interno, no implementa autorización de principal verificado, acuse real de despacho a cocina, revisión vigente, sincronización push, incidencias/cancelación por unidades ni economía. No publicar endpoints ni conceder permisos RPC hasta cerrar A-01/A-02.
