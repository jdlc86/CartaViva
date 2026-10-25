# Hito 2 — decisión pendiente: entrega durable de invitaciones del personal

Estado: **esquema candidato validado en PG17; gate operativo no aprobado ni
activado**. Fecha: 2026-10-25.

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
   tardía siempre se deniega. La matriz de esquema/transacciones ya cubre los
   cinco primeros riesgos salvo el reinicio/lease de un worker, que continúa
   pendiente porque no existe protocolo de expiración de claims.

## Estado del código

`staff-invitation-delivery-policy.mjs` es una política auxiliar.
`staff-invitation-claim-candidate.mjs` y
`staff-invitation-outbox-repository-candidate.mjs` son candidatos no montados.
El SQL en `docs/security/sql-candidates/` se ejecuta ahora únicamente desde el
harness desechable `staff-invitation-outbox-postgres17.test.mjs`; **no pertenece
a las migraciones operativas**. El harness usa conexiones reales y está
integrado en los dos workflows, pero no crea una identidad runtime ni concede
permisos positivos.

## Evidencia PostgreSQL 17 y correcciones

La primera ejecución real pasó 5/8 y demostró tres incoherencias: intentos no
ligados al estado, `updated_at` obsoleto después del claim y contador de intentos
sin incrementar al autorizar dispatch. Se corrigieron en el esquema y en el
adaptador SQL. También se endurecieron el fence parcial de `cancelled` y el
orden de timestamps.

La repetición local pasó 8/8: constraints/RLS, transición completa, fence
obsoleto, dos claimers, revocación, reenvío, unicidad/replay, resultado ambiguo
y aceptación tardía del proveedor sin reactivación. La regresión general pasó
830/830 y la focalizada 48/48. La evidencia reproducible y los límites están en
`sql-candidates/README_PG17_VERIFICATION.md`.

**Gate:** no mover el SQL a `supabase/migrations`, no montar el worker, no
entregar secretos ni desplegar hasta aprobar explícitamente las decisiones
anteriores. La validación del esquema no resuelve material cifrado, enqueue
atómico, proveedor, identidad SQL, lease/reclaim ni retención. Ningún recurso
de Fleetia ni del VPS compartido forma parte de este trabajo.

## Candidato de encolado transaccional (25-10-2026)

Se añadió `apps/api/src/staff-invitation-enqueue-candidate.mjs` con
`transitionAndEnqueue`: recibe un `withTransaction` inyectado, ejecuta la
transición durable y después inserta una sola intención de entrega en la misma
transacción. El SQL comprueba `enrollment_id`, estado `invited`, versión y
hash vigentes; `ON CONFLICT` no puede convertir una colisión en éxito.
Un replay de la transición no vuelve a insertar. Si falla el INSERT, la
operación arroja error para forzar rollback de la transacción completa.
Las pruebas unitarias están en
`tests/staff-invitation-enqueue-candidate.test.mjs`.

**Alcance deliberado:** candidato aislado y sin material recuperable; no se
ha conectado al coordinador operativo ni al worker. Las pruebas con
transacciones inyectadas **no demuestran todavía** el encolado en PG17 con
el principal SQL de mínimo privilegio. El owner actual del wrapper
`SECURITY DEFINER` no confiere al caller permiso para INSERT directo
en la tabla outbox. Antes de cualquier promoción será necesaria una
rutina SQL autorizada y una prueba PG17 de rollback, reenvío y replay
sobre la misma transacción y con el principal restringido.
No hay autorización para crear permisos runtime, enviar correo ni desplegar.

## Evidencia adicional de encolado PG17 desechable (25-10-2026)

El commit `a45f1a2` amplía el harness PostgreSQL 17 con tres casos:
confirmación de versión/hash al encolar, rollback de la rotación ante colisión
de clave primaria en outbox y denegación de INSERT directo al login no
privilegiado. Ambos workflows del commit terminaron en SUCCESS.

**Límite preciso:** estas pruebas utilizan una transición SQL de prueba
inyectada en el coordinador de encolado, ejecutada con el principal
administrador **exclusivamente en el contenedor desechable**. No prueban
todavía el wrapper HMAC de ciclo de vida y la inserción con un mismo login
runtime restringido: el esquema de outbox no concede esos permisos.
No presentar esta evidencia como validación de identidad SQL operativa,
ni promover a migraciones o activar la entrega hasta resolver el gate.
