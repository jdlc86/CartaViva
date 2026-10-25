# Integración aislada — Hito 1 identidad y personal

**Base:** `integration/sabora-order-management-review` @ `03f5a4796c5ffa392c868dab74525233e5155e66`.
**Origen incorporado sin merge:** PR #10 @ `8598ee31a51edd80b1d7799013946766f67a0dfa` (3 commits por delante, 0 por detrás).
**Estado:** integración de código candidata, **no activación de runtime**.

## Alcance incorporado
- Capacidad HMAC de actor SQL para transiciones de cocina/sala, validación en PostgreSQL, owner sellado y migración candidata.
- Ciclo de vida del personal: invitación, aceptación, registro, activación, reenvío, suspensión y revocación desde el primer registro persistente.
- Repositorios, coordinadores, preflight de identidad, pruebas Node/PG17 y contratos técnicos del PR #10.

## Evidencia
- En SHA de origen `8598ee31a51edd80b1d7799013946766f67a0dfa`: Sabora CI #40176893065 SUCCESS; Bootstrap Sabora lockfile #40176892976 SUCCESS.
- Comparación de ramas: 3 commits delante, ninguno detrás. **Estos resultados no certifican futuros commits de integración.**

## Fronteras que permanecen cerradas
- `server.mjs` no monta endpoints de operaciones ni ciclo de personal.
- Keyrings vacíos; no se crea login operativo, no se concede EXECUTE a login de producción ni se aplican migraciones a Supabase operativo.
- Aprobación pendiente de HMAC/pgcrypto, custodia y rotación de claves, credenciales mínimas, entrega de invitaciones y registro WebAuthn, integración de lecturas y gateway UI autenticado.
- No hay merge a ramas protegidas, despliegue ni acceso a Fleetia/VPS.

## Criterios para el siguiente bloque
1. Revisar la arquitectura de claves y contratos pendientes antes de abrir rutas.
2. Construir la composición explícita del ciclo de personal solo después de disponer de transporte seguro de invitaciones y credenciales verificadas.
3. Ejecutar regresión Node, PG17 efímero y ambos workflows sobre el SHA exacto de cada cambio.
4. Documentar las decisiones y mantener el PR Draft.

No confundir integración del código candidato con disponibilidad funcional en producción.

## Bloque siguiente — composición de ciclo de personal (25-10-2026)

- `apps/api/src/staff-lifecycle-composition.mjs` incorpora `createVerifiedStaffLifecycleFromPool`, fábrica explícita que exige todas las dependencias de emisión/verificación y ejecuta el preflight SQL antes de exponer el coordinador. Reutiliza el repositorio candidato y `createPostgresTransaction`.
- `tests/staff-lifecycle-composition.test.mjs` verifica ausencia de conexiones cuando faltan dependencias, rechazo de roles prohibidos antes de abrir conexiones, liberación tras preflight fallido y que `server.mjs` no importa la composición.
- **No se habilitan rutas ni grants.** El módulo no emite correo, no autentica HTTP ni aprovisiona claves; esas decisiones permanecen pendientes de contrato y autorización.
- Los commits de este bloque requieren CI del SHA final; la certificación verde de `52f9a374` no los cubre.

## Bloque HTTP candidato sin activación (25-10-2026)

- `staff-lifecycle-http-candidate.mjs` ofrece un adaptador inyectable **no registrado en `server.mjs`**. Rechaza campos de actor/rol no previstos, exige contexto verificado y devuelve códigos cerrados sin filtrar errores internos.
- El token de invitación viaja únicamente hacia una dependencia de entrega confiable, nunca al JSON HTTP. Una entrega fallida devuelve 503, sin afirmar que el envío se completó.
- `tests/staff-lifecycle-http-candidate.test.mjs` prueba entradas falsificadas, requisitos de identidad, ocultación de secretos y errores de entrega.
- **Limitación funcional relevante:** persistir invitación y entregar correo no es una única transacción; el 503 de entrega no deshace el alta. La recuperación duradera mediante outbox/cola, la idempotencia de reenvíos y el contrato del proveedor deben cerrarse antes de activar rutas. Tampoco se ha implementado aquí WebAuthn ni autenticación JWT HTTP.
- Ninguna ruta se monta; no hay nuevos grants, claves ni migración aplicada a Supabase operativo. Nuevos commits requieren CI en su SHA final.

## Hito 2 — primer subbloque de entrega segura (25-10-2026)

