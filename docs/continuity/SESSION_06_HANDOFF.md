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

## Carrera de confirmación abortada frente a otra confirmación (22-10-2026)

- El commit `169580b` obtuvo Sabora CI SUCCESS (`39809019473`) y Bootstrap SUCCESS (`39809019556`).
- `20ddeab` amplía el smoke de PostgreSQL 17 con una segunda carrera: una transacción retiene `FOR UPDATE` y revierte, mientras otra espera para confirmar. La confirmación superviviente debe ser `first`, escribir `first_confirmed_at` y producir exactamente un pedido y una línea de cocina. Un intento abortado no puede consumir la ventana de agrupación.
- La prueba se ejecuta en el mismo contenedor aislado y desechable del pipeline; no crea grants ni endpoints. **Pendiente:** comprobar el CI de este SHA y ejecutar el coordinador Node completo sobre PostgreSQL 17 con un driver real. No desplegar ni hacer merge.

## Validación del resultado del bloqueo consultivo

- `46be57a`: el lector de idempotencia rechaza respuestas SQL con una fila de bloqueo consultivo malformada, antes de leer el ledger. Conserva compatibilidad con el adaptador de respuesta vacía ya contemplado en las pruebas existentes; no cambia el alcance ni los permisos SQL.
- `2dab04b`: regresiones para valores nulos, escalares y arrays en la respuesta del driver, exigiendo que nunca se consulte el ledger después de detectar una fila inválida.
- Validar ambos workflows del último SHA. La composición Node+PostgreSQL 17 sigue pendiente de ejecución real; no confundir con los smoke SQL ya acreditados.

## Aislamiento de claves idempotentes entre clientes

- `8d962f6` amplía `catalog-confirmation-atomicity-smoke.sql` con dos actores diferentes que usan el mismo `request_key` sobre la misma mesa, sesión, visita y cesta. Ambos deben conservar sus propias cotizaciones y órdenes, con líneas de cocina independientes. La prueba se ejecuta bajo transacción y finaliza en `ROLLBACK` en PostgreSQL 17 desechable.
- La unicidad se comprueba por alcance completo, no por clave global; no deben fusionarse pedidos de actores distintos. No se modifican migraciones, permisos ni endpoints.
- El último SHA de este bloque requiere comprobar CI; no afirmar que el coordinador Node esté integrado con un driver real.

## Corrección de regresión CI: aislamiento entre actores

- `0fc80b0` falló en ambos workflows de PostgreSQL 17: al introducir una segunda cotización para el mismo `table_id` y `visit_id`, cuatro consultas anteriores `SELECT ... INTO STRICT` del smoke dejaron de ser únicas. Error reproducido en logs de Sabora CI `39812400070`: `query returned more than one row`.
- `091e9c4` añade `actor_id='actor-atomic'` a las cuatro consultas de fixture existentes. El aislamiento entre actores se mantiene; el test ahora especifica el ámbito completo en vez de depender de que exista una única cotización en la mesa.
- Revalidar ambos workflows antes de dar el hito por cerrado.

## Corrección del test de consulta desprendida

- `9ae627e` y `96700c7`: el test anterior esperaba que una consulta tardía lanzara una segunda sentencia tras el cierre del callback, aunque `createPostgresTransaction` debe prohibirlo. La espera por esa segunda sentencia podía quedar sin resolver. El test ahora comprueba expresamente `transaction_scope_closed`, ausencia de `SELECT second`, `ROLLBACK` y descarte del cliente, y consume la promesa rechazada sin rechazo no gestionado.
- La protección de producción del adaptador no cambia. Verificar CI del último SHA antes de declarar este test acreditado.

## Idempotencia entre cestas del mismo cliente

- `14061da` amplía la prueba SQL transaccional: el mismo actor, mesa, sesión y visita utiliza `request-atomic` en dos cestas diferentes. Deben persistir ledger, cotización y pedido independientes, y conservar su línea de cocina. La prueba comprueba además el caso anterior de actor diferente: tres entradas con la misma clave, tres órdenes distintas, sin mezclar alcances.
- Se ejecuta únicamente en PostgreSQL 17 desechable y revierte toda la fixture; no altera permisos ni rutas. Comprobar CI del commit documental antes de cerrar el hito.

