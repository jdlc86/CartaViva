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

## Selector de claves y rotación lógica candidata (25-10-2026)

El módulo `staff-invitation-keyring-candidate.mjs` admite una
única clave `active` para nuevas invitaciones, claves
`decrypt_only` para descifrar sobres anteriores y claves
`disabled` que se rechazan. Se rechazan IDs duplicados,
múltiples claves activas y material distinto de 32 bytes.
El componente copia los buffers recibidos y devueltos,
y al cerrarse sobrescribe sus copias internas y deniega
operaciones posteriores. La sobrescritura no garantiza
el borrado de otras copias del secreto en el proceso,
GC, memoria intercambiada o sistemas externos.

Pruebas: cifrado con clave antigua, rotación de la clave
activa, descifrado histórico mediante clave `decrypt_only`,
rechazo de clave `disabled`, ausencia de aliasing de
buffers y cierre idempotente. Commit `9693c17`:
Sabora CI y Bootstrap SUCCESS.

**Alcance:** es un selector de claves **en memoria, candidato**.
No aprovisiona ni rota secretos operativos, no persiste
configuraciones, no elimina sobres y no impone una política
de caducidad. Una clave `decrypt_only` debe permanecer
disponible mientras existan sobres que dependan de ella,
o esos sobres deben dejar de ser recuperables según una
política aprobada. El gate de entrega continúa abierto.

## Integración del selector rotatorio en emisión y lectura (25-10-2026)

El coordinador candidato `staff-invitation-custody-coordinator-candidate.mjs`
admite `keyring` como alternativa excluyente a
`encryptionKey/keyId`: selecciona la clave activa al
cifrar el token dentro de la transacción. El lector candidato
`staff-invitation-dispatch-envelope-reader-candidate.mjs`
admite el mismo selector como alternativa excluyente a
`resolveKey` y descifra sobres históricos mediante
la clave identificada en el sobre, incluso cuando está
en estado `decrypt_only`. Una clave `disabled` no
es recuperable mediante el selector.

Las pruebas verifican la lectura histórica después de
rotación, rechazo de configuración ambigua y rechazo
de uso del selector después de su cierre. Commit
`9401e3e`: Sabora CI y Bootstrap SUCCESS.

**Límites:** la integración sigue siendo candidata y
no está montada en el servidor operativo. La configuración
de claves se inyecta en memoria; no existe aprovisionamiento
de secretos, procedimiento operativo de rotación, política
aprobada de borrado de ciphertext ni proveedor de correo.
No se autoriza despliegue ni migración.

## Purga candidata acotada de custodia terminal (25-10-2026)

El candidato `sql-candidates/staff_invitation_custody_purge_pg17.sql`
crea un principal `NOLOGIN/NOINHERIT/NOBYPASSRLS` independiente
con permisos limitados a SELECT del estado/fecha de outbox y
SELECT/DELETE del sobre cifrado. La función de acceso restringido
`purge_terminal_staff_invitation_custody_candidate(cutoff,max_rows)`
elimina como máximo 500 sobres por invocación y exclusivamente
cuando el trabajo está en estado terminal
`cancelled`, `delivered` o `failed`, tanto el cambio de estado
como la creación del sobre preceden al cutoff explícito, y
la función no recibe un cutoff futuro. El outbox no se elimina.
No se conceden privilegios directos de DELETE al runtime.

Las pruebas en PostgreSQL 17 desechable comprueban rechazo de
límite cero, límite mayor de 500 y cutoff futuro, denegación
de DELETE directo, preservación de sobre `pending`,
eliminación por lotes de sobres `cancelled`, repetición
idempotente y permanencia de todos los registros outbox.
Evidencia: commit `095f0e2`, Sabora CI y Bootstrap SUCCESS.

**Decisión normativa aún pendiente:** no existe duración
aprobada de retención, planificación operativa ni autorización
para ejecutar la purga. El cutoff es explícito y solo
sirve para la validación candidata. La eliminación de filas
no constituye borrado físico garantizado en WAL, copias
de seguridad o réplicas, ni elimina los hashes persistentes.
No debe aplicarse en Supabase operativo.

## Coordinador candidato de mantenimiento de custodia (25-10-2026)