- Se añade una política pura `decideStaffInvitationDelivery` que descarta trabajos asociados a inscripciones revocadas, aceptadas o sustituidas por reenvío (versión/hash de token distinto).
- Pruebas unitarias verifican las denegaciones y la admisión exclusiva de la invitación vigente.
- **No es una outbox duradera ni una garantía transaccional:** la decisión en memoria puede quedar obsoleta inmediatamente después de leer el estado. Para garantizar revocación frente a una entrega concurrente hace falta diseñar y probar el bloqueo/arbitraje de envío en PostgreSQL 17, almacenamiento cifrado del material necesario para entrega, límites de reintentos, deduplicación y tratamiento de fallos del proveedor. No introducir una migración ni habilitar el worker antes de aprobar esos contratos.
- El Hito 2 sigue abierto; la política es una defensa auxiliar y no acredita entrega ni activación. La CI de este nuevo SHA debe verificarse por separado.

## Incidencia CI del subbloque de entrega y corrección

- En `5b2a268`, ambos workflows fallaron: 781/786 pruebas raíz, 5 fallos concentrados en `staff-invitation-delivery-policy.test.mjs`.
- Causa demostrada en logs: el validador UUID de la política tenía cuatro grupos en lugar de cinco y rechazaba inscripciones válidas antes de evaluar su estado.
- Corregido en `e6d1f99` con patrón UUID 8-4-4-4-12. La corrección requiere nueva verificación CI; no atribuirle éxito hasta observar los workflows.

## Corrección de replay de invitación (25-10-2026)

- Detectada una segunda frontera: el coordinador genera un token nuevo antes de consultar la idempotencia durable; cuando SQL devuelve `repeated=true`, ese token no coincide con el hash del primer intento.
- Se suprime la exposición del token de entrega en replays. Prueba de regresión añadida en `staff-lifecycle-coordinator.test.mjs`.
- Una primera entrega fallida seguida de replay **no reenvía** el token original: es una limitación deliberada del flujo candidato. Resolver con outbox duradera y material protegido antes de activar el envío.

## Hito 2 — contrato candidato de claim transaccional (25-10-2026)

- `staff-invitation-claim-candidate.mjs` añade un orquestador inyectable que exige `withTransaction`, lectura bloqueada de trabajo+inscripción y actualización condicional con fence, aplicando la política de invitación vigente antes de mutar.
- Pruebas verifican secuencia lock→claim, revocación/reenvío sin claim, rechazo de claim inválido y dependencias obligatorias.
- **No se ha implementado aún el repositorio SQL, la tabla outbox, el cifrado del token ni el worker.** Este contrato no garantiza atomicidad por sí mismo: dependerá del aislamiento SQL, del bloqueo y del protocolo de confirmación de envío. No activarlo en producción.

## Hito 2 — adaptador SQL candidato (25-10-2026)

- `staff-invitation-outbox-repository-candidate.mjs` contiene SQL parametrizado de lectura con `FOR UPDATE OF o,e` y claim condicional `pending→claimed`, con fence UUID generado en PostgreSQL.
- Pruebas verifican secuencia SQL, denegación por revocación, filas duplicadas/inválidas y carrera perdida.
- **La tabla `sabora.staff_invitation_outbox` aún NO existe en la migración del proyecto**: este módulo es deliberadamente no ejecutable en el entorno operativo y no se ha montado en runtime. Falta migración candidata con RLS/grants mínimos, almacenamiento seguro de secretos y protocolo de entrega con garantías frente a revocación concurrente. No considerar cerrada la outbox.

## Hito 2 — esquema SQL de revisión aislada (25-10-2026)

- Nuevo borrador `docs/security/sql-candidates/staff_invitation_outbox_schema_pg17.sql`, fuera de `supabase/migrations`: tabla con estado de entrega, unicidad inscripción+versión, fence, marcas temporales, índices y RLS FORCE. No concede permisos a nadie.
- Test de contrato verifica RLS, ausencia de grants y que el borrador no está en el directorio de migraciones operativas.
- **No está ejecutado en PostgreSQL 17 ni integrado con el escritor transaccional.** El modelo de entrega remota no resuelve todavía el envío concurrente con revocación, el material secreto protegido, reintentos ni la auditoría de entrega. Debe revisarse y probarse antes de promoverlo a migración real.

## Hito 2 — gate de entrega y pruebas de carreras simuladas