## Corrección CI para fixture de cesta adicional

- Sabora CI `39827769584` falló en PostgreSQL 17: el bloque `basket_isolation` seleccionaba `item_id INTO STRICT` desde varias cotizaciones de un mismo actor y cesta (la prueba de idempotencia admite múltiples cotizaciones históricas). El fallo fue `query returned more than one row`.
- `553226f` limita la selección del identificador del ítem a una fila de fixture, sin reducir las comprobaciones de independencia entre cestas. Revisar los workflows del nuevo SHA.

## Hito de endurecimiento del smoke de idempotencia

- CI `39828013256` y Bootstrap `39828013354` fallaron en PostgreSQL 17 con `query returned more than one row`: tras insertar una cotización de `basket-other`, el bloque `acceptance_integrity` seguía seleccionando por actor y visita sin restringir cesta.
- `8eeb1de` fija explícitamente `basket_id='basket-atomic'` en las cuatro consultas originales que recuperan cotizaciones para los bloques de atomicidad, duplicados, aislamiento de actor y consistencia de aceptación.
- `4b2e773` añade un test Node rápido que exige ese alcance en las cuatro fixtures, conserva las dos pruebas de aislamiento y verifica el `ROLLBACK` final. Evita depender exclusivamente del smoke PostgreSQL más costoso para detectar este error.
- Revalidar Sabora CI y Bootstrap en el último HEAD antes de acreditar el hito. Sin despliegue, migración operativa ni cambios de permisos.

## Gate verde y endurecimiento de consultas transaccionales

- El HEAD `b7fea5d` superó Sabora CI `39839770353` y Bootstrap `39839770350`, ambos SUCCESS. La regresión de múltiples cotizaciones y cestas queda acreditada en CI.
- `1470127`: el adaptador de transacciones candidato acepta únicamente texto SQL no vacío y un array de parámetros; rechaza objetos de configuración del driver y contenedores de parámetros no válidos antes de acceder al cliente. Mantiene el cierre de ámbito y la semántica existente de rollback.
- `f6e8f79`: regresiones Node para llamadas inválidas, consulta parametrizada válida, ausencia de SQL enviado al driver y rollback en error. No se habilitan rutas, roles, grants ni conexiones operativas.
- Revalidar ambos workflows sobre el último HEAD.

## Snapshot de parámetros SQL en el límite de transacción

- `b513092`: el adaptador transaccional copia el array de parámetros antes de diferir la llamada al cliente PostgreSQL. Impide que una mutación posterior del array por el llamador altere los parámetros posicionales efectivamente enviados al driver.
- `eb896e2`: test que muta el array inmediatamente tras solicitar la consulta y comprueba que el driver recibe la copia original; añade regresión de revocación de consulta retenida tras COMMIT.
- El candidato continúa desconectado de HTTP y de cualquier pool operativo; no cambia los permisos ni los contratos de migración. Validación de CI pendiente sobre el último HEAD.

## Parámetros temporales de PostgreSQL

- `5058c63`: la copia del array de parámetros transaccionales incluye una copia por valor de los objetos `Date`, que el escritor de pedidos utiliza para `first_confirmed_at`. Se rechazan fechas inválidas antes de enviar SQL al driver; la transacción realiza rollback.
- `c6a48d0`: pruebas de mutación posterior del objeto `Date` y rechazo de `Invalid Date`, además de las pruebas anteriores de array y cierre de ámbito.
- Sin dependencia `pg` nueva, sin conexiones operativas y sin activar el candidato en HTTP. Validación CI requerida en el nuevo HEAD.

## Tipos permitidos en bindings SQL del candidato

- `a5f17ae`: el límite de transacción admite parámetros primitivos compatibles con las consultas actuales y `Date` copiados por valor. Rechaza objetos arbitrarios, arrays anidados, Buffer, funciones, símbolos, bigint, números no finitos y fechas inválidas antes de invocar el driver. Evita referencias mutables y serialización implícita no auditada.
- `b772513`: prueba Node de rechazo de estos tipos sin emitir SQL y de aceptación de valores primitivos; se conservan las regresiones de rollback y snapshots.
- No se modifican rutas HTTP, esquemas, grants ni pools. Ejecutar y verificar CI sobre el último HEAD.

