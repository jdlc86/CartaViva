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