- Nuevo `docs/security/SABORA_STAFF_INVITATION_DELIVERY_DECISION_GATE.md`: recoge la ausencia de contrato aprobado, los límites de atomicidad frente al proveedor externo y los requisitos pendientes de decisión; no modifica la normativa.
- `tests/staff-invitation-claim-race-candidate.test.mjs` cubre carreras simuladas de dos claims, revocación y reenvío observados bajo lock, y rollback ante fila inválida. **Son simulaciones de adaptador, no ensayos concurrentes en PostgreSQL 17**.
- La regla de seguridad es que un correo tardío nunca pueda conferir acceso porque la aceptación valida el estado durable vigente. No se ha habilitado ningún envío.

## CI y endurecimiento de frontera SQL

- Commit `ad3c30c602d9edf23dfc53533dcb25c2670e761c`: **Sabora CI #40181256584 SUCCESS** y **Bootstrap #40181256588 SUCCESS**.
- `tests/staff-invitation-outbox-boundary.test.mjs` amplía la cobertura del adaptador candidato: parametrización de UUID, rechazo de cardinalidad/fence incorrectos, trabajo ausente sin UPDATE y estado no reconocido.
- Las pruebas adicionales son unitarias; siguen pendientes la migración y las pruebas PostgreSQL 17 reales, el material cifrado y la aprobación normativa del envío.

## Hito 2 — endurecimiento del parseo de filas SQL

- El adaptador de outbox valida el UUID del trabajo y exige propiedades de datos propias antes de acceder a los campos de una fila SQL; rechaza getters de objetos manipulados.
- Dos regresiones adicionales comprueban que no se evalúan getters y que un identificador de trabajo malformado no se acepta.
- Son defensas del adaptador candidato; no sustituyen pruebas PostgreSQL 17 ni autorizan envío.

## Preparación de verificación PostgreSQL 17 aislada

- `docs/security/sql-candidates/README_PG17_VERIFICATION.md` detalla precondiciones, privilegios, pruebas con dos conexiones y carreras, criterios de fallo y registro de evidencias.
- **No se ha ejecutado este plan**; no debe confundirse con las pruebas unitarias ni con una certificación PostgreSQL real. Sin credenciales operativas ni despliegue.

## Hito 2 — frontera previa a dispatch (25-10-2026)

- `staff-invitation-dispatch-guard.mjs` introduce una segunda comprobación transaccional de inscripción y claim con fence justo antes de autorizar la operación de dispatch. El repositorio inyectado debe implementar `lockClaimedDelivery` y `authorizeDispatch` con semántica SQL atómica.
- `tests/staff-invitation-dispatch-guard.test.mjs`: cuatro casos de éxito condicionado, revocación/aceptación/rotación, fence obsoleto y configuración inválida. Ejecución local aislada Node.js: **4/4 PASS**.
- **Advertencia:** una autorización previa al envío no puede garantizar que un mensaje externo no llegue después de una revocación. El servidor debe validar el estado durable al aceptar el token. No hay proveedor, worker, implementación SQL del dispatch ni garantía de entrega activados. PostgreSQL 17 real sigue pendiente.
- Base validada: `8f0ac2ba6bd1c01aedb0dc38ce294b503d112f97`, Sabora CI #40182111408 SUCCESS y Bootstrap #40182111403 SUCCESS.

## Hito 2 — bloque integrado claim→dispatch candidato (25-10-2026)

- El esquema SQL aislado incorpora `dispatching` y `dispatch_authorized_at`, con constraints de integridad y orden temporal.
- `staff-invitation-outbox-repository-candidate.mjs` implementa `lockClaimedDelivery` (bloquea inscripción y trabajo por ID/fence) y `authorizeDispatch` (transición condicional `claimed→dispatching`).
- `tests/staff-invitation-dispatch-sql-candidate.test.mjs` prueba integración entre guard y adaptador: éxito con fence, revocación, carrera perdida y fence obsoleto. Test de contrato del esquema ampliado.
- **No equivale a envío efectivo:** la transacción solo autoriza el intento; el correo externo sigue siendo no atómico. El token debe validarse en cada aceptación. La outbox sigue sin guardar secretos recuperables, sin encolado en la transacción de invitación, sin worker ni login operativo, sin validación PG17 real y sin aprobación normativa. No desplegar.

## Hito 2 — bloque reconciliación transaccional de invitaciones obsoletas

