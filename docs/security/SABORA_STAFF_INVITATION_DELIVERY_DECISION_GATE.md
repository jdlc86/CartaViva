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
4. **Autorización SQL:** el candidato define owner sellado, RLS y una única
   rutina integrada; el login positivo se crea y recibe `EXECUTE` solo en el
   contenedor de aceptación. El aprovisionamiento operativo continúa sin
   aprobar y no forma parte del SQL candidato.
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
a las migraciones operativas**. El harness usa conexiones reales y crea un
login efímero positivo para la aceptación, pero el esquema candidato no crea
ningún LOGIN ni concede `EXECUTE` runtime persistente.

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
anteriores. La validación ya resuelve como candidato el enqueue atómico y la
superficie SQL mínima, pero no resuelve material cifrado, aprovisionamiento de
credenciales, proveedor, lease/reclaim ni retención. Ningún recurso de Fleetia
ni del VPS compartido forma parte de este trabajo.

## Encolado transaccional con principal restringido (25-10-2026)

El commit `1021380` sustituye el prototipo con transición inyectada. La rutina
`transition_staff_lifecycle_with_outbox_candidate` ejecuta el wrapper HMAC
existente y la mutación de outbox dentro de **una sola sentencia y transacción
PostgreSQL**. Una invitación nueva inserta una intención; un reenvío cancela
trabajos `pending`/`claimed` obsoletos y crea la versión vigente; aceptación o
revocación cancelan trabajo todavía no despachado. Una colisión al insertar
revierte también versión/hash, cancelaciones, ledger y auditoría.

La rutina pertenece a `sabora_staff_invitation_enqueue_fn_owner`, rol
`NOLOGIN`, `NOINHERIT`, sin `BYPASSRLS`, membresías ni DDL. Solo puede ejecutar
el wrapper HMAC interno y leer/insertar/actualizar las columnas estrictamente
necesarias de outbox mediante tres políticas RLS. No puede borrar, truncar,
despachar ni leer las tablas del ciclo directamente.

El test crea `sabora_ci_staff_invitation_runtime` como login real sin
privilegios, le concede únicamente `USAGE` del esquema y `EXECUTE` de la rutina
integrada, y demuestra que no puede acceder directamente a tablas, keyring,
secuencias, wrapper interno, DDL ni `SET ROLE`. Todas las mutaciones de
aceptación de este bloque corren con ese login; `postgres` se limita a fixtures
e inspección.

La matriz final PostgreSQL 17 pasa 15/15: commit y replay, dos invocaciones
concurrentes de la misma capacidad, reenvío de un claim, rollback recuperable,
aceptación, revocación concurrente y la matriz previa de fencing/proveedor. La
regresión local pasa 842/842, las pruebas focalizadas 60/60 y el build API es
correcto. La primera ejecución del nuevo bloque pasó 14/15: la única corrección
fue actualizar una expectativa antigua de cero políticas para reconocer las
tres políticas internas del owner sellado, manteniendo cero grants del login.

**Límite preciso:** esta evidencia valida la arquitectura candidata, no una
identidad operativa. El SQL sigue fuera de migraciones, el preflight no está
montado en `server.mjs` y no existen credencial/login/grant de producción.
Tampoco existe material recuperable para correo, worker, proveedor ni endpoint.
Un trabajo `dispatching` no se cancela porque el proveedor puede estar en
vuelo; la aceptación tardía continúa protegida por la revalidación durable.
