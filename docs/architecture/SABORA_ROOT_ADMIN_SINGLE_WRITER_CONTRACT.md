# Sabora — ROOT y titularidad administrativa única (decisión 2026-10-20)

## Contrato confirmado
- Una instalación Sabora = un restaurante = exactamente un ROOT; no es un ROOT global de CartaViva.
- Pueden existir múltiples ADMIN; como máximo uno posee la titularidad de escritura administrativa vigente.
- Los ADMIN restantes solo tienen lectura administrativa autorizada. Las operaciones de camarero y cocina mantienen sus permisos independientes.
- ROOT es la autoridad superior y puede asignar, retirar y recuperar titularidad. Ningún ADMIN puede alterar ROOT.

## Referencia Fleetia
Revisar en modo exclusivamente lectura el mecanismo de Fleetia: reasignación forzosa, solicitud, oferta, aceptación, rechazo, cancelación, auditoría y concurrencia. No copiar automáticamente código o contratos ni modificar recursos Fleetia.

## Invariantes de implementación
1. Comprobar identidad, rol, estado activo y titularidad durable en el servidor en cada mutación administrativa; ocultar botones no basta.
2. Transiciones atómicas, con protección contra dos escritores concurrentes y pruebas PostgreSQL 17 desechables.
3. Auditoría append-only de actor, operación, resultado y correlación, sin secretos.
4. ROOT único protegido frente a eliminación, suspensión, revocación y degradación; recuperación excepcional explícita.
5. Titularidad ADMIN no confiere privilegios ROOT; ADMIN sin titularidad conserva lectura permitida.
6. No autorizar escritura por un JWT obsoleto o estado local del navegador.

## Estado y siguiente puerta
Decisión de negocio confirmada; NO implementada todavía en migraciones y hooks existentes, que actualmente solo conocen admin, waiter y kitchen. Revisar documentación de Fleetia antes de diseñar esquema, transacciones, rutas y pruebas. No ejecutar migraciones operativas, crear ROOT real, desplegar ni fusionar sin autorización.