`apps/api/src/staff-custody-maintenance-candidate.mjs` encapsula
la invocación de la función SQL de purga terminal con **modo
no destructivo por defecto**. Una ejecución real exige
`dryRun:false` y un objeto de autorización explícito
con acción `purge_terminal_staff_custody`, `approved:true`,
`cutoff`, `maxRows` y `maxBatches` coincidentes.
Se rechazan fechas inválidas o futuras, lotes fuera de 1–500,
más de 20 lotes por ejecución y respuestas SQL inconsistentes.
El coordinador detiene el bucle cuando una operación devuelve
menos filas que el tamaño máximo del lote. No implementa
cron, credenciales, duración de retención ni conexión operativa.

Las pruebas unitarias verifican no ejecución por defecto,
rechazo de autorizaciones ausentes o discordantes, validación
de fechas y límites, lotes acotados y cierre ante respuestas
inconsistentes. Evidencia: commit `8579e32`, Sabora CI y
Bootstrap SUCCESS. Este hito cierra solo la **orquestación
candidata no desplegada**. El objeto de autorización no es
una firma ni sustituye la decisión operativa humana ni un
sistema real de control de acceso.

**Gate abierto:** la política normativa de retención, la
identidad del ejecutor, el mecanismo de autorización
verificable, las ventanas de mantenimiento y la operación
de producción deben aprobarse antes de cualquier uso real.

## Autorización firmada de mantenimiento (25-10-2026)

El candidato `staff-custody-approval-authority-candidate.mjs`
emite y verifica concesiones HMAC-SHA256 para la acción
`purge_terminal_staff_custody`, vinculadas a actor de
lista permitida, cutoff, tamaño de lote, número de lotes,
emisión, caducidad y nonce. El plazo máximo es de 300 s;
la comparación de MAC es constante en tiempo. El verificador
exige `consumeNonce` proporcionado por el integrador y
rechaza la repetición si este devuelve false. El coordinador
`staff-custody-maintenance-candidate.mjs` permite configurar
`approvalAuthority` y, en ese modo, exige verificar y
consumir la autorización antes de ejecutar SQL destructivo.

Pruebas: aprobación válida de un solo uso, firma manipulada,
cambio de alcance, actor no permitido, expiración, repetición,
cierre del verificador y modo dry-run sin consumir concesiones.
Commit `930598c`, Sabora CI y Bootstrap SUCCESS.

**Límites y riesgos abiertos:** `consumeNonce` es una
dependencia inyectada; el test usa memoria y NO demuestra
atomicidad duradera entre procesos. No hay autenticación
operativa de la persona que aprueba ni custodia operativa de
la clave HMAC. El coordinador conserva la vía candidata
anterior de aprobación booleana cuando NO se configura
`approvalAuthority`: **esa vía no constituye autorización
segura** y debe eliminarse antes de conectar cualquier
ejecutor real. No hay scheduler, identidad de producción,
política de retención aprobada ni permiso de despliegue.

## Consumo duradero de concesiones y cierre de bypass booleano (25-10-2026)

El candidato `sql-candidates/staff_custody_approval_nonce_pg17.sql`
crea una tabla de nonces con clave primaria, FORCE RLS y
principal independiente `NOLOGIN/NOINHERIT/NOBYPASSRLS`.
`consume_staff_custody_approval_nonce_candidate` es una
función `SECURITY DEFINER` de búsqueda cerrada, que
inserta atómicamente el nonce una sola vez mediante
`ON CONFLICT DO NOTHING`, rechaza caducidades pasadas
o superiores a cinco minutos y no concede EXECUTE público.
El adaptador Node
`staff-custody-nonce-consumer-candidate.mjs` llama la
función restringida y rechaza resultados inesperados.

`staff-custody-maintenance-candidate.mjs` ahora exige
siempre `approvalAuthority.verifyAndConsume`: **se ha
eliminado el camino que aceptaba el objeto booleano de
aprobación sin verificación**. El modo dry-run continúa
siendo el predeterminado. Las pruebas PG17 realizan 16
consumos concurrentes desde dos pools: exactamente uno
es aceptado; se deniega SELECT y DELETE directos, se
rechazan nonces repetidos y caducados. La primera ejecución
detectó un permiso insuficiente para `ON CONFLICT` bajo
FORCE RLS, corregido con SELECT mínimo del campo nonce
y política SELECT del propietario no login.
Evidencia: commit `20c3761`, Sabora CI y Bootstrap SUCCESS.

**Alcance y límites:** el registro de nonce es duradero y
atómico en PostgreSQL 17 desechable; no existe una migración
operativa, identidad de ejecución de producción ni concesión
de privilegios operativos. La emisión de concesiones HMAC
sigue siendo candidata y la autorización humana verificable
y política de retención están pendientes. Consumir el nonce
antes de la purga evita el replay pero no asegura una
transacción atómica entre consumo y purga; un fallo posterior
requiere una nueva autorización. No se ha ejecutado ninguna
purga operativa.

