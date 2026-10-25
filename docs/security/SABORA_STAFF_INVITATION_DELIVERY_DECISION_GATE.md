# Hito 2 — decisión pendiente: entrega durable de invitaciones del personal

Estado: **gate de diseño, no aprobado ni activado**. Fecha: 2026-10-25.

## Fuente normativa y alcance

La regla de revocación desde el primer registro durable está en
`docs/architecture/SABORA_FUNCTIONAL_CONTRACT_CONSOLIDATED_V1.md`.
El documento `docs/security/SABORA_STAFF_IDENTITY_LIFECYCLE_V1.md`
establece que **no existe aún contrato aprobado** para la entrega de
invitaciones, WebAuthn, claves/login ni activación operativa. Este documento
no crea requisitos normativos nuevos; delimita qué falta resolver antes de
promover el borrador de `docs/security/sql-candidates/`.

## Frontera de atomicidad

Una transacción PostgreSQL puede registrar la intención y reclamar el trabajo
de entrega, pero **no puede hacer atómica una llamada externa de correo con
una revocación**. Un envío puede estar en vuelo cuando se revoca la cuenta.
Por tanto, no se debe prometer que un correo ya enviado o en vuelo desaparece.

La propiedad de seguridad comprobable debe basarse en la **invalidez del token
en servidor**: la aceptación y toda transición posterior deben volver a
comprobar el estado durable vigente. La revocación invalida ese token aunque
el proveedor entregue el mensaje después. El correo tardío no confiere acceso.

## Decisiones necesarias antes de activar el worker

1. **Material de entrega:** `staff_enrollments` solo conserva el hash del
   token. El futuro outbox debe definir cómo conservar temporalmente el
   material recuperable para reintentos sin introducir secretos en logs,
   auditoría, respuestas HTTP, trazas ni privilegios generales.
2. **Modelo de envío:** seleccionar proveedor y semántica de aceptación,
   resultado incierto, deduplicación, límites de intentos y retención.
3. **Reclamaciones:** especificar propietario del claim, vencimiento,
   fencing, reintentos después de caída y transición terminal.
4. **Autorización SQL:** definir identidad de login aislada, owner, RLS,
   privilegios mínimos y rutinas autorizadas. El esquema candidato actual
   no concede ningún permiso.
5. **Enlace transaccional:** insertar el evento de outbox en la misma
   transacción que `invite` o `resend`, sin permitir replays que creen
   nuevas entregas o tokens diferentes.
6. **Pruebas de aceptación:** PostgreSQL 17 desechable con carreras
   `revoke↔claim`, `resend↔claim`, dos workers, pérdida de respuesta
   del proveedor, replay y reinicio del worker; comprobar que una aceptación
   tardía siempre se deniega.

## Estado del código

`staff-invitation-delivery-policy.mjs` es una política auxiliar.
`staff-invitation-claim-candidate.mjs` y
`staff-invitation-outbox-repository-candidate.mjs` son candidatos no montados.
El SQL en `docs/security/sql-candidates/` es un borrador no ejecutado en
PostgreSQL 17 y **no pertenece a las migraciones operativas**.

**Gate:** no mover el SQL a `supabase/migrations`, no montar el worker,
no entregar secretos ni desplegar hasta aprobar explícitamente las decisiones
anteriores y verificar las pruebas. Ningún recurso de Fleetia ni del VPS
compartido forma parte de este trabajo.
