# ROOT y titularidad ADMIN — especificación transaccional previa a migración

Estado: diseño de implementación, no esquema aplicado. Fuente: contrato `SABORA_ROOT_ADMIN_SINGLE_WRITER_CONTRACT.md` y mecanismo Fleetia revisado en solo lectura.

## Invariantes y modelo propuesto
- La identidad ROOT es una sola por instalación. Se debe proteger su continuidad incluso bajo transacciones concurrentes; no basta un `count(*)` previo a la baja. La instalación inicial y la recuperación excepcional son procedimientos separados y auditados.
- Titularidad ADMIN: fila singleton durable que referencia un miembro `admin` activo. Puede estar sin asignar durante bootstrap o recuperación controlada; jamás dos titulares simultáneos.
- Solicitud: ADMIN activo no titular solicita la titularidad vigente; el titular decide. Oferta: titular propone a otro ADMIN activo, quien decide. Rechazo/cancelación no cambian propietario.
- Reasignación forzosa: únicamente ROOT, con motivo obligatorio, identidad revalidada y auditoría.
- Las transiciones deben actualizar titular, estado de solicitud, notificaciones y auditoría en una transacción.
- El lock de la fila singleton (y la protección de la elegibilidad de miembros) debe cubrir la **mutación administrativa**, no solo la consulta de titularidad; de lo contrario existe carrera entre autorización y escritura.
- Una baja/suspensión/cambio de rol de un titular requiere transferencia o retirada coordinada bajo el mismo mecanismo de bloqueo.
- Los privilegios SQL del runtime no pueden permitir escrituras directas a la tabla singleton o saltarse los procedimientos. La función de cambio no debe confiar en IDs de actor proporcionados por cliente.
- La auditoría debe ser append-only y correlacionada; no usar claims editables del cliente para autorizar.

## Matriz de pruebas obligatorias en PostgreSQL 17 desechable
1. Bootstrap con un ROOT y bloqueo de segundo ROOT; protección de último ROOT ante suspender, revocar, degradar y borrar.
2. Alta de múltiples ADMIN y asignación única; comprobar que ADMIN sin titularidad solo lee.
3. Dos aceptaciones concurrentes de transferencias distintas; exactamente una transición válida y sin doble titular.
4. Transferencia simultánea con revocación o degradación del destinatario; no terminar con titular inelegible.
5. Solicitud, oferta, aceptación, rechazo, cancelación, reasignación forzosa ROOT, intentos forzosos de ADMIN.
6. Revocación del titular durante mutación administrativa: operación se serializa correctamente y revalida la titularidad.
7. Repetición de correlation ID e idempotencia; no duplicar auditoría o notificaciones.
8. Verificación de RLS, ACL, denegación a anon/authenticated y al lector técnico; no fuga de secretos.

## Puertas
La base actual solo conoce roles `admin`, `waiter`, `kitchen`. Antes de escribir una migración real hay que verificar el DDL original de `staff_members`, funciones, auditoría y el orden de migraciones para evitar romper el smoke existente. No introducir migración de forma especulativa ni ejecutar contra Supabase operativo. Una vez validado el esquema, implementar SQL y añadir pruebas de concurrencia a CI.

## Hallazgo de implementación — orden de bloqueos
La primera migración introduce un trigger de cambios de staff que adquiere el singleton y otro trigger de titularidad que consulta staff. El orden de bloqueo puede invertirse entre UPDATE de staff y UPDATE del titular, generando deadlocks. **No se considera superada la puerta de concurrencia**. Antes de incorporar rutas o transiciones, se debe fijar un orden de locks único y probar dos conexiones simultáneas con transacciones REPEATABLE READ/READ COMMITTED; los deadlocks no deben confundirse con una garantía de serialización. Además, la unicidad parcial ROOT solo asegura como máximo uno, y la existencia inicial debe provisionarse con procedimiento separado.

## Corrección inicial de orden de bloqueo (commit 07bd1ae)
El trigger de staff se ha dividido en BEFORE STATEMENT, que adquiere primero el bloqueo de la fila singleton, y BEFORE ROW, que valida ROOT/titular después. De este modo una actualización ordinaria de staff no bloquea primero una fila de empleado y luego la titularidad, evitando la inversión identificada. **Limitación importante:** la solución debe someterse a pruebas de dos sesiones simultáneas y a revisión de los caminos que actualicen staff desde otros triggers o funciones; no equivale a certificación de ausencia de deadlocks. No se autoriza despliegue ni activación de rutas administrativas.

## Puerta de validación Codex Desktop (2026-10-20)
- Orden efectivo del workflow: singleton `FOR UPDATE`, lectura no bloqueante de propuesta para descubrir todos los UUID, filas de staff ordenadas por UUID `FOR UPDATE` y relectura de propuesta `FOR UPDATE`. Los cambios de staff adquieren el singleton en `BEFORE STATEMENT`.
- `scripts/ci/admin-ownership-lifecycle-smoke.sh` prueba el ciclo request/offer/accept/reject/cancel/force, igualdad semántica JSONB, parámetros alterados, rollback tras fallo intermedio y dos conexiones que compiten desde el mismo titular observado. `admin-ownership-concurrency-smoke.sh` conserva la carrera transferencia/suspensión.
- La auditoría persiste `result` y `result_payload`; los reintentos equivalentes devuelven el resultado anterior y los reintentos alterados fallan. UPDATE, DELETE y TRUNCATE están bloqueados por triggers.
- La migración de hardening exige que cualquier fila ROOT sea activa e impide promociones ordinarias hacia ROOT. La unicidad parcial sigue garantizando **como máximo uno**; bootstrap/recuperación que garantice existencia, identidad verificada y auditoría permanece como procedimiento separado pendiente.
- No se crea un writer SQL operativo ni políticas de escritura amplias: hacerlo sin el contrato de credenciales y rutas convertiría una migración de seguridad en una vía directa de bypass. Hasta resolverlo, no conectar endpoints ni aplicar estas migraciones a Supabase operativo.