## Prueba integral de mantenimiento con concesión de un solo uso (25-10-2026)

Se añadió a `scripts/ci/staff-invitation-outbox-postgres17.test.mjs`
un recorrido real de extremo a extremo en PostgreSQL 17
desechable: creación de invitación y custodia cifrada,
paso del outbox a estado terminal, emisión de autorización
HMAC vinculada al actor y al alcance, dry-run sin consumo,
consumo persistente del nonce por el runtime restringido,
purga acotada mediante otra conexión, rechazo de replay,
verificación de ausencia de ciphertext y conservación del
registro outbox. Commit `c217ab1`: Sabora CI y Bootstrap
SUCCESS.

La prueba demuestra que los módulos candidatos se pueden
componer sin el antiguo bypass de aprobación booleana y
sin privilegios de tabla directos en la identidad de runtime.

**El gate operativo permanece abierto:** no se ha aprobado
la retención ni implementado el vínculo autenticado entre
persona autorizadora y `actorId`, ni un proceso operativo
para la clave HMAC o identidad dedicada de mantenimiento.
El consumo del nonce y la purga no comparten transacción
atómica; la semántica actual es de autorización de un solo
intento, sin reintento destructivo bajo la misma concesión.
No hay despliegue ni ejecución en Supabase operativo.

## Frontera candidata de emisión con actor autenticado (25-10-2026)

`apps/api/src/staff-custody-authenticated-grant-issuer-candidate.mjs`
introduce una frontera de emisión independiente: obtiene
`actorId` únicamente de `resolveAuthenticatedActor(context)`,
exige evidencia `authenticated:true` y verifica mediante
`authorizeMaintenance` el permiso específico para la acción,
cutoff y límites de ejecución antes de invocar al firmante.
No acepta `actorId`, `role`, `approved` ni firma elegidos
por los parámetros de solicitud. Las pruebas rechazan
identidades ausentes, no autenticadas y actores sin permiso;
también verifican que un actor falso suministrado por el
llamante no altera el actor firmado.

**Límite normativo:** los resolutores de autenticación y
autorización son dependencias inyectadas, no una identidad
operativa aprobada. El módulo no se monta como endpoint ni
aporta provisión de secretos o control de acceso de
producción. Antes de activarlo deben conectarse verificadores
de sesión confiables y permiso real de mantenimiento con
pruebas de suplantación y revocación; el método de emisión
de bajo nivel `authority.issue` solo puede residir en
un componente interno de confianza. Este bloque es
candidato, sin autorización de despliegue.

## Replay durable con material regenerado — tercera auditoría del PR #13

La identidad durable de un trabajo de entrega ya creado es el par
`(enrollment_id, invite_version)`, protegido por la unicidad del outbox y
obtenido del resultado idempotente del wrapper de ciclo. En un replay de
`invite`, el UUID de enrollment y el token generados por el nuevo intento son
material efímero: no se persisten y no pueden usarse para localizar el trabajo
original. Por ello, la rama `repeated` del wrapper integrado recupera el job
solo por la identidad durable devuelta y deja de exigir que su
`invite_token_hash` coincida con el token regenerado. Las inserciones nuevas
siguen verificando el hash recibido y no se ha ampliado ningún grant.

La reproducción real anterior enviaba la misma intención y correlación con un
UUID y token nuevos: el ciclo devolvía correctamente el enrollment original,
pero el outbox terminaba en `staff_invitation_outbox_replay_missing`. La prueba
PostgreSQL 17 corregida demuestra que el replay devuelve el job original sin
crear enrollment, request, auditoría, custodia ni entrega adicionales. También
cubre dos reintentos concurrentes con UUID y tokens distintos (una inserción y
un replay), replay de `resend` con token regenerado y las dos composiciones de
custodia, incluida la ejecutada por el principal SQL restringido.

La revocación sigue cercando el replay: una invitación revocada no recupera ni
reactiva un trabajo entregable. La idempotencia solo tolera el material efímero
documentado; cambiar actor, acción, email normalizado, rol u otra intención
durable conserva el conflicto de correlación. Evidencia local posterior:
25/25 casos de outbox dentro de 87/87 casos PostgreSQL 17. El gate operativo
continúa abierto: no se activaron worker, proveedor, endpoint ni envío real.
