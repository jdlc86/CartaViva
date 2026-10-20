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

## Referencia verificada en Fleetia (solo lectura)
Consultados `docs/04_ACCESS_SECURITY_CONTRACT.md`, `docs/01_PRODUCT_CONTRACT.md` y `packages/database/migrations/20261002170000_f1_manager_ownership_request_semantics.sql` de `jdlc86/GestionIntegral_Rutaa` en commit `7c7f3b50087685488185ce0bbc8b2150c62aaee7`. En Fleetia la titularidad es independiente del rol, la solicitud la decide el titular, la oferta la acepta el destinatario, la transferencia aceptada es atómica, hay auditoría/notificaciones y se bloquea concurrentemente con advisory lock y fila FOR UPDATE. **Diferencia intencionada:** Fleetia concede escritura de gestor a EMPLEADO_GESTOR y permite reasignación forzosa a ROOT/ADMIN; Sabora concede la titularidad exclusivamente a un ADMIN y reserva la reasignación forzosa a ROOT, según la decisión de este proyecto. No se modificó Fleetia.

## Primer módulo de autorización aislado
`apps/api/src/admin-write-gate.mjs` comprueba el titular actual mediante callback durable inyectado por cada petición: ADMIN no titular => 403, falta/error de lectura => 503, ROOT => autoridad diferenciada, operativos => 403. Pruebas offline en `tests/admin-write-gate.test.mjs` cubren cambio de titular entre solicitudes, fallo de DB, UUID y ROOT. **Todavía no está conectado al JWT, a las rutas, a la DB ni al flujo transaccional de titularidad**. El código actual de `staff-authorization.mjs` aún no reconoce ROOT, por lo que ROOT no puede acceder operativamente a través de él. La autorización de una escritura real también deberá ejecutarse en la misma transacción o con un bloqueo que impida TOCTOU entre la comprobación y la mutación. CI del nuevo bloque pendiente.
