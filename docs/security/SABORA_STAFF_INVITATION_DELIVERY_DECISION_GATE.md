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

## Candidatos de cifrado y recuperación previa al despacho (25-10-2026)

Se incorporan `staff-invitation-envelope-candidate.mjs` y
`staff-invitation-claim-recovery-candidate.mjs`, con pruebas unitarias
de AES-256-GCM, autenticación de contexto, detección de alteraciones,
hash del token, nonces independientes y fencing de claims caducados.

El cifrado usa AAD ligado a enrollment, versión y hash. Las claves
permanecen inyectadas; no se guardan ni se provisionan claves operativas.
El candidato de recuperación rota el fence únicamente para `claimed`
caducados: **nunca** reintenta automáticamente `dispatching` porque
puede existir un envío externo en vuelo. Los jobs ambiguos requieren
reconciliación explícita.

**No declarar el hito completo:** todavía no existe columna cifrada
en la outbox, custodia transaccional de material recuperable, gestión
de claves/rotación, grants restringidos de recuperación ni pruebas
PG17 de reinicio del worker. Los módulos no están montados en rutas,
worker o servidor. Son propuestas de diseño sin aprobación operativa.

## Cierre candidato de recuperación con mínimo privilegio (25-10-2026)

Se añade el SQL de diseño
`sql-candidates/staff_invitation_claim_recovery_pg17.sql`, un owner
`NOLOGIN/NOINHERIT` sin `BYPASSRLS`, dos políticas RLS limitadas
a `claimed` y la rutina `SECURITY DEFINER`
`reclaim_staff_invitation_claim_candidate`. El login positivo existe
únicamente en el contenedor PostgreSQL 17 de CI y recibe `USAGE`
de esquema y `EXECUTE` de la función, sin acceso directo a tablas
ni ejecución de la transición de identidad.

La prueba PostgreSQL 17 comprueba claim vigente, recuperación caducada,
fence obsoleto rechazado, dispatch con fence renovado, prohibición de
recuperar `dispatching` y denegación de lectura/escritura directa.
El primer intento reveló un UUID regex incompleto en el adaptador
restringido; se corrigió en `cbe88f1`. Ambos workflows de ese
SHA finalizaron SUCCESS.

**Cierre acotado:** se valida recuperación pre-dispatch con privilegios
mínimos en PostgreSQL 17 desechable. No hay login/grant operativo,
worker real, migración operativa, secreto recuperable, proveedor ni
reconciliación de `dispatching` ambiguo. El gate general de entrega
permanece abierto.

## Custodia cifrada candidata: transacción real PostgreSQL 17 (25-10-2026)

`sql-candidates/staff_invitation_custody_pg17.sql` incorpora
`staff_invitation_custody_candidate`, FORCE RLS, restricciones
de formato criptográfico, unicidad por inscripción/versión, referencia
a outbox y función `SECURITY INVOKER` que exige que el trabajo
esté `pending` y coincidan inscripción, versión y hash.
Se almacena únicamente el sobre AES-256-GCM (nonce, ciphertext,
tag y key id), no token en claro ni clave. La prueba PG17 ejecuta
INSERT de outbox y custodia en una sola transacción: un hash
incongruente provoca rollback de ambos; la operación correcta
persiste el sobre; la duplicación falla; el login restringido
de lifecycle/outbox no puede leer la custodia.

Evidencia: `acfd19b` con Sabora CI y Bootstrap SUCCESS tras corregir
el comentario SQL y el padding Base64URL detectados en CI.

**Alcance y gate abierto:** esta prueba utiliza administrador
del PostgreSQL 17 desechable para escribir la custodia. No existe
todavía wrapper integrado que enlace transición HMAC, outbox y
sobre cifrado bajo un principal SQL restringido. La función
`SECURITY INVOKER` no tiene grant operativo y no se habilita
un worker ni lectura autorizada de tokens. Gestión y rotación
de claves, recuperación segura en caso de reinicio, reenvío,
revocación y entrega externa requieren aprobación y nuevas pruebas.
No activar el esquema en Supabase operativo.

## Custodia cifrada transaccional candidata (25-10-2026)

El candidato `staff-invitation-custody-coordinator-candidate.mjs`
compone en una transacción de PostgreSQL 17 la transición HMAC, el
INSERT de outbox y el almacenamiento del sobre AES-256-GCM mediante
`staff_invitation_custody_pg17.sql`. El sobre queda vinculado al
enrollment, versión y hash de token; el texto claro y la clave no
persisten en la base de datos. El replay de correlación no vuelve
a almacenar el sobre.

Evidencia en CI: un token deliberadamente incongruente revierte
inscripción, outbox y custodia; una ejecución válida confirma los
tres registros; el replay no duplica custodia. La prueba de alteración
del sobre se hizo determinista para evitar falsos negativos. Commit
`cf19d2a`: Sabora CI y Bootstrap SUCCESS.