- `staff-invitation-reconciliation-candidate.mjs` incorpora el flujo completo candidato `lock → decidir vigencia → cancelar` en una transacción, sin cancelar invitaciones vigentes.
- El adaptador SQL añade `lockReconciliationCandidate` y `cancelStaleDelivery`: bloqueos `FOR UPDATE OF o,e`, consultas parametrizadas y actualización condicional solo para `pending`/`claimed`. El estado `dispatching` queda excluido deliberadamente: el proveedor externo podría estar enviando el mensaje.
- `tests/staff-invitation-reconciliation-candidate.test.mjs` cubre revocación, aceptación, rotación de versión/hash, vigencia, ausencia, carrera perdida y configuración inválida.
- **Límite:** este flujo aún no está conectado a la transición SQL `revoke`/`resend` ni a un worker, por lo que no cancela trabajos en producción. El servidor debe seguir denegando tokens revocados o rotados incluso si un correo llega tarde. Las pruebas son de integración del adaptador simulado, no de PostgreSQL 17 real.

## Hito 2 — cierre de resultado de proveedor (candidato aislado)

- `staff-invitation-delivery-outcome-candidate.mjs` registra el resultado del proveedor dentro de una transacción y exige fence vigente y estado `dispatching`.
- El repositorio SQL añade `lockDispatchingDelivery` y `finishDispatchingDelivery`; persiste `provider_outcome` con tres valores diferenciados: `accepted`, `permanent_failure` y `unknown`. El esquema candidato exige coherencia entre `delivered`/`failed` y resultado de proveedor.
- El resultado `unknown` es terminal `failed`, queda identificado de forma durable y **no se reintenta automáticamente**: un proveedor podría haber aceptado la petición aunque se perdiera su respuesta. `accepted` significa aceptación del proveedor, no entrega en buzón ni activación del personal.
- Siete pruebas de contrato y flujo simulado cubren aceptación, fallo permanente, ambigüedad, fence ausente, carrera perdida y parámetros inválidos.
- Pendientes antes de operar: aprobación del contrato de proveedor, almacenamiento seguro del secreto de entrega, enqueue transaccional, gestión de expiración de claims y pruebas SQL reales de la outbox en PostgreSQL 17. No se ha montado ningún worker ni endpoint; ninguna entrega real.

## Corrección integral de coherencia SQL terminal

- Se detectó un defecto real en el borrador SQL: `dispatching→failed` retenía `dispatch_authorized_at`, pero el constraint anterior lo prohibía. Ahora `failed` conserva ese timestamp, coherente con el flujo de registro de resultado.
- Los constraints terminales exigen `provider_outcome IS NOT NULL` explícito, para evitar el comportamiento de `CHECK` con expresiones `UNKNOWN` en PostgreSQL.
- Se actualizaron y ampliaron las pruebas de contrato. La corrección permanece exclusivamente en `docs/security/sql-candidates`, fuera de migraciones operativas.

## Cierre de validación real PG17 para invitaciones/outbox (25-10-2026)

- Commit de código y pruebas: `bab8f59`. El nuevo harness aplica todas las
  migraciones en `postgres:17-alpine`, aplica después el SQL candidato desde
  `docs/` y usa el driver real con conexiones independientes.
- Primera ejecución: 5/8. Se reprodujeron tres fallos: `pending` aceptaba
  intentos consumidos, el claim no actualizaba `updated_at` y dispatch no
  incrementaba `attempts`.
- Tras corregir constraints y adaptador: 8/8. Cobertura: RLS/ACL, formas y
  timestamps, transición completa, fencing incorrecto, dos claimers,
  revocación y reenvío concurrentes, unicidad/replay, proveedor ambiguo y
  mensaje tardío sin reactivación.
- Regresión local: 830/830; pruebas focalizadas: 48/48; build API correcto. El
  contenedor y el módulo temporal se eliminaron al finalizar.
- El harness queda conectado a los dos workflows mediante
  `catalog-postgres17-node-driver-smoke.sh`. Los resultados de CI deben
  atribuirse solo al SHA final que incluya este documento.

Límites conservados: SQL fuera de migraciones operativas, cero grants/login,
sin secreto recuperable, enqueue transaccional, lease/reclaim, worker,
proveedor o correo real. Un envío ya en vuelo puede concluir después de una
revocación; la garantía es que la aceptación revalida el estado durable y no
reactiva el enrollment. No se tocó Fleetia, Supabase operativo ni VPS.
