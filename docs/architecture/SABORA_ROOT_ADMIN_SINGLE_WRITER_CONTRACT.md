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
Decisión de negocio confirmada. Las migraciones draft `20261020210000`–`20261020240000`, el workflow interno y los smokes PostgreSQL 17 implementan la titularidad ADMIN singleton, las cesiones, la revalidación durable, la auditoría append-only y la reasignación forzosa de ROOT hacia un ADMIN activo. ROOT no es elegible como titular y no puede usar el límite de escritura administrativa ordinaria. La existencia inicial de exactamente un ROOT, la identidad SQL mínima del writer, las notificaciones y las rutas administrativas siguen pendientes; por ello el runtime HTTP permanece cerrado. No ejecutar migraciones operativas, crear ROOT real, desplegar ni fusionar sin autorización.

## Referencia verificada en Fleetia (solo lectura)
Consultados `docs/04_ACCESS_SECURITY_CONTRACT.md`, `docs/01_PRODUCT_CONTRACT.md` y `packages/database/migrations/20261002170000_f1_manager_ownership_request_semantics.sql` de `jdlc86/GestionIntegral_Rutaa` en commit `7c7f3b50087685488185ce0bbc8b2150c62aaee7`. En Fleetia la titularidad es independiente del rol, la solicitud la decide el titular, la oferta la acepta el destinatario, la transferencia aceptada es atómica, hay auditoría/notificaciones y se bloquea concurrentemente con advisory lock y fila FOR UPDATE. **Diferencia intencionada:** Fleetia concede escritura de gestor a EMPLEADO_GESTOR y permite reasignación forzosa a ROOT/ADMIN; Sabora concede la titularidad exclusivamente a un ADMIN y reserva la reasignación forzosa a ROOT, según la decisión de este proyecto. No se modificó Fleetia.

## Límite único de autorización de escritura
El antiguo `admin-write-gate.mjs` se retiró: su consulta separada no podía impedir un TOCTOU entre autorización y mutación, y un precheck permisivo podía reutilizarse erróneamente como control final. El único límite admitido es `transactional-admin-write.mjs`, que bloquea singleton, revalida al ADMIN activo y ejecuta la mutación en la misma transacción. **No está conectado todavía a rutas HTTP ni a una identidad SQL operativa**. `staff-authorization.mjs` reconoce ROOT activo para el plano de gobierno, pero ROOT solo puede usar `ownership-workflow.mjs` para reasignar forzosamente a un ADMIN activo con motivo y auditoría.