**Alcance estricto:** la composición candidata se prueba con el
administrador del contenedor PG17 desechable. NO está demostrado un
principal de custodia con mínimo privilegio, ni el acoplamiento
operativo con el coordinador de identidad, ni el manejo de clave
y rotación, ni la recuperación de sobre por worker, ni revocación
y limpieza de ciphertext, ni proveedor de correo. La función SQL
de custodia es SECURITY INVOKER sin grants runtime y no es una
migración operativa. El gate de entrega sigue abierto.

## Endurecimiento de identidad de clave y formato de sobre (25-10-2026)

El identificador de clave `keyId` ahora está incluido en el AAD
AES-256-GCM junto a inscripción, versión y hash. Alterar `keyId`
rompe la autenticación criptográfica, y el consumidor puede exigir
un `keyId` explícito para impedir sustituciones de claves. El
descifrado limita el ciphertext a 32–512 bytes, rechaza formato
no canónico y sobrecampos. Pruebas unitarias de sustitución de
`keyId`, formato y límites superadas en `1e33f0c` (Sabora CI
y Bootstrap SUCCESS).

Este subhito de integridad de sobre queda validado. No representa
aprovisionamiento/rotación de claves ni autorización de lectura
del material cifrado. El gate operativo continúa abierto.

## Custodia cifrada con principal SQL restringido (25-10-2026)

El candidato `sql-candidates/staff_invitation_custody_restricted_pg17.sql`
crea un owner `NOLOGIN/NOINHERIT/NOBYPASSRLS` independiente
del usuario runtime. El owner solo recibe lectura de columnas
necesarias de outbox, inserción de columnas cifradas de custodia,
políticas RLS acotadas y EXECUTE de la función de validación
`SECURITY INVOKER`. La función exterior
`store_staff_invitation_custody_restricted_candidate` es
`SECURITY DEFINER`, tiene `search_path` cerrado y no concede
EXECUTE a PUBLIC. El login efímero de CI recibe solo EXECUTE de
esta función además de la rutina integrada ya autorizada.

El coordinador candidato puede componer transición HMAC, outbox
y custodia cifrada bajo el mismo usuario restringido y la misma
transacción. La prueba PG17 confirma denegación de lectura e
inserción directas, rollback de inscripción ante hash erróneo,
commit de outbox y custodia y replay sin duplicación.

Se eliminó el bloqueo explícito de lectura de outbox porque
requería UPDATE para el owner. La inserción de outbox y la
verificación de custodia se realizan en **la misma transacción**
antes de hacer visible el registro; el nuevo owner no recibe
UPDATE de outbox. Este contrato de atomicidad no autoriza
almacenamiento de sobres para trabajos existentes fuera de la
transacción de emisión.

Evidencia: commit `7170acc`, Sabora CI y Bootstrap SUCCESS
en PostgreSQL 17 desechable. Subhito de custodia restringida
candidata cerrado; sigue sin existir un principal operativo,
gestión y rotación de claves, lectura segura para worker,
política de borrado, proveedor o despliegue autorizado.

## Lectura cifrada para despacho con fence y vigencia (25-10-2026)

El candidato `sql-candidates/staff_invitation_dispatch_envelope_pg17.sql`
define un propietario de lectura `NOLOGIN/NOINHERIT/NOBYPASSRLS`
independiente, con RLS y SELECT limitado a columnas necesarias
de inscripción, outbox y custodia. Solo expone mediante
`read_staff_invitation_dispatch_envelope_candidate(job_id,fence)`
el sobre cifrado si el trabajo está `dispatching`, el fence
coincide, existe autorización de despacho y el estado, la
versión y el hash actuales de la inscripción siguen vigentes.
No concede lectura directa a la identidad de aplicación.

El lector Node `staff-invitation-dispatch-envelope-reader-candidate.mjs`
resuelve la clave fuera de PostgreSQL y autentica el sobre con
AES-256-GCM y el AAD que liga `keyId`, inscripción, versión
y hash. La clave y el token en claro no se guardan en PostgreSQL.
No se monta en servidor ni se invoca proveedor.

Prueba PostgreSQL 17: sin acceso directo a tablas, sin sobre
antes de `dispatching`, rechazo de fence erróneo, lectura
correcta después de autorizar, y rechazo después de invalidar
el hash vigente. La primera ejecución detectó un fixture que
violaba la progresión de estados; se corrigió el fixture.
Commit `74ddbac`: Sabora CI y Bootstrap SUCCESS.

**Límite de seguridad:** una lectura autorizada no puede impedir
que ocurra una revocación inmediatamente después de devolver el
sobre, ni revocar un correo en vuelo. La aceptación del token
debe revalidar el estado vigente. La función candidata todavía
no resuelve ciclo operativo de claves, retención/borrado, worker,
proveedor, aislamiento de identidad de worker ni despliegue.
El gate operativo permanece abierto.