## Regresión de arrays de parámetros SQL

- El HEAD `3a10e7f` superó Sabora CI `39840843270` y Bootstrap `39840843239` (SUCCESS).
- `7c08f69`: antes de copiar los parámetros, el adaptador valida array denso, prototipo estándar, propiedades propias exclusivamente indexadas y descriptores de datos; limita a 256 bindings. No ejecuta getters de elementos ni acepta propiedades adicionales.
- `786b264`: tests con array accessor-backed, sparse, propiedades inesperadas, prototipo cambiado y tamaño excesivo. Verifican cero getters ejecutados y cero consultas del driver para inputs rechazados.
- Candidato desconectado de HTTP y roles operativos. Revalidar workflows sobre el nuevo HEAD.

## Límite de texto y precisión en parámetros SQL

- `10d7d9c`: el adaptador candidato rechaza parámetros string superiores a 65536 bytes UTF-8 o con byte nulo, y valores numéricos no enteros seguros. Las cantidades monetarias y contadores del candidato se representan como enteros seguros o cadenas decimales controladas; no se admiten conversiones numéricas ambiguas.
- `e36c779`: pruebas de UTF-8 multibyte, NUL, enteros fuera de rango, fracciones y aceptación de los límites válidos.
- El HEAD previo `3a10e7f` tenía ambos workflows verdes; el gate del HEAD posterior debe verificarse de nuevo. No se habilitan rutas, roles ni conexiones operativas.

## Límite del texto SQL del adaptador candidato

- `a28135b`: el texto de cada sentencia SQL queda limitado a 65536 bytes UTF-8 y no admite NUL; rechaza antes del driver tanto SQL vacío como texto malformado o sobredimensionado. El control es adicional a la validación de parámetros.
- `82d4fbe`: regresión de SQL con NUL, texto multibyte por encima del presupuesto y consulta válida.
- Sigue pendiente la integración real Node–PostgreSQL 17, autorización del rol runtime mínimo y los contratos HTTP. Ninguna de estas defensas de transporte autoriza conectar el candidato a producción.

## Contexto de confianza en los lectores del catálogo

- `b463100`: los tres lectores transaccionales del catálogo (idempotencia, publicación y cotización) verifican primero que el contexto autorizado sea un registro simple con propiedades de datos propias, sin getters, símbolos, herencia ni claves peligrosas. Evita ejecutar getters al consultar los campos de ámbito.
- `be7bc39`: nueve rechazos negativos (tres contextos por tres lectores), exigiendo cero getters ejecutados y cero sentencias SQL.
- Sin nuevas conexiones ni permisos. La procedencia de `authorized/canOrder` sigue siendo el bloqueo de visita del backend; no se admiten flags suministrados por el cliente.

## Protección de argumentos del escritor compuesto

- El HEAD `438b867` pasó Sabora CI `39845740607` y Bootstrap `39845740605`, ambos SUCCESS.
- `fa96ad6`: la capa de composición `catalog-confirmation-repository.mjs` verifica que tanto los argumentos de persistencia como su contexto autorizado sean registros simples con propiedades de datos propias, sin getters, símbolos ni prototipos heredados. Esta validación sucede antes de invocar el escritor.
- `749d0e3`: regresión que introduce getters hostiles en `requestKey` y `context.authorized`, más un objeto con prototipo heredado; exige cero ejecuciones de getters y cero invocaciones de persistencia.
- El candidato permanece desconectado de HTTP, roles de runtime y Supabase operativo. Verificar CI sobre el nuevo HEAD antes de acreditar este bloque.

## Evidencia económica en la composición

- `80ba803`: la capa de composición verifica que el objeto de evidencia económica sea un registro simple sin accessors, propiedades heredadas ni claves de prototipo peligrosas, antes de entregar el control al escritor económico que efectúa las comprobaciones de contenido y aritmética.
- `3ae7902`: pruebas negativas de getters, herencia y clave `__proto__` en la evidencia, sin invocar el adaptador de persistencia.
- La validación del contenedor no sustituye el recálculo económico ni la comprobación de origen del catálogo publicado. No se habilita HTTP, grants ni conexión a Supabase operativo.
