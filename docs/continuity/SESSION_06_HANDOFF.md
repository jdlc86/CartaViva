# Sesión 6 — integración candidata de confirmación (22-10-2026)

## Alcance publicado

Se añadió `apps/api/src/catalog-confirmation-candidate-runtime.mjs` para componer, sin rutas HTTP ni configuración de conexión, el coordinador de confirmación, el repositorio de lecturas, el escritor de pedidos y la frontera transaccional PostgreSQL existente. La fábrica recibe un pool inyectado, una clave secreta confiable y opcionalmente reloj y generador de UUID. No abre conexiones al construirse.

Se añadió `tests/catalog-confirmation-candidate-runtime.test.mjs` con pruebas de rechazo previo al checkout, configuración incompleta y rollback ante contexto de visita no autorizado usando un cliente simulado.

Commits: `122e540529d5a8fd3c6146bb6fcbb621df0ad3b2` y `aca308f08a0f0e7ec7c038b6704a48dcd8d48908`.

## Evidencia y límites

Los workflows del SHA previo `febb6dae3e3b5ab33fd62036767f77704f4736c4` finalizaron SUCCESS: Sabora CI `39801651213` y Bootstrap `39801650399`. No extrapolar ese resultado a los commits de sesión 6; comprobar los workflows del HEAD nuevo.

**No acreditado todavía:** ejecución del coordinador Node con driver `pg` real sobre PostgreSQL 17 desechable; integración de credenciales de cliente, permisos SQL mínimos, auditoría de actor individual, cierre concurrente y flujo operativo de pedidos. Las pruebas nuevas usan un cliente simulado. El `package.json` de API no declara aún dependencia `pg`; no agregar un pool operativo por inferencia.

## Siguiente bloque obligatorio

1. Diseñar harness Node + PostgreSQL 17 aislado, utilizando una dependencia declarada y lockfile coherente, sin conectar Supabase.
2. Ejercitar confirmación, replay, rollback y carreras contra el esquema migrado, verificando estado persistido de pedidos, líneas y ledger.
3. Acreditar rol SQL mínimo y atribución auditada antes de HTTP.
4. Mantener PR #2 Draft; no merge, despliegue, acceso a Fleetia ni modificaciones en Supabase operativo.

## Continuación: verificación y endurecimiento de fábrica

- El HEAD anterior `f45ca8a512b37cc0829dc93fece451b8472bdf3c` completó Sabora CI `39804165361` y Bootstrap `39804165415`, ambos SUCCESS.
- `d2e9e077`: la fábrica valida primero la dependencia transaccional y reutiliza el adaptador construido, sin crear conexiones.
- `b7230c0e`: nuevas regresiones para generador de IDs inválido y fallo de BEGIN con descarte del cliente.
- Los tests nuevos no sustituyen el gate pendiente de driver `pg` real con PostgreSQL 17 desechable. No se han otorgado permisos ni activado endpoints.

## Consolidación del candidato existente (continuación)

Al revisar el árbol completo se confirmó que `apps/api/src/catalog-order-confirmation-candidate.mjs` ya ofrecía la fábrica canónica `createCatalogOrderConfirmationPoolCandidate`. La fábrica añadida al comienzo de sesión 6 duplicaba esta responsabilidad. Se eliminó el duplicado y se migraron sus pruebas al módulo canónico, evitando dos puntos de integración divergentes.

- `de0cd6f6`: corrige el uso de valores predeterminados del reloj y del generador de UUID en la fábrica canónica; antes, `newOrderId: undefined` se pasaba explícitamente a `createCatalogOrderWriter`, anulando el valor predeterminado y rechazando la construcción.
- `aafc05a7`: las pruebas de fallo cerrado, rollback y descarte de conexión ahora ejercitan la fábrica canónica.
- `ce974e7a`: se elimina `catalog-confirmation-candidate-runtime.mjs` por redundante.

El bloqueo de driver real permanece. Este cambio no instala `pg`, no habilita SQL grants, ni publica rutas. Comprobar CI del SHA final antes de afirmar éxito.

## Puerta adicional de transacciones (sesión 6)

- `ed2e5c8` acreditado por Sabora CI `39806156979` y Bootstrap `39806157027`, ambos SUCCESS.
- `b08280d` / `0d14117`: cobertura del rechazo de reloj no funcional sin checkout y de COMMIT fallido que descarta la conexión del pool incluso si el intento de ROLLBACK se completa.
- Este bloque es exclusivamente regresión del adaptador y no debe confundirse con integración Node/PG17: sigue pendiente driver real y entorno aislado. Mantener el PR Draft, sin despliegue ni concesiones SQL.

## Bloque de seguridad: consultas desprendidas encadenadas

- `1c2f333`: el gestor de transacciones espera a que se vacíe por completo el conjunto de consultas desprendidas antes de emitir ROLLBACK y liberar la conexión. La espera previa capturaba una sola instantánea; una consulta pendiente podía iniciar otra consulta mientras se resolvía.
- `257d702`: prueba de regresión donde una consulta desprendida inicia otra al completarse. Debe prohibirse ROLLBACK y release hasta que la segunda haya finalizado. El error original se propaga y el cliente se descarta.
- Esta corrección protege el límite de transacción; no representa validación real de PostgreSQL. El repositorio sigue sin integración Node/driver `pg` acreditada. La ejecución local no es posible en el shell actual: GitHub DNS no disponible y Docker ausente. La prueba debe acreditarse por GitHub Actions.
- No modificar VPS compartido, Fleetia ni Supabase operativo. PR #2 Draft; sin merge ni despliegue.

## Carrera de dos primeros pedidos (PostgreSQL 17 desechable)

- `ce7a975`: nuevo `scripts/ci/catalog-order-writer-double-first-concurrency-smoke.sh`. Crea una mesa de prueba, mantiene el bloqueo de la primera confirmación y lanza una segunda transacción independiente. Exige espera observable por bloqueo; al concluir comprueba exactamente un pedido `first`, uno `grouped`, el instante inicial idéntico al del primer pedido y dos líneas de cocina generadas por trigger.
- `d63d74d`: incorpora el test al `postgres-migration-smoke.sh`, que crea y destruye PostgreSQL 17 sin red mediante Docker en CI.
- La prueba reproduce la sentencia SQL del escritor, **no** ejecuta el módulo Node ni sustituye el gate de integración con driver PostgreSQL. Mantener cerrados los grants y las rutas HTTP hasta acreditar la integración completa.
- Los workflows para `d63d74d` estaban en cola al redactar este hito; no asumir éxito antes de comprobarlos.
